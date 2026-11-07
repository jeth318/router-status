import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSyslog } from '../src/parse.js';

test('parsar ASUS BSD-syslog med pid', () => {
  const e = parseSyslog('<30>Nov  7 19:01:02 RT-AX58U-1234 dnsmasq-dhcp[1234]: DHCPACK(br0) 192.168.50.10 aa:bb:cc:dd:ee:ff iphone');
  assert.equal(e.severity, 6);
  assert.equal(e.facility, 3);
  assert.equal(e.hostname, 'RT-AX58U-1234');
  assert.equal(e.program, 'dnsmasq-dhcp');
  assert.equal(e.pid, '1234');
  assert.equal(e.message, 'DHCPACK(br0) 192.168.50.10 aa:bb:cc:dd:ee:ff iphone');
});

test('parsar rad utan hostname', () => {
  const e = parseSyslog('<28>Nov  7 19:01:02 WAN_Connection: WAN was exceptionally disconnected.');
  assert.equal(e.level, 'warning');
  assert.equal(e.program, 'WAN_Connection');
  assert.equal(e.message, 'WAN was exceptionally disconnected.');
});

test('parsar RFC 5424', () => {
  const e = parseSyslog('<34>1 2026-11-07T19:00:00Z router sshd 99 - - Failed password');
  assert.equal(e.program, 'sshd');
  assert.equal(e.message, 'Failed password');
  assert.equal(e.level, 'crit');
});

test('klarar skräp utan PRI', () => {
  const e = parseSyslog('bara text utan format');
  assert.equal(e.message.length > 0, true);
});
