# AndroGRAM

Premium single-page marketing site + Firebase-authenticated workspace.

## Features

- **AndroGRAM brand** — dark, modern flagship landing experience
- **Firebase Authentication** — email/password sign up & log in
- **Protected app area** — Dashboard, Profile (route guards)
- **Session persistence** — stays signed in across reloads
- **Responsive sidebar** — includes “New Project (Coming Soon)”
- **Static frontend** — HTML, CSS, JS only (Firebase client SDK)

## Pages

| Page | Access |
|------|--------|
| `index.html` | Public landing (redirects if signed in) |
| `login.html` / `signup.html` | Public auth |
| `dashboard.html` | Protected |
| `profile.html` | Protected |

## Firebase

- Project: `abedin-eb675`
- Web app: AndroGRAM Web
- Provider: Email/Password

If auth fails with `auth/unauthorized-domain` on a custom host, add the domain under  
Firebase Console → Authentication → Settings → Authorized domains.

## Local preview

Serve over HTTP (modules require a server):

```bash
npx serve .
```

Open `http://localhost:3000` (or the port shown).

## Deploy

Static deploy to **Vercel** or Firebase Hosting.
