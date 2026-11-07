import { severityValue } from './parse.js';

function toRegex(value, field) {
  if (value == null) return null;
  if (value instanceof RegExp) return value;
  try {
    return new RegExp(value, 'i');
  } catch (err) {
    throw new Error(`Ogiltigt regex i "${field}": ${value} (${err.message})`);
  }
}

export function compileRules(rules = []) {
  return rules
    .filter((r) => r.enabled !== false)
    .map((r, i) => {
      if (!r.match && !r.program) {
        throw new Error(`Regel ${r.name ?? i} saknar både "match" och "program"`);
      }
      return {
        name: r.name ?? `regel-${i + 1}`,
        match: toRegex(r.match, `${r.name}.match`),
        exclude: toRegex(r.exclude, `${r.name}.exclude`),
        program: toRegex(r.program, `${r.name}.program`),
        maxSeverity: r.severity != null ? severityValue(r.severity) : null,
        title: r.title ?? r.name ?? 'Routerhändelse',
        body: r.body ?? '{message}',
        priority: r.priority ?? 'default',
        tags: r.tags ?? [],
        cooldown: Number(r.cooldown ?? 60),
      };
    });
}

// Reglerna matchas mot "program: meddelande" så att t.ex. "WAN_Connection: ..." fungerar.
const textOf = (entry) => (entry.program ? `${entry.program}: ${entry.message}` : entry.message);

export function matchRule(rule, entry) {
  if (rule.program && !rule.program.test(entry.program ?? '')) return null;
  if (rule.maxSeverity != null && entry.severity > rule.maxSeverity) return null;
  if (rule.exclude && rule.exclude.test(textOf(entry))) return null;
  if (!rule.match) return { groups: {} };
  const m = rule.match.exec(textOf(entry));
  if (!m) return null;
  return { groups: m.groups ?? {}, captures: m.slice(1) };
}

export function render(template, entry, result) {
  return template.replace(/\{(\w+)\}/g, (all, key) => {
    if (result?.groups?.[key] != null) return result.groups[key];
    if (/^\d+$/.test(key) && result?.captures?.[Number(key) - 1] != null) {
      return result.captures[Number(key) - 1];
    }
    if (entry[key] != null) return String(entry[key]);
    return all;
  });
}

export class RuleEngine {
  constructor(rules, { now = () => Date.now() } = {}) {
    this.rules = compileRules(rules);
    this.now = now;
    this.lastFired = new Map();
  }

  // Returnerar en lista notiser som ska skickas för en loggrad.
  evaluate(entry) {
    const out = [];
    for (const rule of this.rules) {
      const result = matchRule(rule, entry);
      if (!result) continue;
      const t = this.now();
      const last = this.lastFired.get(rule.name);
      if (last != null && t - last < rule.cooldown * 1000) continue;
      this.lastFired.set(rule.name, t);
      out.push({
        rule: rule.name,
        title: render(rule.title, entry, result),
        body: render(rule.body, entry, result),
        priority: rule.priority,
        tags: rule.tags,
      });
    }
    return out;
  }
}
