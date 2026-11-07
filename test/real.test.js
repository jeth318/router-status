import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { parseSyslog, redact } from '../src/parse.js';
import { RuleEngine } from '../src/rules.js';
import { Watchdog } from '../src/watchdog.js';

const cfg = YAML.parse(fs.readFileSync(new URL('../config/config.example.yaml', import.meta.url), 'utf8'));
const H = 'RT-AX58U-V2-D29369F-C';
const fire = (l) => new RuleEngine(cfg.rules).evaluate(parseSyslog(l)).map((n) => n.rule);

test('programnamn med mellanslag parsas (riktiga ASUS-rader)', () => {
  const e = parseSyslog(`<30>Oct 22 17:05:33 ${H} WAN Connection: WAN was restored.`);
  assert.equal(e.hostname, H);
  assert.equal(e.program, 'WAN Connection');
  assert.equal(e.message, 'WAN was restored.');
  assert.equal(parseSyslog(`<30>Oct 22 17:05:44 ${H} Samba Server: smb daemon is stopped`).program, 'Samba Server');
  const k = parseSyslog(`<6>Oct 22 17:05:12 ${H} kernel: eth0 (Int switch port: 0) (Logical Port: 0) Link DOWN.`);
  assert.equal(k.program, 'kernel');
  assert.match(k.message, /Link DOWN/);
});

test('WAN återställt ger en notis, link up ger ingen', () => {
  assert.deepEqual(fire(`<30>Oct 22 17:05:33 ${H} WAN Connection: WAN was restored.`), ['wan-uppe']);
  assert.deepEqual(fire(`<30>Oct 22 17:05:16 ${H} WAN Connection: WAN(0) link up.`), []);
});

test('ny publik IP', () => {
  const e = parseSyslog(`<30>Oct 22 17:05:57 ${H} inadyn[1667]: Update forced for alias x.asuscomm.com, new IP# 90.232.235.234`);
  const [n] = new RuleEngine(cfg.rules).evaluate(e);
  assert.equal(n.rule, 'ny-publik-ip');
  assert.equal(n.body, '90.232.235.234');
});

test('brus ger inga notiser', () => {
  for (const l of [
    `<30>Oct 22 17:05:47 ${H} BWDPI: force to flush flowcache entries`,
    `<30>Oct 22 17:05:51 ${H} kernel: UDB Core Version: 0.2.20`,
    `<30>Oct 22 15:35:20 ${H} miniupnpd[2536]: upnp_event_process_notify: connect(10.0.0.123:2869): Connection timed out`,
    `<30>Oct 22 17:05:41 ${H} rc_service: udhcpc_wan 32491:notify_rc start_dnsmasq`,
    `<30>Oct 22 15:00:01 ${H} disk_monitor: Got SIGALRM...`,
  ]) assert.deepEqual(fire(l), [], l);
});

test('DDNS-lösenord maskas', () => {
  const r = redact('request<GET /x HTTP/1.0^M Authorization: Basic MTA3QzYxMzI2QTA4OkFB^M Host: ns1');
  assert.doesNotMatch(r, /MTA3QzYx/);
  assert.match(r, /Authorization: Basic \[redacted\]/);
});

test('dödmansvakt larmar vid tystnad och meddelar när loggen kommer tillbaka', () => {
  let t = 0;
  const w = new Watchdog({ host: '^RT-AX58U', maxSilenceSeconds: 300, now: () => t });
  t = 200_000;
  assert.deepEqual(w.check(), []);
  t = 301_000;
  assert.deepEqual(w.check().map((e) => e.type), ['silent']);
  t = 400_000;
  assert.deepEqual(w.check(), []); // larmar bara en gång
  w.seen({ hostname: 'RP-AX58-1DF0' }); // noden räknas inte
  assert.deepEqual(w.check(), []);
  w.seen({ hostname: H });
  assert.deepEqual(w.check().map((e) => e.type), ['back']);
});
