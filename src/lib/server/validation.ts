export const LIMITS = {
	postContent: 2000,
	messageContent: 2000,
	name: 64,
	username: 32,
	email: 254,
	passwordMin: 8,
	passwordMax: 256,
	avatarBytes: 10 * 1024 * 1024,
	postImages: 5,
	imageBytes: 10 * 1024 * 1024
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
