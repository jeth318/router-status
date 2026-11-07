# router-status

Liten tjänst som tar emot syslog från en ASUS-router (RT-AX58U), skickar **Web Push (VAPID)**-notiser till mobilen vid valda loggevents, och låter hela loggen ligga kvar på logs.jtdev.se.

```
RT-AX58U ──syslog/UDP 514──► router-status ──stdout (JSON)──► Vector ──► VictoriaLogs ──► logs.jtdev.se
                                  │
                                  └─ regler matchar ──► Web Push ──► mobilen
```

Varje loggrad skrivs som JSON på containerns stdout, så den plockas upp av samma Vector/VictoriaLogs som övriga appar. Notiserna är bara ett tillägg ovanpå.

## Kom igång (på VPS:en)

```bash
cp config/config.example.yaml config/config.yaml   # anpassa regler
cp .env.example .env
npm ci && npm run vapid                             # klistra in nycklarna i .env
openssl rand -hex 24                                # -> ACCESS_TOKEN i .env
docker compose up -d --build
```

1. **Router:** Administration → System Log → *Remote Log Server* = VPS:ens IP, port 514. Öppna 514/udp i brandväggen, helst bara från hemmets IP.
2. **Caddy:** lägg till t.ex. `router-status.jtdev.se { reverse_proxy router-status:8080 }` (containern måste dela nätverk med Caddy) eller proxa till `127.0.0.1:8081`. Web Push kräver https.
3. **Mobilen:** öppna sidan, skriv åtkomstkoden, tryck *Aktivera notiser* och sedan *Skicka testnotis*. På iPhone måste sidan först läggas på hemskärmen.

## Regler

Se `config/config.example.yaml`: regex mot `program: meddelande`, severity, cooldown, prioritet och mallar som `{ip}` från namngivna grupper. Reglerna i exemplet är gissningar på ASUS-loggtexter, så justera dem när du sett riktiga rader i logs.jtdev.se.

## Utveckling

`npm test`, `npm start` (läser `config/config.yaml`, eller `CONFIG_PATH`).
