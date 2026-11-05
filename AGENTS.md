# AGENTS.md

Self-hosted social network (posts, replies, likes, mentions, notifications, direct messages, web push). See `README.md` for user-facing docs and the env var table.

## Stack

- **Runtime / package manager: Bun.** Always use `bun`, never `npm`, `yarn` or `pnpm`. Use `bun install`, `bun run <script>`, `bunx <tool>`. The lockfile is `bun.lock`; do not create `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`.
- **Framework: SvelteKit 3 + Svelte 5, using runes.** Adapter: `@sveltejs/adapter-node`. Config lives in `vite.config.ts` (there is no `svelte.config.js`; the SvelteKit options are passed to the `sveltekit()` plugin).
- **Language:** TypeScript (`lang="ts"` in components).
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/vite`), global styles in `src/app.css`.
- **Database:** PostgreSQL 17 with [Drizzle ORM](https://orm.drizzle.team) (`drizzle-orm/postgres-js`, `postgres` driver).
- **Other libs:** `sharp` and `@napi-rs/canvas` (image processing, social cards), `web-push` (push notifications).
- **Deployment:** Docker (`Dockerfile`, `docker-compose.yaml`); `docker-compose.dev.yaml` runs only Postgres for local development.

## Svelte: use runes

Write all new and modified Svelte code with Svelte 5 runes. Do not introduce legacy (Svelte 4) syntax.

- State: `$state`, derived values: `$derived` / `$derived.by`, side effects: `$effect` (prefer `$derived` or event handlers over `$effect` when possible).
- Props: `let { foo, bar = 1 }: Props = $props();` and `$bindable()` for bindable props. No `export let`.
- Events: use event attributes (`onclick={...}`), not `on:click`. Component events are callback props (`oncreated?.(post)`), not `createEventDispatcher` / `on:created`.
- Content projection: `{@render children()}` and snippets (`{#snippet}`), not `<slot>`.
- No `$:` reactive statements; use `$derived` / `$effect`.
- Shared reactive state across components: runes in `.svelte.ts` modules (or the existing stores in `src/lib/store.ts` until migrated).

**Existing code is not fully migrated.** Many components and pages still use legacy syntax (`export let`, `on:`, `createEventDispatcher`, `$store` auto-subscriptions). When you touch such a file in a meaningful way, convert it to runes as part of the change; do not mix legacy and runes syntax within a single component (Svelte forbids it). Don't do drive-by migrations of files you aren't otherwise changing.

SvelteKit conventions: `+page.server.ts` / `+server.ts` for server logic, form actions and `load` functions for data; types come from `./$types`.

## Project layout

- `src/routes/` — pages and API endpoints (`api/**/+server.ts`).
- `src/lib/components/` — Svelte components.
- `src/lib/server/` — server-only code (db, sessions, rate limiting, images, push, realtime…). Never import it from client code.
- `src/lib/server/db/schema.ts` — the database schema (source of truth).
- `src/hooks.server.ts` — session handling and security headers.
- `src/service-worker.ts` — service worker (web push).
- `drizzle/` — generated SQL migrations and snapshots (committed).
- `migrate.ts` — migration runner, executed on every container start.

Import aliases: `#lib` / `#lib/*` map to `src/lib/` (defined in `package.json` `imports`); SvelteKit's `$app/*` and `$app/env/*` modules are also used. Prefer these over deep relative paths.

## Database and migrations

The schema is `src/lib/server/db/schema.ts`; migrations are managed by drizzle-kit. **Never edit the database schema by hand or edit existing migration files.**

1. Edit `src/lib/server/db/schema.ts`.
2. Run `bun run db:generate` to produce a new `drizzle/NNNN_name.sql` plus its `drizzle/meta/NNNN_snapshot.json` and `_journal.json` entry. Rename the migration to something descriptive if drizzle picked a random name (and keep the tag in `_journal.json` consistent).
3. Review the generated SQL, then apply it with `bun run db:migrate` (needs `DATABASE_URL`).
4. Commit the schema change **and** all generated files in `drizzle/` together.

For things drizzle can't model (triggers, functions, data fixes) create a custom migration: `bunx drizzle-kit generate --custom --name <name>` and write the SQL by hand (see `drizzle/0001_notification_triggers.sql`).

Notes:
- Migrations are applied automatically on container start (`bun migrate.ts`, see the `Dockerfile` `CMD`) and are expected to be a no-op when up to date. Migrations must therefore be safe to run against production data — avoid destructive changes without a data-preserving path.
- `migrate.ts` also baselines legacy databases created before migrations existed; don't remove that logic.
- Migrations ship in the Docker image (`COPY drizzle ./drizzle`), so they must be committed.
- `bun run db:studio` opens Drizzle Studio.
- Migration numbers are sequential; if you merge a branch that added a migration with the same number, regenerate yours so the journal stays ordered.

## Development

```
bun install
cp .env.example .env                              # then set DATABASE_URL
docker compose -f docker-compose.dev.yaml up -d   # local Postgres
bun run db:migrate
bun run dev
```

Scripts (`package.json`):

| command              | purpose                                      |
| -------------------- | -------------------------------------------- |
| `bun run dev`        | Vite dev server                              |
| `bun run build`      | production build (`build/`)                 |
| `bun run preview`    | preview the production build                 |
| `bun run check`      | `svelte-kit sync` + `svelte-check` (types)   |
| `bun run lint`       | Prettier check + ESLint                      |
| `bun run format`     | Prettier write                               |
| `bun run db:generate`| generate a drizzle migration                 |
| `bun run db:migrate` | apply pending migrations                     |

There is no test suite. Before finishing a change, run `bun run check` and `bun run format` (and `bun run lint` if relevant) and fix anything you introduced.

## Code style

- Prettier: tabs, single quotes, no trailing commas, print width 100 (`.prettierrc`).
- Import local modules with the `.js` extension where the existing code does (e.g. `#lib/store.js`).
- Keep server-only logic in `src/lib/server/`; validate all user input on the server (`src/lib/server/validation.ts`) and apply rate limits (`src/lib/server/ratelimit.ts`) to new write endpoints.
- Comments explain *why*, matching the existing terse lowercase style.

## Configuration and environment

- Environment variables are documented in `.env.example` and the `README.md` table; update both when adding one, and validate it in `src/env.ts`.
- `PUBLIC_URL` is compiled in at build time (CSRF origin check, SvelteKit 3 has no runtime `ORIGIN`), so changing it requires a rebuild.
- A strict CSP is configured in `vite.config.ts`; when adding external resources (scripts, images, connections), update the directives there.
- Never commit `.env` or secrets.

## Git

- Main branch for PRs is `master`. Keep commits focused, and include migration files with the schema change that caused them.
