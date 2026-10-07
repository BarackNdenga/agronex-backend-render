# AGRONEX — Backend Render

## Configuration du service

- **Type** : Web Service
- **Runtime** : Node
- **Build** : `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- **Start** : `node dist/index.js`
- **Health check** : `/healthz`
- **Port** : Render fournit automatiquement `$PORT`

Le serveur écoute sur `0.0.0.0` via Express et ne lance aucune API de paiement.

## Variables obligatoires

Configurer les valeurs réelles dans Render, jamais dans Git :

```text
NODE_ENV=production
CORS_ORIGINS=https://<frontend-vercel>
FRONTEND_URL=https://<frontend-vercel>
AGRONEX_PUBLIC_BASE_URL=https://<backend-render>
DATABASE_URL=...
DRIZZLE_DATABASE_URL=...
JWT_SECRET=...
OAUTH_SERVER_URL=https://api.manus.im
AGRONEX_OWNER_OPEN_ID=...
AGRONEX_ADMIN_EMAILS=admin@example.com,autre-admin@example.com
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
TIKTOK_OAUTH_CLIENT_KEY=...
TIKTOK_OAUTH_CLIENT_SECRET=...
```

`CORS_ORIGINS` peut contenir plusieurs origines séparées par des virgules. Les valeurs doivent être des origines HTTPS exactes, sans slash final.

## Paiements

Les variables et APIs Orange Money, Airtel Money, AfriMoney et M-Pesa restent absentes et désactivées. Le backend ne doit recevoir aucune clé de paiement.

## OAuth

Après avoir obtenu l’URL Render, déclarer :

```text
https://<backend-render>/api/oauth/social/google/callback
https://<backend-render>/api/oauth/social/tiktok/callback
```

L’URL doit être identique à `AGRONEX_PUBLIC_BASE_URL`.
