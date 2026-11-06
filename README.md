self-hosted social network

## running with Docker
```
docker compose up -d
```

That's it: the database is created and migrated automatically on every start. The app listens on port `7777` at http://localhost:7777 (only on localhost by default, see `BIND_ADDRESS`). Set `SIGNUP_PASSWORD` to allow registrations.

To customize settings, copy `.env.example` to `.env` (docker compose picks it up automatically) and edit it:

| variable              | default                 | description                                                   |
| --------------------- | ----------------------- | ------------------------------------------------------------- |
| `PORT`                | `7777`                  | port the app listens on                                       |
| `PUBLIC_URL`          | `http://localhost:PORT` | public URL of your instance (links, social cards, CSRF check); baked into the image, so rebuild with `docker compose up -d --build` after changing it |
| `DISCORD_WEBHOOK_URL` | empty                   | optional, new posts are announced to this webhook             |
| `SIGNUP_PASSWORD`     | empty                   | password required to register; registration is closed if empty |
| `ADDRESS_HEADER`      | empty                   | header with the client IP behind a proxy (enables per-IP rate limits) |
| `BIND_ADDRESS`        | `127.0.0.1`             | interface the port is published on                            |
| `POSTGRES_PASSWORD`   | `postgres`              | database password (URL-safe characters only); only applied when the database volume is first created |
| `POSTGRES_PORT`       | `5432`                  | host port of the database in `docker-compose.dev.yaml` (not published in the main compose file) |

Data lives in the `postgres-data`, `avatars` and `uploads` docker volumes (`uploads` holds the images attached to posts: up to 5 per post, 10MB each; PNG, JPEG, GIF, WebP, AVIF, BMP, ICO and SVG, all re-encoded to WebP and scaled down to 2048px; avatars become 512px WebP squares). You should put the app behind a reverse proxy like [caddy](https://caddyserver.com/docs/quick-starts/caddyfile) or [nginx](https://gist.github.com/journeymanavi/dc7df599dd7618a12528c553ea47b1b1) to add at least https and gzip compression.

## accounts and identities
- **Switching accounts:** up to 5 accounts can be signed in on one browser. Use the avatar menu in the header to switch, and *Sign in to another account* to add one.
- **Identities:** extra profiles that belong to an account and have no email or password (up to 10 per account). Create and delete them at `/accounts`. They post, like and get notifications on their own, and the owning account is never shown publicly. Deleting an identity also deletes its posts. An identity can be shared with up to 10 other accounts (*Share* at `/accounts`): they can switch to it and use it like you do, and get its notifications on their devices, but only the owner can delete it or change who it is shared with. They can give it back with *Leave*.
- **Passkeys:** optional. Add them at `/settings` (avatar menu → *Settings*) to sign in with a fingerprint, face, screen lock or security key instead of the password, which keeps working either way. Passkeys belong to the account, not its identities, and are bound to the hostname of `PUBLIC_URL`, so changing the domain invalidates them.

## moderation
There are three roles: users, mods and admins.
- **Mods** delete posts and replies, ban and mute users, and unban and unmute them from the panel at `/admin`. Banned users are signed out and can't sign in; muted users can't post, reply or send messages. Bans and mutes apply to the whole account, identities included: a muted owner's shared identities are muted for everyone using them, and a banned owner's ones stop working.
- **Admins** can do everything a mod can, and also reset passwords and make users mods (or remove them) from `/admin`.
- Staff only act on people ranked below them: mods on users, admins on users and mods. Nobody moderates themselves.

Admins are created from the command line, so there is always a way in:
```
bun admin.ts <username>             # make an account an admin
bun admin.ts <username> --revoke    # back to a regular user
docker compose exec web bun admin.ts <username>
```

## development
```
bun install
cp .env.example .env # set DATABASE_URL to a postgres instance
bun run db:migrate
bun run dev
```

## database
The schema lives in `src/lib/server/db/schema.ts` and is managed with [drizzle](https://orm.drizzle.team) migrations (the generated SQL is in `drizzle/`). Pending migrations are applied every time the container starts, or by hand with `bun run db:migrate`. Databases created before migrations were introduced are detected and picked up automatically.

To change the schema, edit `schema.ts`, then run `bun run db:generate` and commit the new files in `drizzle/`. For things drizzle can't model (triggers, functions, data fixes) use `bunx drizzle-kit generate --custom --name <name>` and write the SQL by hand, like `drizzle/0001_notification_triggers.sql`.
