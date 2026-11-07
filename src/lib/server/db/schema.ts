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
	uniqueIndex,
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
		// an http(s) URL shown on the profile, may be empty
		website: text('website').notNull().default(''),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		// identities: extra profiles owned by an account, usable only by switching to them
		// from the owning account (see src/routes/accounts)
		owner_id: integer('owner_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
		// bots are owned like identities but driven by the bot API (see bots below), never by
		// switching to them
		bot: boolean('bot').notNull().default(false),
		// the one post shown first on the profile, always one of its own; deleting it unpins it
		pinned_post_id: integer('pinned_post_id').references((): AnyPgColumn => posts.id, {
			onDelete: 'set null'
		}),
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

export const posts = pgTable(
	'posts',
	{
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
		reply_to: integer('reply_to').references((): AnyPgColumn => posts.id, { onDelete: 'cascade' }),
		// a quote regiorg: the post this one quotes. Deleting the quoted post keeps the quote, which
		// then shows the quoted post as unavailable (is_quote stays true)
		quote_of: integer('quote_of').references((): AnyPgColumn => posts.id, { onDelete: 'set null' }),
		is_quote: boolean('is_quote').notNull().default(false),
		// pinned by staff to the top of the home timeline for everyone; null when not pinned
		timeline_pinned_at: timestamptz('timeline_pinned_at')
	},
	(t) => [index('posts_quote_of').on(t.quote_of)]
);

// A poll attached to a post: one vote per profile, final once cast, open until ends_at.
export const polls = pgTable(
	'polls',
	{
		post_id: integer('post_id')
			.primaryKey()
			.references(() => posts.id, { onDelete: 'cascade' }),
		// the choices, in order; votes point at them by index
		options: text('options').array().notNull(),
		ends_at: timestamptz('ends_at').notNull()
	},
	(t) => [check('polls_options_check', sql`cardinality(${t.options}) BETWEEN 2 AND 4`)]
);

export const poll_votes = pgTable(
	'poll_votes',
	{
		post_id: integer('post_id')
			.notNull()
			.references(() => polls.post_id, { onDelete: 'cascade' }),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// index into polls.options
		option: integer('option').notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.post_id, t.user_id] }),
		check('poll_votes_option_check', sql`${t.option} >= 0`)
	]
);

// Hashtags of a post, lowercased and without the "#". Written by the post API with
// extractHashtags (src/lib/hashtags.ts), which is the one definition of what a hashtag is.
export const post_hashtags = pgTable(
	'post_hashtags',
	{
		post_id: integer('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		tag: text('tag').notNull()
	},
	(t) => [
		// the tag first: hashtag pages and counts look rows up by tag
		primaryKey({ columns: [t.tag, t.post_id] }),
		index('post_hashtags_post_id').on(t.post_id)
	]
);

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

// A regiorg reshares a post: it shows up on the regiorger's profile and in their followers'
// feeds, as of when it was regiorged.
export const regiorgs = pgTable(
	'regiorgs',
	{
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		post_id: integer('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.user_id, t.post_id] }), index('regiorgs_post_id').on(t.post_id)]
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
		// follow: the sender followed the recipient, post_id is null
		// regiorg: the sender regiorged the recipient's post
		// quote: the sender's post (post_id) quotes the recipient's post
		type: text('type', {
			enum: ['mention', 'reply', 'like', 'ratio', 'ratioed_by_you', 'follow', 'regiorg', 'quote']
		}).notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		read_at: timestamptz('read_at'),
		// set once a push for this row has been sent, so it never goes out twice
		pushed_at: timestamptz('pushed_at')
	},
	(t) => [
		unique().on(t.user_id, t.sender_id, t.post_id, t.type),
		// follows have no post, and nulls never conflict in the key above: one per follower, so
		// unfollowing and following again doesn't notify twice
		uniqueIndex('inbox_follow_unique')
			.on(t.user_id, t.sender_id)
			.where(sql`${t.type} = 'follow'`),
		check(
			'inbox_type_check',
			sql`${t.type} IN ('mention', 'reply', 'like', 'ratio', 'ratioed_by_you', 'follow', 'regiorg', 'quote')`
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
		// the message this one answers; the reply stays when it is deleted
		reply_to_id: integer('reply_to_id').references((): AnyPgColumn => messages.id, {
			onDelete: 'set null'
		}),
		created_at: timestamptz('created_at').notNull().defaultNow(),
		read_at: timestamptz('read_at')
	},
	(t) => [
		index('messages_sender_recipient').on(t.sender_id, t.recipient_id, t.id),
		index('messages_recipient_sender').on(t.recipient_id, t.sender_id, t.id),
		// deleting a message clears the replies to it
		index('messages_reply_to_id')
			.on(t.reply_to_id)
			.where(sql`${t.reply_to_id} IS NOT NULL`),
		index('messages_unread')
			.on(t.recipient_id, t.sender_id)
			.where(sql`${t.read_at} IS NULL`),
		check('messages_not_self', sql`${t.sender_id} != ${t.recipient_id}`)
	]
);

// Group chats: conversations between several profiles. Any member can rename it, add people
// and leave; only the owner can remove others.
export const group_chats = pgTable('group_chats', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	// passes to the longest standing member when the owner leaves. Null once the owner's profile
	// is deleted: the longest standing member is then treated as the owner (see groups.ts)
	owner_id: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
	created_at: timestamptz('created_at').notNull().defaultNow()
});

export const group_members = pgTable(
	'group_members',
	{
		group_id: integer('group_id')
			.notNull()
			.references(() => group_chats.id, { onDelete: 'cascade' }),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		joined_at: timestamptz('joined_at').notNull().defaultNow(),
		// the latest group message this member has read: later ones sent by others are unread
		last_read_id: integer('last_read_id').notNull().default(0),
		// muted: no push, and the group's unread messages stay out of the messages badge
		muted: boolean('muted').notNull().default(false)
	},
	(t) => [
		primaryKey({ columns: [t.group_id, t.user_id] }),
		index('group_members_user_id').on(t.user_id)
	]
);

export const group_messages = pgTable(
	'group_messages',
	{
		id: serial('id').primaryKey(),
		group_id: integer('group_id')
			.notNull()
			.references(() => group_chats.id, { onDelete: 'cascade' }),
		// messages stay when their sender leaves the group, and go with their profile
		sender_id: integer('sender_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// message: written by sender_id. The others are events shown in the chat, never unread:
		// created (content: the name), added / removed (sender_id did it to target_id), left,
		// renamed (content: the new name), owner (sender_id became the owner)
		kind: text('kind', {
			enum: ['message', 'created', 'added', 'removed', 'left', 'renamed', 'owner']
		})
			.notNull()
			.default('message'),
		// who an added / removed event is about
		target_id: integer('target_id').references(() => users.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		// URL paths of uploaded images; a message may have images and no text
		images: text('images')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		// the message this one answers; the reply stays when it is deleted
		reply_to_id: integer('reply_to_id').references((): AnyPgColumn => group_messages.id, {
			onDelete: 'set null'
		}),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		index('group_messages_group_id').on(t.group_id, t.id),
		index('group_messages_reply_to_id')
			.on(t.reply_to_id)
			.where(sql`${t.reply_to_id} IS NOT NULL`),
		check(
			'group_messages_kind_check',
			sql`${t.kind} IN ('message', 'created', 'added', 'removed', 'left', 'renamed', 'owner')`
		)
	]
);

// Emoji reactions to messages: one per profile and message, changing it replaces the old one.
export const message_reactions = pgTable(
	'message_reactions',
	{
		message_id: integer('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		emoji: text('emoji').notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.message_id, t.user_id] })]
);

export const group_message_reactions = pgTable(
	'group_message_reactions',
	{
		message_id: integer('message_id')
			.notNull()
			.references(() => group_messages.id, { onDelete: 'cascade' }),
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		emoji: text('emoji').notNull(),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.message_id, t.user_id] })]
);

// Direct conversations a profile muted: no push for what peer_id sends, and its unread messages
// stay out of the messages badge. Groups are muted on group_members.
export const dm_mutes = pgTable(
	'dm_mutes',
	{
		user_id: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		peer_id: integer('peer_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.user_id, t.peer_id] }),
		check('dm_mutes_not_self', sql`${t.user_id} != ${t.peer_id}`)
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

// Accounts an identity is shared with: they can switch to it and use it like the owner does,
// but only the owner (users.owner_id) can delete it or change who it is shared with.
export const identity_members = pgTable(
	'identity_members',
	{
		identity_id: integer('identity_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		account_id: integer('account_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		created_at: timestamptz('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.identity_id, t.account_id] }),
		index('identity_members_account_id').on(t.account_id),
		check('identity_members_not_self', sql`${t.identity_id} != ${t.account_id}`)
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

// API credentials of a bot profile (users.bot). Only a hash of the token is stored: it is shown
// once when created or regenerated (see src/lib/server/bots.ts).
export const bots = pgTable('bots', {
	user_id: integer('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	// sha256 hex of the bearer token
	token_hash: text('token_hash').notNull().unique(),
	created_at: timestamptz('created_at').notNull().defaultNow(),
	last_used_at: timestamptz('last_used_at')
});
