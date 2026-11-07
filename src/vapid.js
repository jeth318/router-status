import * as webpush from 'web-push';

// npm run vapid: skriver ut ett nytt nyckelpar till .env.
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
