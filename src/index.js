import dgram from 'node:dgram';
import net from 'node:net';
import http from 'node:http';
import { loadConfig } from './config.js';
import { parseSyslog } from './parse.js';
import { RuleEngine } from './rules.js';
import { createNotifier } from './notifiers.js';
import { createForwarder } from './forwarders.js';
import { SubscriptionStore } from './subscriptions.js';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

const configPath = process.env.CONFIG_PATH ?? 'config/config.yaml';
const config = loadConfig(configPath);
const engine = new RuleEngine(config.rules);
const store = new SubscriptionStore(process.env.SUBSCRIPTIONS_FILE ?? 'data/subscriptions.json');
const notify = createNotifier(config.notify, store);
const forwarder = createForwarder(config.forward);

const stats = { received: 0, forwarded: 0, forwardErrors: 0, notified: 0, notifyErrors: 0, startedAt: new Date() };
const recent = [];

async function handle(raw) {
  const entry = parseSyslog(raw);
  stats.received++;
  recent.push(entry.raw);
  if (recent.length > 50) recent.shift();
  // Varje rad skrivs till stdout som JSON. På VPS:en plockar Vector upp
  // containerloggen och skickar den till VictoriaLogs, så hela loggen syns på logs.jtdev.se.
  if (config.stdout) {
    console.log(
      JSON.stringify({
        _time: entry.receivedAt.toISOString(),
        source: 'asus-router',
        level: entry.level,
        host: entry.hostname,
        program: entry.program,
        pid: entry.pid,
        message: entry.message,
      }),
    );
  }

  forwarder.send(entry).then(
    () => stats.forwarded++,
    (err) => {
      stats.forwardErrors++;
      console.error(`[forward] ${err.message}`);
    },
  );

  for (const n of engine.evaluate(entry)) {
    try {
      await notify(n);
      stats.notified++;
      console.log(`[notis] ${n.rule}: ${n.title}`);
    } catch (err) {
      stats.notifyErrors++;
      console.error(`[notis] ${n.rule} misslyckades: ${err.message}`);
    }
  }
}

const { host, udpPort, tcpPort, httpPort } = config.listen;

if (udpPort) {
  const udp = dgram.createSocket('udp4');
  udp.on('message', (msg) => handle(msg));
  udp.bind(udpPort, host, () => console.log(`Lyssnar på syslog UDP ${host}:${udpPort}`));
}

if (tcpPort) {
  net
    .createServer((sock) => {
      let buf = '';
      sock.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.trim()) handle(line);
        }
      });
    })
    .listen(tcpPort, host, () => console.log(`Lyssnar på syslog TCP ${host}:${tcpPort}`));
}

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
};
const publicDir = new URL('../public/', import.meta.url);
const accessToken = process.env.ACCESS_TOKEN ?? '';

function authorized(req) {
  if (!accessToken) return false; // utan ACCESS_TOKEN är skrivande endpoints avstängda
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(accessToken);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error('för stor body');
  }
  return JSON.parse(body || '{}');
}

if (httpPort) {
  http
    .createServer(async (req, res) => {
      const send = (code, body, type = 'text/plain; charset=utf-8') => {
        res.writeHead(code, { 'Content-Type': type });
        res.end(body);
      };
      const path = req.url.split('?')[0];
      try {
        if (req.method === 'GET' && STATIC[path]) {
          const [file, type] = STATIC[path];
          return send(200, fs.readFileSync(new URL(file, publicDir)), type);
        }
        if (req.method === 'GET' && path === '/health') {
          return send(200, JSON.stringify({ ok: true, ...stats, devices: store.list().length, rules: engine.rules.map((r) => r.name) }), 'application/json');
        }
        if (req.method === 'GET' && path === '/api/vapid-key') {
          return send(200, JSON.stringify({ publicKey: config.notify.webpush?.publicKey ?? null }), 'application/json');
        }
        if (req.method === 'POST' && path.startsWith('/api/')) {
          if (!authorized(req)) return send(401, 'fel åtkomstkod\n');
          if (path === '/api/subscribe') {
            store.add(await readJson(req));
            return send(200, 'ok\n');
          }
          if (path === '/api/unsubscribe') {
            store.remove((await readJson(req)).endpoint);
            return send(200, 'ok\n');
          }
          if (path === '/api/test') {
            await notify({ rule: 'test', title: 'Router Status', body: 'Testnotis, det funkar!', priority: 'default', tags: [] });
            return send(200, 'skickad\n');
          }
        }
        send(404, 'hittades inte\n');
      } catch (err) {
        send(500, err.message + '\n');
      }
    })
    .listen(httpPort, () => console.log(`HTTP på :${httpPort}`));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    forwarder.close();
    process.exit(0);
  });
}
