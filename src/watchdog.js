// Dödmansvakt: om ingen loggrad kommit på maxSilenceSeconds larmar vi, och vi meddelar när loggen kommer tillbaka.
export class Watchdog {
  constructor({ host, maxSilenceSeconds = 300, now = () => Date.now() } = {}) {
    this.hostRe = host ? new RegExp(host, 'i') : null;
    this.maxSilence = maxSilenceSeconds * 1000;
    this.now = now;
    this.lastSeen = now();
    this.silent = false;
    this.silentSince = null;
  }

  seen(entry) {
    if (this.hostRe && !this.hostRe.test(entry.hostname ?? '')) return;
    this.lastSeen = this.now();
  }

  // Returnerar händelser: { type: 'silent' | 'back', seconds }
  check() {
    const t = this.now();
    const quiet = t - this.lastSeen;
    if (!this.silent && quiet > this.maxSilence) {
      this.silent = true;
      this.silentSince = this.lastSeen;
      return [{ type: 'silent', seconds: quiet / 1000 }];
    }
    if (this.silent && quiet <= this.maxSilence) {
      this.silent = false;
      return [{ type: 'back', seconds: (this.lastSeen - this.silentSince) / 1000 }];
    }
    return [];
  }
}
