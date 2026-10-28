self-hosted social network

## running with Docker
```
docker compose up -d
```

That's it: the database is created and the schema applied automatically. The app listens on port `7777` at http://localhost:7777.

To customize settings, copy `.env.example` to `.env` (docker compose picks it up automatically) and edit it:

| variable              | default                 | description                                                   |
| --------------------- | ----------------------- | ------------------------------------------------------------- |
| `PORT`                | `7777`                  | port the app listens on                                       |
| `PUBLIC_URL`          | `http://localhost:PORT` | public URL of your instance (links, social cards, CSRF check) |
| `DISCORD_WEBHOOK_URL` | empty                   | optional, new posts are announced to this webhook             |
| `POSTGRES_PASSWORD`   | `postgres`              | only used the first time the database is created              |

Data lives in the `postgres-data` and `avatars` docker volumes. You should put the app behind a reverse proxy like [caddy](https://caddyserver.com/docs/quick-starts/caddyfile) or [nginx](https://gist.github.com/journeymanavi/dc7df599dd7618a12528c553ea47b1b1) to add at least https and gzip compression.

## development
```
bun install
cp .env.example .env # set DATABASE_URL to a postgres instance
bun initdb.ts
bun run dev
```
