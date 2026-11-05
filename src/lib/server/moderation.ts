import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, sessions, users } from './db/index.js';
import { hit, isLimited } from './ratelimit.js';

export type Role = 'user' | 'mod' | 'admin';

const RANK: Record<Role, number> = { user: 0, mod: 1, admin: 2 };

export const isStaff = (role: Role) => role !== 'user';

/** Staff can only act on people ranked strictly below them: mods on users, admins on mods too. */
export const outranks = (actor: Role, target: Role) => RANK[actor] > RANK[target];

// staff actions are cheap to spam by accident (and password resets hash with scrypt)
const WINDOW_MS = 60_000;
const MAX_ACTIONS = 60;

/** True when this staff member is acting too fast. Counts the attempt. */
export function actionsLimited(actorId: number) {
	const key = `moderation:${actorId}`;
	if (isLimited(key, MAX_ACTIONS)) return true;
	hit(key, WINDOW_MS);
	return false;
}

export type ModerationTarget = {
	/** the account: the owner when the username belongs to an identity */
	id: number;
	username: string;
	name: string;
	avatar: string | null;
	role: Role;
	banned_at: Date | null;
	ban_reason: string | null;
	muted_at: Date | null;
	mute_reason: string | null;
	created_at: Date;
};

/** Moderation always targets the account, so an identity can't be used to dodge a ban or mute. */
export async function findTarget(username: string): Promise<ModerationTarget | null> {
	const [profile] = await db
		.select({ id: users.id, owner_id: users.owner_id })
		.from(users)
		.where(eq(users.username, username.toLowerCase()));
	if (!profile) return null;
	const [account] = await db
		.select({
			id: users.id,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			role: users.role,
			banned_at: users.banned_at,
			ban_reason: users.ban_reason,
			muted_at: users.muted_at,
			mute_reason: users.mute_reason,
			created_at: users.created_at
		})
		.from(users)
		.where(eq(users.id, profile.owner_id ?? profile.id));
	return account ?? null;
}

/** Whether the signed in staff member may moderate this target (never themselves). */
export function canModerate(locals: App.Locals, target: Pick<ModerationTarget, 'id' | 'role'>) {
	return (
		locals.accountId !== null &&
		locals.accountId !== target.id &&
		outranks(locals.role, target.role)
	);
}

/** Whether the signed in staff member may delete a post written by an account with this role. */
export const canDeletePostOf = (locals: App.Locals, authorRole: Role) =>
	isStaff(locals.role) && outranks(locals.role, authorRole);

export async function banAccount(id: number, reason: string | null) {
	await db
		.update(users)
		.set({ banned_at: sql`NOW()`, ban_reason: reason })
		.where(and(eq(users.id, id), isNull(users.banned_at)));
	// signs them out everywhere (push subscriptions go with the sessions)
	await db.delete(sessions).where(eq(sessions.user_id, id));
}

export const unbanAccount = (id: number) =>
	db.update(users).set({ banned_at: null, ban_reason: null }).where(eq(users.id, id));

export const muteAccount = (id: number, reason: string | null) =>
	db
		.update(users)
		.set({ muted_at: sql`NOW()`, mute_reason: reason })
		.where(and(eq(users.id, id), isNull(users.muted_at)));

export const unmuteAccount = (id: number) =>
	db.update(users).set({ muted_at: null, mute_reason: null }).where(eq(users.id, id));

export const setAccountRole = (id: number, role: Role) =>
	db.update(users).set({ role }).where(eq(users.id, id));

/** What a muted account is told when it tries to post or send a message. */
export const mutedMessage = (locals: App.Locals) =>
	`You are muted and can't post or send messages.${
		locals.muteReason ? ` Reason: ${locals.muteReason}` : ''
	}`;
