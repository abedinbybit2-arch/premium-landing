# AndroGRAM

Premium landing + Firebase Auth + Telegram Automation (Firestore-backed).

## Features

- **AndroGRAM brand** — dark, modern flagship landing
- **Firebase Authentication** — email/password, session persistence
- **Protected app** — Dashboard, Profile, Telegram Automation
- **Telegram Automation** — connect bot by token, list groups, send text/photo to selected or all groups
- **Firestore** — bots & groups saved per user account and per bot ID (device sync)

## Pages

| Page | Access |
|------|--------|
| `index.html` | Public landing |
| `login.html` / `signup.html` | Public auth |
| `dashboard.html` | Protected |
| `profile.html` | Protected |
| `telegram.html` | Protected — Telegram Automation |

## Firebase usage

- **Auth** + **Firestore** only (no Firebase Hosting required for production)
- Project: `abedin-eb675`
- Data path: `users/{uid}/telegramBots/{botId}/groups/{chatId}`

## Deploy

Production: **Vercel** (static site + `/api/telegram` proxy for Bot API / CORS).
