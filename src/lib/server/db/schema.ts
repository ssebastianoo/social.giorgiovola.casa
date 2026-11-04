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
	content: text('content').notNull(),
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
		read_at: timestamptz('read_at')
	},
	(t) => [
		unique().on(t.user_id, t.sender_id, t.post_id, t.type),
		check('inbox_type_check', sql`${t.type} IN ('mention', 'reply', 'like')`)
	]
);
