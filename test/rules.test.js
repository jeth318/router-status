import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';
import { parseSyslog } from '../src/parse.js';
import { RuleEngine } from '../src/rules.js';

const example = YAML.parse(fs.readFileSync(new URL('../config/config.example.yaml', import.meta.url), 'utf8'));

function fire(line, engine = new RuleEngine(example.rules)) {
  return engine.evaluate(parseSyslog(line)).map((n) => n.rule);
}

test('WAN nere och uppe', () => {
  assert.deepEqual(fire('<28>Nov  7 19:01:02 RT-AX58U WAN_Connection: WAN was exceptionally disconnected.'), ['wan-nere']);
  assert.deepEqual(fire("<28>Nov  7 19:01:02 RT-AX58U WAN_Connection: ISP's DHCP did not function properly."), ['wan-nere']);
  assert.deepEqual(fire('<30>Nov  7 19:01:02 RT-AX58U WAN_Connection: WAN was restored.'), ['wan-uppe']);
});

test('misslyckad inloggning med ip', () => {
  const engine = new RuleEngine(example.rules);
  const [n] = engine.evaluate(parseSyslog("<38>Nov  7 19:01:02 RT-AX58U dropbear[555]: Bad password attempt for 'admin' from 1.2.3.4:5555"));
  assert.equal(n.rule, 'misslyckad-inloggning');
  assert.match(n.body, /1\.2\.3\.4/);
});

test('vanliga rader ger ingen notis', () => {
  assert.deepEqual(fire('<30>Nov  7 19:01:02 RT-AX58U dnsmasq-dhcp[1]: DHCPACK(br0) 192.168.50.10 aa:bb:cc:dd:ee:ff iphone'), []);
  assert.deepEqual(fire('<30>Nov  7 19:01:02 RT-AX58U wlceventd: eth6: Auth AA:BB:CC:DD:EE:FF, status: Successful (0)'), []);
});

test('kritisk nivå larmar', () => {
  assert.deepEqual(fire('<2>Nov  7 19:01:02 RT-AX58U kernel: something bad'), ['allvarliga-fel']);
});

test('roamast på emerg ger inget larm (riktig logg från RP-AX58)', () => {
  assert.deepEqual(fire('<24>Nov  7 19:53:28 RP-AX58-1DF0 roamast: [EXAP]Deauth old sta in 1 1: 9A:61:6C:C3:3D:38'), []);
  assert.deepEqual(fire('<24>Nov  7 19:53:28 RP-AX58-1DF0 roamast: wl1.1: disconnect weak signal strength station [9a:61]'), []);
});

test('riktiga vardagsrader ger inget larm', () => {
  for (const l of [
    '<30>Nov  7 19:53:27 RT-AX58U dnsmasq-dhcp[7779]: DHCPACK(br0) 10.0.0.99 9a:61:6c:c3:3d:38 iPhone',
    '<30>Nov  7 19:53:27 RT-AX58U crond[2066]: USER jeth pid 416 cmd check_wgc_ep',
    '<29>Nov  7 19:53:27 RT-AX58U wlceventd: wlceventd_proc_event(722): eth3: Assoc 9A:61:6C:C3:3D:38, status: Successful (0), rssi:-60',
    '<28>Nov  7 19:50:12 RT-AX58U miniupnpd[5613]: HTTP Connection from 10.0.0.47 closed unexpectedly',
  ]) assert.deepEqual(fire(l), [], l);
});

test('cooldown och mallar', () => {
  let t = 0;
  const engine = new RuleEngine(
    [{ name: 'x', match: 'user (?<u>\\w+)', title: 'Hej {u}', body: '{program}: {message}', cooldown: 10 }],
    { now: () => t },
  );
  const e = parseSyslog('<30>Nov  7 19:01:02 h prog: user kalle');
  const [n] = engine.evaluate(e);
  assert.equal(n.title, 'Hej kalle');
  assert.equal(n.body, 'prog: user kalle');
  t = 5000;
  assert.equal(engine.evaluate(e).length, 0);
  t = 11000;
  assert.equal(engine.evaluate(e).length, 1);
});

test('avstängda regler ignoreras', () => {
  const engine = new RuleEngine([{ name: 'x', match: '.', enabled: false }]);
  assert.equal(engine.rules.length, 0);
});
