# AndroGRAM

Premium landing + Firebase Auth + Telegram Automation + MTProto Automation.

## Features

- **AndroGRAM brand** — dark, modern flagship landing
- **Firebase Authentication** — email/password, session persistence
- **Protected app** — Dashboard, Profile, Telegram Automation, MTProto Automation
- **Telegram Automation** — bot token, live group track (1s), Firebase bot-scoped group registry, broadcast text/photo
- **MTProto Automation** — user phone login (api_id/hash server-only), load owned groups, bulk-add bot as member only (no admin; skip already joined)

## Pages

| Page | Access |
|------|--------|
| `index.html` | Public landing |
| `login.html` / `signup.html` | Public auth |
| `dashboard.html` | Protected |
| `profile.html` | Protected |
| `telegram.html` | Protected — Bot API automation |
| `mtproto.html` | Protected — User account (MTProto) automation |

## MTProto notes

- `api_id` / `api_hash` are **server-only** via env: `TG_API_ID`, `TG_API_HASH` (from [my.telegram.org](https://my.telegram.org))
- Browser only sends phone number + login code (+ optional 2FA password)
- Session string is stored in the browser after login for subsequent calls
- Owned groups = dialogs where `entity.creator === true`
- Add-bot flow invites the bot, promotes to admin, skips if already admin
- Bulk work is batched (10 groups per API call) for Vercel time limits

## Firebase usage

- **Auth** + **Firestore** (bot automation data)
- Project: `abedin-eb675`
- Bot groups (shared by bot token / any AndroGRAM account): `bots/{botId}/groups/{chatId}`
- User connection: `users/{uid}/telegramBots/{botId}`
- Live track: client polls Telegram `getUpdates` every 1s and auto-saves new groups to Firebase

## Deploy

Production: **Vercel** (static site + `/api/telegram` + `/api/mtproto`).

```bash
npm install
vercel --prod
```

Optional env on Vercel:

- `TG_API_ID`
- `TG_API_HASH`
