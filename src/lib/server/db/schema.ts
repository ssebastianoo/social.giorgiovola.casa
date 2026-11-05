import { sql } from 'drizzle-orm';
import {
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
		created_at: timestamptz('created_at').notNull().defaultNow(),
		// identities: extra profiles owned by an account, usable only by switching to them
		// from the owning account (see src/routes/accounts)
		owner_id: integer('owner_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' })
	},
	(t) => [
		index('users_owner_id').on(t.owner_id),
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
		type: text('type', { enum: ['mention', 'reply', 'like'] }).notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		read_at: timestamptz('read_at'),
		// set once a push for this row has been sent, so it never goes out twice
		pushed_at: timestamptz('pushed_at')
	},
	(t) => [
		unique().on(t.user_id, t.sender_id, t.post_id, t.type),
		check('inbox_type_check', sql`${t.type} IN ('mention', 'reply', 'like')`)
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
		index('messages_unread').on(t.recipient_id, t.sender_id).where(sql`${t.read_at} IS NULL`),
		check('messages_not_self', sql`${t.sender_id} != ${t.recipient_id}`)
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
