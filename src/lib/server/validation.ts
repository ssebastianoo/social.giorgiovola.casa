export const LIMITS = {
	postContent: 2000,
	messageContent: 2000,
	name: 64,
	bio: 160,
	website: 200,
	username: 32,
	email: 254,
	passwordMin: 8,
	passwordMax: 256,
	avatarBytes: 10 * 1024 * 1024,
	postImages: 5,
	messageImages: 5,
	groupName: 64,
	/** members of a group chat, its creator included */
	groupMembers: 32,
	imageBytes: 10 * 1024 * 1024,
	pollOptionsMin: 2,
	pollOptionsMax: 4,
	pollOption: 80,
	/** poll durations, in minutes */
	pollMinutesMin: 5,
	pollMinutesMax: 7 * 24 * 60,
	pollMinutesDefault: 24 * 60
} as const;

// same character set the mention trigger (see drizzle/0001_notification_triggers.sql) recognises
export const USERNAME_RE = /^[a-z0-9_]{1,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses a positive int4 id, returning null for anything else (NaN, negatives, overflow, junk). */
export function parseId(value: unknown): number | null {
	if (typeof value === 'number') value = String(value);
	if (typeof value !== 'string' || !/^\d{1,10}$/.test(value)) return null;
	const n = Number(value);
	return n > 0 && n <= 2147483647 ? n : null;
}

export function validateUsername(username: string): string | null {
	if (!USERNAME_RE.test(username))
		return 'Username must be 1-32 characters: lowercase letters, numbers and _ only.';
	return null;
}

export function validateName(name: string): string | null {
	if (!name.trim() || name.length > LIMITS.name)
		return `Name must be between 1 and ${LIMITS.name} characters.`;
	return null;
}

/**
 * Normalizes a profile website: https:// is added when no scheme is given, and only http(s) URLs
 * with a dotted host are accepted (no javascript:, no intranet names). Empty clears it.
 */
export function parseWebsite(raw: string): { website: string } | { error: string } {
	const value = raw.trim();
	if (!value) return { website: '' };
	if (value.length > LIMITS.website)
		return { error: `Website must be at most ${LIMITS.website} characters.` };
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return { error: 'Invalid website.' };
	}
	if (
		(url.protocol !== 'https:' && url.protocol !== 'http:') ||
		url.username ||
		url.password ||
		!/^[^.]+(\.[^.]+)+$/.test(url.hostname)
	)
		return { error: 'Website must be an http or https address.' };
	if (url.href.length > LIMITS.website)
		return { error: `Website must be at most ${LIMITS.website} characters.` };
	return { website: url.href };
}

export function validateBio(bio: string): string | null {
	if (bio.length > LIMITS.bio) return `Bio must be at most ${LIMITS.bio} characters.`;
	return null;
}

export function validateEmail(email: string): string | null {
	if (email.length > LIMITS.email || !EMAIL_RE.test(email)) return 'Invalid email address.';
	return null;
}

export function validatePassword(password: string): string | null {
	if (password.length < LIMITS.passwordMin || password.length > LIMITS.passwordMax)
		return `Password must be between ${LIMITS.passwordMin} and ${LIMITS.passwordMax} characters.`;
	return null;
}

/** Postgres unique_violation (drizzle wraps the driver error, the code is on its `cause`) */
export function isUniqueViolation(e: unknown): boolean {
	if (typeof e !== 'object' || e === null) return false;
	const { code, cause } = e as { code?: string; cause?: unknown };
	return code === '23505' || (cause !== undefined && isUniqueViolation(cause));
}

export type PollInput = { options: string[]; minutes: number };

/**
 * Validates the poll of a new post: its options (trimmed, distinct) and how long it stays open
 * in minutes (the default when missing). Null when there is no poll.
 */
export function parsePoll(
	options: unknown,
	minutes: unknown
): { poll: PollInput | null } | { error: string } {
	if (options == null) return { poll: null };
	if (!Array.isArray(options)) return { error: 'Poll options must be a list' };
	const trimmed = options.map((o) => (typeof o === 'string' ? o.trim() : ''));
	if (trimmed.some((o) => !o)) return { error: 'Poll options must not be empty' };
	if (trimmed.length < LIMITS.pollOptionsMin || trimmed.length > LIMITS.pollOptionsMax)
		return {
			error: `Polls have ${LIMITS.pollOptionsMin} to ${LIMITS.pollOptionsMax} options`
		};
	if (trimmed.some((o) => o.length > LIMITS.pollOption))
		return { error: `Poll options can be at most ${LIMITS.pollOption} characters` };
	if (new Set(trimmed.map((o) => o.toLowerCase())).size !== trimmed.length)
		return { error: 'Poll options must be different' };

	let duration: number = LIMITS.pollMinutesDefault;
	if (minutes != null && minutes !== '') {
		const n = typeof minutes === 'number' ? minutes : Number(minutes);
		if (!Number.isInteger(n) || n < LIMITS.pollMinutesMin || n > LIMITS.pollMinutesMax)
			return {
				error: `Poll duration must be ${LIMITS.pollMinutesMin} to ${LIMITS.pollMinutesMax} minutes`
			};
		duration = n;
	}
	return { poll: { options: trimmed, minutes: duration } };
}
