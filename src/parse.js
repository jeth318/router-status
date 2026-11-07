// Parser för BSD-syslog (RFC 3164), som Asuswrt/Asuswrt-Merlin skickar,
// med fallback för RFC 5424.

const SEVERITIES = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];

export function severityName(n) {
  return SEVERITIES[n] ?? 'info';
}

export function severityValue(name) {
  if (typeof name === 'number') return name;
  const i = SEVERITIES.indexOf(String(name).toLowerCase());
  return i === -1 ? 7 : i;
}

// Programnamnet får innehålla mellanslag, eftersom ASUS loggar t.ex. "WAN Connection:" och "Samba Server:".
const RFC3164 = /^(?:([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s+)?(?:([^\s:]+)\s+)?([^:\[\]]{1,40}?)(?:\[(\d+)\])?:\s?(.*)$/s;
const RFC5424 = /^1\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(-|\[.*?\])\s?(.*)$/s;

export function parseSyslog(raw, receivedAt = new Date()) {
  const line = raw.toString('utf8').replace(/[\r\n\0]+$/, '');
  let rest = line;
  let facility = 1;
  let severity = 6;

  const pri = /^<(\d{1,3})>/.exec(rest);
  if (pri) {
    const p = Number(pri[1]);
    facility = p >> 3;
    severity = p & 7;
    rest = rest.slice(pri[0].length);
  }

  const base = { raw: line, facility, severity, level: severityName(severity), receivedAt };

  const m5 = RFC5424.exec(rest);
  if (m5) {
    return {
      ...base,
      timestamp: m5[1] === '-' ? null : m5[1],
      hostname: m5[2] === '-' ? null : m5[2],
      program: m5[3] === '-' ? null : m5[3],
      pid: m5[4] === '-' ? null : m5[4],
      message: m5[7],
    };
  }

  const m = RFC3164.exec(rest);
  if (m) {
    return {
      ...base,
      timestamp: m[1] ?? null,
      hostname: m[2] ?? null,
      program: m[3],
      pid: m[4] ?? null,
      message: m[5],
    };
  }

  return { ...base, timestamp: null, hostname: null, program: null, pid: null, message: rest };
}

// DDNS-klienten (inadyn) loggar hela requesten inklusive Authorization: Basic <hemlighet>.
// Den får aldrig hamna i logs.jtdev.se eller i en notis.
export function redact(text) {
  return text.replace(/(Authorization:\s*Basic\s+)\S+/gi, '$1[redacted]');
}
