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

## Design guide

The look is flat, dark and minimal: a near-black page, light grey text and one green accent. Match it in any new UI instead of bringing in new styles.

**No glows, gradients or drop shadows.** Separate surfaces with a 1px border or a translucent black fill, not with shadow.

### Tokens

Colors are Tailwind theme tokens in `src/app.css` (`@theme`). Use them by name (`text-muted`, `border-accent`, …), not as hex values.

| token        | value     | use                                                        |
| ------------ | --------- | ---------------------------------------------------------- |
| `background` | `#0c0b0b` | page and popover backgrounds                               |
| `foreground` | `#d9d9d9` | text, icon fills (`fill="#d9d9d9"` on inline SVGs)         |
| `accent`     | `#799a74` | links, button and popover borders, active states, focus    |
| `danger`     | `#bb5353` | destructive actions, error banners                         |
| `muted`      | `#999999` | hints, counts, secondary text                              |
| `line`       | `#4e4e4e` | quiet dividers and list rows, never the frame of a popover |

- **Font:** Manrope Variable (`font-sans`, loaded in `+layout.svelte`), medium weight by default. Use `font-bold` / `font-extrabold` for names and headings.
- **Text sizes** are relative (`em`) so they follow their context: `text-[0.9em]` for secondary lines, `text-[0.85em]` for hints (`text-muted`), `text-[0.8em]` for form labels and timestamps, `text-[0.75em]` for badges. Use `opacity-80` / `opacity-70` for a dimmed part of a line (such as `@username` next to a name).
- **Corners:** `rounded-[5px]` for buttons, popovers, error banners and images. `rounded-md` for dialogs and list rows, `rounded-[10px]` for info panels, `rounded-full` only for avatars and pills.
- **Spacing:** the scale is 5px / 10px / 20px: `[5px]`, `2.5` and `5` in Tailwind (`p-[5px]`, `gap-2.5`, `mb-5`). Most stacks are `flex flex-col gap-2.5`. Sections on settings-like pages are `mb-10 flex flex-col gap-3`.
- **Layout:** content sits in a single centered column (`max-w-160 p-5`, in `+layout.svelte`) under the fixed, translucent header. Pages don't add their own outer width or padding.

### Components and patterns

- **Buttons: always use `src/lib/components/Button.svelte`.** Don't add a raw `<button>` or `<a>` styled as a button, and don't restyle one. The old `.btn` classes are gone.
  - `variant`:
    - `default`: green outline that fills on hover.
    - `primary`: filled green, for the one main action (Follow, the active filter tab).
    - `danger`: red outline, for delete, ban and log out.
    - `danger-on-hover`: an "on" toggle that turns red on hover because clicking it undoes something (Following → Unfollow).
  - `size`:
    - `sm` (32px high): for buttons in a row next to a name or heading.
    - `md` (the default).
    - `lg`: for auth forms.
  - Passing `href` renders a link with the same look. `type` defaults to `button`, so write `type="submit"` explicitly in forms.
  - `class` is for layout only (`w-full`, `self-start`, margins, `size-8` for an icon button). Colors, border and radius come from `variant`, so don't override them.
  - Handlers are callback props (`onclick`), including from legacy components. Write `on:click|stopPropagation` as `onclick={(e) => { e.stopPropagation(); … }}`.
  - Icon-only controls (the composer, chat input, image viewer and like buttons) are plain unbordered buttons and stay that way. Give them an `aria-label` or `title`.
- **Inputs:** the `.input` class (bottom border only, `p-2.5`) for standalone fields. Labelled form fields are a `flex flex-col` with a `text-[0.8em] opacity-80` label above an input that has only `border-b`.
- **Popovers and dialogs:** `rounded-[5px] border border-accent bg-background p-2.5` (dialogs: `rounded-md … p-5`). For one shared overlay (image viewer, profile hover card), mount a single instance in `+layout.svelte`, drive it from a `.svelte.ts` state module and close it on `afterNavigate` and Escape.
- **Info panels:** `rounded-[10px] bg-black/70 p-2.5`.
- **Errors:** `rounded-[5px] bg-danger p-[5px]` above the thing that failed.
- **Tabs and filters:** an underline tab row (`border-b-2`, `border-accent` when active, `opacity-60` otherwise) or `Button`s with the active one `primary`. Mark the active one with `aria-current="page"`.
- **Hover states:** rows and posts darken (`hover:bg-black`, or `hover:bg-white/5` on small menu links). Links underline on hover (base style). Turn that off with `hover:no-underline` when a link isn't text.
- **Avatars:** always `src/lib/components/Avatar.svelte` (round). Common sizes are 24 (inline stacks), 45 (posts), 50 (header), 60–64 (profile and card).
- **Numbers:** show large counts compactly with `Intl.NumberFormat(undefined, { notation: 'compact' })` (`49.4K`).
- **Touch:** hover-only UI (such as the profile card) must only open for `pointerType === 'mouse'`, and tapping must still work without it.

### Prettier caveat

The project is on Prettier 2 and `prettier-plugin-svelte` 2, which can't print Svelte 5 `{@render}` / snippet markup. Components that use it, such as `Button.svelte`, are listed in `.prettierignore`, so format them by hand. Prettier 2 also turns an empty `<textarea></textarea>` into a self-closing tag that Svelte 5 rejects, so put `<!-- prettier-ignore -->` before it.

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
