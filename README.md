self-hosted social network

## running with Docker

```
docker compose up -d
```

That's it: the database is created and migrated automatically on every start. The app listens on port `7777` at http://localhost:7777 (only on localhost by default, see `BIND_ADDRESS`). Set `SIGNUP_PASSWORD` to allow registrations.

To customize settings, copy `.env.example` to `.env` (docker compose picks it up automatically) and edit it:

| variable              | default                 | description                                                                                                                                           |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                | `7777`                  | port the app listens on                                                                                                                               |
| `PUBLIC_URL`          | `http://localhost:PORT` | public URL of your instance (links, social cards, CSRF check); baked into the image, so rebuild with `docker compose up -d --build` after changing it |
| `DISCORD_WEBHOOK_URL` | empty                   | optional, new posts are announced to this webhook                                                                                                     |
| `SIGNUP_PASSWORD`     | empty                   | password required to register; registration is closed if empty                                                                                        |
| `ADDRESS_HEADER`      | empty                   | header with the client IP behind a proxy (enables per-IP rate limits)                                                                                 |
| `BIND_ADDRESS`        | `127.0.0.1`             | interface the port is published on                                                                                                                    |
| `POSTGRES_PASSWORD`   | `postgres`              | database password (URL-safe characters only); only applied when the database volume is first created                                                  |
| `POSTGRES_PORT`       | `5432`                  | host port of the database in `docker-compose.dev.yaml` (not published in the main compose file)                                                       |

Data lives in the `postgres-data`, `avatars` and `uploads` docker volumes (`uploads` holds the images attached to posts: up to 5 per post, 10MB each; PNG, JPEG, GIF, WebP, AVIF, BMP, ICO and SVG, all re-encoded to WebP and scaled down to 2048px; avatars become 512px WebP squares). You should put the app behind a reverse proxy like [caddy](https://caddyserver.com/docs/quick-starts/caddyfile) or [nginx](https://gist.github.com/journeymanavi/dc7df599dd7618a12528c553ea47b1b1) to add at least https and gzip compression.

## regiorgios

The arrows button under a post opens a menu with two ways to reshare it:

- **Regiorgio** reshares it as is: it shows up on your profile and in your followers' _Following_ feed, marked "… regiorged" (or "… and 2 others regiorged" when more of the profiles in that feed did), as of when it was last regiorged. Open the menu again to undo it.
- **Quote** writes a new post (text and up to 5 images) with the post embedded under it. A quote is a normal post: it shows up wherever your posts do and can be liked, replied to and regiorged itself. If the quoted post is deleted, the quote stays and says so.

The count next to the arrows is regiorgios plus quotes; click it to see who regiorged and who quoted. The author gets a notification for both (a quote that also @mentions them notifies once, as a quote). Muted users can't regiorgio or quote (they can still undo their regiorgios).

## polls

The bars button in the composer adds a poll to a post (or a reply, or a quote): 2 to 4 options of up to 80 characters, open for 1 hour to 7 days. The post's text is the question. Every profile gets one vote, which is final; the results show once you have voted or the poll has ended, and update live. Polls can't be edited, only deleted with their post.

## group chats

_New group_ on the messages page starts a group chat with a name and the people you pick, up to 32 members. Groups show up in the conversation list next to direct messages, with the same unread badges, live updates and push notifications. Messages can have text and up to 5 images, and only their sender can delete them.

The group's info page (the group name at the top of the chat) lists its members. Anyone in the group can rename it and add people (newcomers see the history, but none of it is unread for them), and anyone can leave. Only the owner, its creator, can remove others; when the owner leaves, the longest standing member takes over, and when the last member leaves the group is deleted with its messages. You can't add someone you blocked or who blocked you, and bots can't join groups. Muted users can't create, rename or write in groups.

Changes to a group show up in its chat as a line of their own ("Alice added Bob", "Bob renamed the group to …", "Alice left", "Bob is now the owner"). They never count as unread and send no push.

## typing and muting

In direct and group chats you see who is writing ("Alice is typing…", also in the conversation list). It goes only to the other people in the conversation, never to bots, and not between profiles that blocked each other.

_Mute_, at the top of a chat, silences that conversation for you only: no push notifications, and its unread messages stay out of the badge on the messages icon. In the conversation list a muted chat keeps its unread count, greyed out. _Unmute_ undoes it.

## accounts and identities

- **Switching accounts:** up to 5 accounts can be signed in on one browser. Use the avatar menu in the header to switch, and _Sign in to another account_ to add one.
- **Identities:** extra profiles that belong to an account and have no email or password (up to 10 per account). Create and delete them at `/accounts`. They post, like and get notifications on their own, and the owning account is never shown publicly. Deleting an identity also deletes its posts. An identity can be shared with up to 10 other accounts (_Share_ at `/accounts`): they can switch to it and use it like you do, and get its notifications on their devices, but only the owner can delete it or change who it is shared with. They can give it back with _Leave_.
- **Passkeys:** optional. Add them at `/settings` (avatar menu → _Settings_) to sign in with a fingerprint, face, screen lock or security key instead of the password, which keeps working either way. Passkeys belong to the account, not its identities, and are bound to the hostname of `PUBLIC_URL`, so changing the domain invalidates them.

## bots

Create bots at `/settings` → _OAuth_ (up to 5 per account). A bot is a profile with a "bot" badge, driven only through the bot API: you can't switch to it, and it sends no push notifications to its owner. Its token is shown once when the bot is created. _New token_ replaces it and the old one stops working right away. Bans and mutes follow the owning account, like for identities, and deleting a bot deletes its posts.

A complete guide meant to be handed to an AI agent (or read by a person) is served at `/api.txt`, and the same API is documented for developers at `/developers`. Owners can also edit a bot's picture, name, username, bio and website from _OAuth_ → _Edit_.

Every request sends `Authorization: Bearer <token>` and gets JSON back. Errors come back as `{ "error": "…" }`. A bot can make 120 requests a minute, with lower limits on writes: 20 posts, 20 messages, 60 likes, 30 poll votes, 30 regiorgios and 30 follows a minute, and 10 profile edits an hour.

| method           | path                               |                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`            | `/api/bot/me`                      | the bot's profile and follow counts                                                                                                                                                                                                           |
| `PATCH`          | `/api/bot/me`                      | edit the bot's profile: any of `{ "name", "username", "bio", "website" }`                                                                                                                                                                     |
| `PUT` / `DELETE` | `/api/bot/me/avatar`               | set the picture (the raw image as the body, with its `Content-Type`) / remove it                                                                                                                                                              |
| `POST`           | `/api/bot/posts`                   | post `{ "content": "…" }`, reply with `{ "content": "…", "reply_to": 12 }`, or quote with `{ "content": "…", "quote_of": 12 }` (text only, max 2000 characters); add `"poll": { "options": ["a", "b"], "duration_minutes": 1440 }` for a poll |
| `GET` / `DELETE` | `/api/bot/posts/:id`               | read a post / delete one of the bot's own posts                                                                                                                                                                                               |
| `PUT` / `DELETE` | `/api/bot/posts/:id/like`          | like / unlike (both are idempotent)                                                                                                                                                                                                           |
| `PUT` / `DELETE` | `/api/bot/posts/:id/regiorg`       | regiorgio / undo the regiorgio (both are idempotent)                                                                                                                                                                                          |
| `PUT`            | `/api/bot/posts/:id/vote`          | vote in the post's poll with `{ "option": 0 }` (the index of the option; votes are final)                                                                                                                                                     |
| `GET`            | `/api/bot/users/:username`         | a profile, and whether the bot follows it                                                                                                                                                                                                     |
| `PUT` / `DELETE` | `/api/bot/users/:username/follow`  | follow / unfollow                                                                                                                                                                                                                             |
| `GET`            | `/api/bot/mentions`                | posts that mention the bot or reply to its posts                                                                                                                                                                                              |
| `GET`            | `/api/bot/feed`                    | posts and replies by the profiles the bot follows                                                                                                                                                                                             |
| `GET`            | `/api/bot/stream`                  | server-sent events: `mention`, `post` (from a followed profile) and `message` (a received DM), each with the post or message as data                                                                                                          |
| `GET`            | `/api/bot/conversations`           | the bot's conversations, with a preview and the unread count of each                                                                                                                                                                          |
| `GET`            | `/api/bot/messages`                | direct messages the bot received, oldest first (`?after=<id>&limit=`)                                                                                                                                                                         |
| `GET` / `POST`   | `/api/bot/messages/:username`      | the conversation with a user (`?after=<id>&limit=`) / send a message `{ "content": "…" }` (text only, max 2000 characters)                                                                                                                    |
| `POST`           | `/api/bot/messages/:username/read` | mark what that user sent as read                                                                                                                                                                                                              |
| `DELETE`         | `/api/bot/message/:id`             | delete one of the bot's own messages                                                                                                                                                                                                          |
| `PUT` / `DELETE` | `/api/bot/users/:username/block`   | block / unblock (no messages either way)                                                                                                                                                                                                      |

`mentions` and `feed` return posts oldest first. `?limit=` is 1–100 (default 20). Without `?after=` you get the most recent ones. Pass the id of the last post you handled as `?after=<id>` to get only newer ones, for example to catch up after the stream disconnects.

```
curl -H "Authorization: Bearer $TOKEN" https://example.com/api/bot/mentions?after=120
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"content":"hello!","reply_to":121}' https://example.com/api/bot/posts
curl -N -H "Authorization: Bearer $TOKEN" https://example.com/api/bot/stream
```

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
