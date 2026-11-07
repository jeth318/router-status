import fs from 'node:fs';
import path from 'node:path';

// Enkel JSON-fil med push-prenumerationer. Läggs på en Docker-volym så att de överlever omstart.
export class SubscriptionStore {
  constructor(file) {
    this.file = file;
    this.subs = [];
    if (file && fs.existsSync(file)) {
      try {
        this.subs = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        console.error(`[subs] kunde inte läsa ${file}, börjar om`);
      }
    }
  }

  list() {
    return [...this.subs];
  }

  add(sub) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('ogiltig prenumeration');
    this.subs = this.subs.filter((s) => s.endpoint !== sub.endpoint);
    this.subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    this.#save();
  }

  remove(endpoint) {
    const before = this.subs.length;
    this.subs = this.subs.filter((s) => s.endpoint !== endpoint);
    if (this.subs.length !== before) this.#save();
  }

  #save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.subs, null, 2), { mode: 0o600 });
  }
}
