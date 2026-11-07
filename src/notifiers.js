// Push via Web Push (VAPID).
import * as webpush from 'web-push';

const URGENCY = { min: 'very-low', low: 'low', default: 'normal', high: 'high', urgent: 'high', max: 'high' };

// Web Push (VAPID), samma teknik som cartripwatch. Skickar till alla registrerade enheter
// och tar bort prenumerationer som webbläsaren inte längre känner till (404/410).
function webPush(cfg, store) {
  if (!cfg.publicKey || !cfg.privateKey) {
    throw new Error('notify.webpush.publicKey och privateKey krävs (generera med: npm run vapid)');
  }
  const vapid = { subject: cfg.subject ?? 'mailto:admin@example.com', publicKey: cfg.publicKey, privateKey: cfg.privateKey };
  return async (n) => {
    const subs = store.list();
    if (subs.length === 0) throw new Error('inga enheter registrerade för push än (öppna webbsidan på mobilen)');
    const payload = JSON.stringify({ title: n.title, body: n.body, url: cfg.click, tag: n.rule });
    let ok = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, payload, {
            TTL: 60 * 60,
            urgency: URGENCY[n.priority] ?? 'normal',
            vapidDetails: vapid,
          });
          ok++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) store.remove(sub.endpoint);
          else console.error(`[webpush] ${err.statusCode ?? ''} ${err.message}`);
        }
      }),
    );
    if (ok === 0) throw new Error('ingen enhet nåddes');
  };
}

function console_() {
  return async (n) => console.log(`[notis] ${n.title}: ${n.body}`);
}

export function createNotifier(cfg = {}, store) {
  const type = cfg.type ?? 'webpush';
  switch (type) {
    case 'webpush':
      return webPush(cfg.webpush ?? {}, store);
    case 'console':
      return console_();
    default:
      throw new Error(`Okänd notify.type: ${type}`);
  }
}
