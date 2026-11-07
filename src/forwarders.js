// Vidarebefordrar varje loggrad till den befintliga loggservern (logs.jtdev.se)
// så att hela loggen finns kvar där, oavsett vilka regler som matchar.

import dgram from 'node:dgram';
import net from 'node:net';

function syslogUdp(cfg) {
  const socket = dgram.createSocket(cfg.host.includes(':') ? 'udp6' : 'udp4');
  socket.unref();
  return {
    send: (entry) =>
      new Promise((resolve, reject) => {
        const buf = Buffer.from(entry.raw);
        socket.send(buf, cfg.port ?? 514, cfg.host, (err) => (err ? reject(err) : resolve()));
      }),
    close: () => socket.close(),
  };
}

function syslogTcp(cfg) {
  let sock = null;
  let connecting = null;
  const connect = () => {
    if (sock && !sock.destroyed) return Promise.resolve(sock);
    if (connecting) return connecting;
    connecting = new Promise((resolve, reject) => {
      const s = net.connect(cfg.port ?? 514, cfg.host);
      s.once('connect', () => {
        sock = s;
        connecting = null;
        resolve(s);
      });
      s.once('error', (err) => {
        connecting = null;
        reject(err);
      });
      s.on('close', () => {
        if (sock === s) sock = null;
      });
    });
    return connecting;
  };
  return {
    // Octet-counting framing (RFC 6587) om framing: octet, annars LF.
    send: async (entry) => {
      const s = await connect();
      const msg = cfg.framing === 'octet' ? `${Buffer.byteLength(entry.raw)} ${entry.raw}` : `${entry.raw}\n`;
      s.write(msg);
    },
    close: () => sock?.end(),
  };
}

function loki(cfg) {
  if (!cfg.url) throw new Error('forward.loki.url saknas');
  const url = cfg.url.replace(/\/$/, '') + '/loki/api/v1/push';
  const labels = { job: 'asus-router', ...(cfg.labels ?? {}) };
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.username) {
    headers.Authorization = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password ?? ''}`).toString('base64');
  } else if (cfg.token) {
    headers.Authorization = `Bearer ${cfg.token}`;
  }
  if (cfg.tenant) headers['X-Scope-OrgID'] = cfg.tenant;

  return {
    send: async (entry) => {
      const ns = BigInt(entry.receivedAt.getTime()) * 1000000n;
      const stream = { ...labels, level: entry.level };
      if (entry.program) stream.program = entry.program;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ streams: [{ stream, values: [[ns.toString(), entry.raw]] }] }),
      });
      if (!res.ok) throw new Error(`Loki svarade ${res.status}: ${await res.text()}`);
    },
    close: () => {},
  };
}

// Skickar direkt till VictoriaLogs JSON-line-API (om man inte vill gå via stdout/Vector).
function victorialogs(cfg) {
  if (!cfg.url) throw new Error('forward.victorialogs.url saknas');
  const params = new URLSearchParams({
    _msg_field: 'message',
    _time_field: '_time',
    _stream_fields: 'source,host,program',
  });
  const url = `${cfg.url.replace(/\/$/, '')}/insert/jsonline?${params}`;
  const headers = { 'Content-Type': 'application/stream+json' };
  if (cfg.username) {
    headers.Authorization = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password ?? ''}`).toString('base64');
  }
  return {
    send: async (entry) => {
      const body = JSON.stringify({
        _time: entry.receivedAt.toISOString(),
        source: cfg.source ?? 'asus-router',
        level: entry.level,
        host: entry.hostname ?? '',
        program: entry.program ?? '',
        message: entry.message,
      });
      const res = await fetch(url, { method: 'POST', headers, body: body + '\n' });
      if (!res.ok) throw new Error(`VictoriaLogs svarade ${res.status}: ${await res.text()}`);
    },
    close: () => {},
  };
}

function http(cfg) {
  if (!cfg.url) throw new Error('forward.http.url saknas');
  return {
    send: async (entry) => {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.headers ?? {}) },
        body: JSON.stringify({ ...entry, receivedAt: entry.receivedAt.toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP-forward svarade ${res.status}`);
    },
    close: () => {},
  };
}

export function createForwarder(cfg = {}) {
  const type = cfg.type ?? 'none';
  switch (type) {
    case 'none':
      return { send: async () => {}, close: () => {} };
    case 'syslog': {
      const c = cfg.syslog ?? {};
      if (!c.host) throw new Error('forward.syslog.host saknas');
      return (c.protocol ?? 'udp') === 'tcp' ? syslogTcp(c) : syslogUdp(c);
    }
    case 'loki':
      return loki(cfg.loki ?? {});
    case 'victorialogs':
      return victorialogs(cfg.victorialogs ?? {});
    case 'http':
      return http(cfg.http ?? {});
    default:
      throw new Error(`Okänd forward.type: ${type}`);
  }
}
