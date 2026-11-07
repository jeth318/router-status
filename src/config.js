import fs from 'node:fs';
import YAML from 'yaml';

// Ersätter ${VAR} med miljövariabler så att hemligheter kan hållas utanför filen.
function expandEnv(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_, name, def) => process.env[name] ?? def ?? '');
  }
  if (Array.isArray(value)) return value.map(expandEnv);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandEnv(v)]));
  }
  return value;
}

export function loadConfig(path) {
  const text = fs.readFileSync(path, 'utf8');
  const cfg = expandEnv(YAML.parse(text) ?? {});
  return {
    listen: { host: '0.0.0.0', udpPort: 5514, tcpPort: null, httpPort: 8080, ...(cfg.listen ?? {}) },
    stdout: cfg.stdout ?? true,
    notify: cfg.notify ?? { type: 'webpush' },
    forward: cfg.forward ?? { type: 'none' },
    rules: cfg.rules ?? [],
  };
}
