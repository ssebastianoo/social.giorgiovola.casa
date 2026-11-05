import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';

// Property names match the column names (snake_case) so rows line up with the types in
// src/lib/types.ts. The triggers that create notifications can't be expressed here, they live
// in a hand written migration (see drizzle/).

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),
		username: text('username').notNull().unique(),
		name: text('name').notNull(),
		// email, password and salt are null for identities
		email: text('email').unique(),
		password: text('password'),
		salt: text('salt'),
		avatar: text('avatar'),
		// shown on the profile, may be empty
		bio: text('bio').notNull().default(''),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		// identities: extra profiles owned by an account, usable only by switching to them
		// from the owning account (see src/routes/accounts)
		owner_id: integer('owner_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
		// moderation lives on accounts, identities follow the account that owns them
		role: text('role', { enum: ['user', 'mod', 'admin'] })
			.notNull()
			.default('user'),
		// banned accounts can't sign in; muted ones can't post, reply or send messages
		banned_at: timestamptz('banned_at'),
		ban_reason: text('ban_reason'),
		muted_at: timestamptz('muted_at'),
		mute_reason: text('mute_reason')
	},
	(t) => [
		index('users_owner_id').on(t.owner_id),
		check('users_role_check', sql`${t.role} IN ('user', 'mod', 'admin')`),
		check(
			'users_identity_check',
			sql`(${t.owner_id} IS NULL AND ${t.email} IS NOT NULL AND ${t.password} IS NOT NULL AND ${t.salt} IS NOT NULL)
				OR (${t.owner_id} IS NOT NULL AND ${t.owner_id} != ${t.id} AND ${t.email} IS NULL AND ${t.password} IS NULL AND ${t.salt} IS NULL)`
		)
	]
);

export const sessions = pgTable('sessions', {
	token: text('token')
		.primaryKey()
		.default(sql`gen_random_uuid()`),
	// the account that is signed in
	user_id: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
	// the identity currently in use, null when acting as the account itself
	acting_id: integer('acting_id').references(() => users.id, { onDelete: 'set null' }),
	// sessions expire server side (see src/lib/server/session.ts)
	created_at: timestamptz('created_at').notNull().defaultNow()
});

export const posts = pgTable('posts', {
	id: serial('id').primaryKey(),
	user_id: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
	// may be empty when the post has images
	content: text('content').notNull(),
	// URL paths of the attached uploads (see src/lib/server/images.ts)
	images: text('images')
		.array()
		.notNull()
		.default(sql`'{}'::text[]`),
	created_at: timestamptz('created_at').notNull().defaultNow(),
	edited_at: timestamptz('edited_at'),
	reply_to: integer('reply_to').references((): AnyPgColumn => posts.id, { onDelete: 'cascade' })
});

export const likes = pgTable(
	'likes',
	{
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		post_id: integer('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.user_id, t.post_id] })]
);

export const inbox = pgTable(
	'inbox',
	{
		id: serial('id').primaryKey(),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		sender_id: integer('sender_id').references(() => users.id, { onDelete: 'cascade' }),
		post_id: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
		// ratio: sender's reply (post_id) got more likes than the recipient's post
		// ratioed_by_you: the recipient's reply (post_id) got more likes than the sender's post
		type: text('type', {
			enum: ['mention', 'reply', 'like', 'ratio', 'ratioed_by_you']
		}).notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		read_at: timestamptz('read_at'),
		// set once a push for this row has been sent, so it never goes out twice
		pushed_at: timestamptz('pushed_at')
	},
	(t) => [
		unique().on(t.user_id, t.sender_id, t.post_id, t.type),
		check(
			'inbox_type_check',
			sql`${t.type} IN ('mention', 'reply', 'like', 'ratio', 'ratioed_by_you')`
		)
	]
);

// Direct messages between two profiles (an identity has its own conversations, like its own inbox).
export const messages = pgTable(
	'messages',
	{
		id: serial('id').primaryKey(),
		sender_id: integer('sender_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		recipient_id: integer('recipient_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		// URL paths of uploaded images; a message may have images and no text
		images: text('images')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		read_at: timestamptz('read_at')
	},
	(t) => [
		index('messages_sender_recipient').on(t.sender_id, t.recipient_id, t.id),
		index('messages_recipient_sender').on(t.recipient_id, t.sender_id, t.id),
		index('messages_unread')
			.on(t.recipient_id, t.sender_id)
			.where(sql`${t.read_at} IS NULL`),
		check('messages_not_self', sql`${t.sender_id} != ${t.recipient_id}`)
	]
);

// Blocking stops direct messages in both directions between the two profiles.
export const blocks = pgTable(
	'blocks',
	{
		blocker_id: integer('blocker_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		blocked_id: integer('blocked_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.blocker_id, t.blocked_id] }),
		index('blocks_blocked_id').on(t.blocked_id),
		check('blocks_not_self', sql`${t.blocker_id} != ${t.blocked_id}`)
	]
);

// Follows are between profiles: an identity follows and is followed on its own.
export const follows = pgTable(
	'follows',
	{
		follower_id: integer('follower_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		followed_id: integer('followed_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.follower_id, t.followed_id] }),
		index('follows_followed_id').on(t.followed_id),
		check('follows_not_self', sql`${t.follower_id} != ${t.followed_id}`)
	]
);

// key/value settings (the web push VAPID key pair is generated on first use)
export const settings = pgTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

// A browser subscription hangs off the session that created it, so logging out (or the session
// expiring) stops the notifications for that account on that browser.
export const push_subscriptions = pgTable(
	'push_subscriptions',
	{
		session_token: text('session_token')
			.notNull()
			.references(() => sessions.token, { onDelete: 'cascade' }),
		endpoint: text('endpoint').notNull(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.session_token, t.endpoint] }),
		index('push_subscriptions_endpoint').on(t.endpoint)
	]
);

// WebAuthn credentials, an optional way to sign in to an account next to its password.
// Identities have no passkeys of their own, like they have no password.
export const passkeys = pgTable(
	'passkeys',
	{
		// base64url credential id, as the browser reports it
		id: text('id').primaryKey(),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// base64url COSE public key
		public_key: text('public_key').notNull(),
		// the signature counter is a uint32, too big for int4
		counter: bigint('counter', { mode: 'number' }).notNull().default(0),
		transports: text('transports')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		name: text('name').notNull(),
		// synced passkeys (multiDevice + backed up) survive losing the device
		backed_up: boolean('backed_up').notNull().default(false),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		last_used_at: timestamptz('last_used_at')
	},
	(t) => [index('passkeys_user_id').on(t.user_id)]
);
