import fs from 'fs';
import { eq } from 'drizzle-orm';
import { db, users } from './db/index.js';
import { removeAvatarFiles } from './accounts.js';
import { AVATAR_SIZE, ImageError, sniffImage, toWebp } from './images.js';
import {
	LIMITS,
	isUniqueViolation,
	parseWebsite,
	validateBio,
	validateName,
	validateUsername
} from './validation.js';

/** Collapses runs of blank lines so a bio can't push the profile down the page. */
export const normalizeBio = (raw: string) =>
	raw
		.replace(/\r\n?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/**
 * Re-encodes an uploaded avatar and stores it as the user's avatar file. Returns the URL to save
 * in `users.avatar` (with a cache-busting hash), or an error message.
 */
export async function saveAvatar(
	userId: number,
	buffer: Buffer
): Promise<{ avatar: string } | { error: string }> {
	if (buffer.length > LIMITS.avatarBytes) return { error: 'Avatar too big, max size is 10mb' };
	const ext = sniffImage(buffer);
	if (!ext)
		return { error: 'Unsupported avatar type, use PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG' };
	let webp: Buffer;
	try {
		webp = await toWebp(buffer, ext, { size: AVATAR_SIZE, square: true });
	} catch (e) {
		if (e instanceof ImageError) return { error: e.message };
		throw e;
	}
	// avatars used to keep their uploaded format: drop any older file first
	await removeAvatarFiles(userId);
	const path = `/avatars/${userId}.webp`;
	await fs.promises.mkdir('static/avatars', { recursive: true });
	await fs.promises.writeFile(`static${path}`, webp);
	return { avatar: `${path}?hash=${Date.now()}` };
}

export type ProfileChanges = {
	name?: string;
	username?: string;
	bio?: string;
	website?: string;
};

/** The public profile fields of a user, as the bot API and the settings page show them. */
export const profileColumns = {
	id: users.id,
	name: users.name,
	username: users.username,
	avatar: users.avatar,
	bio: users.bio,
	website: users.website
};

export type ProfileFields = {
	id: number;
	name: string;
	username: string;
	avatar: string | null;
	bio: string;
	website: string;
};

/**
 * Validates and applies changes to a profile's name, username, bio, website and avatar. Fields
 * left undefined are kept; an avatar of null removes it. `currentUsername` lets usernames from
 * before validation existed stay as long as they don't change.
 */
export async function updateProfile(
	userId: number,
	currentUsername: string,
	changes: ProfileChanges,
	avatar?: Buffer | null
): Promise<{ profile: ProfileFields } | { error: string }> {
	const set: Partial<typeof users.$inferInsert> = {};
	if (changes.name !== undefined) {
		const name = changes.name.trim();
		const error = validateName(name);
		if (error) return { error };
		set.name = name;
	}
	if (changes.username !== undefined) {
		const username = changes.username.trim().replace(/^@/, '').toLowerCase();
		if (username !== currentUsername) {
			const error = validateUsername(username);
			if (error) return { error };
		}
		set.username = username;
	}
	if (changes.bio !== undefined) {
		const bio = normalizeBio(changes.bio);
		const error = validateBio(bio);
		if (error) return { error };
		set.bio = bio;
	}
	if (changes.website !== undefined) {
		const website = parseWebsite(changes.website);
		if ('error' in website) return { error: website.error };
		set.website = website.website;
	}
	if (Object.keys(set).length === 0 && avatar === undefined) return { error: 'Nothing to update' };

	// checked before the avatar file is replaced, so a failed update leaves it alone
	if (set.username !== undefined && set.username !== currentUsername) {
		const [taken] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, set.username));
		if (taken && taken.id !== userId) return { error: 'Username already in use.' };
	}
	if (avatar === null) {
		await removeAvatarFiles(userId);
		set.avatar = null;
	} else if (avatar) {
		const saved = await saveAvatar(userId, avatar);
		if ('error' in saved) return saved;
		set.avatar = saved.avatar;
	}

	try {
		const [updated] = await db
			.update(users)
			.set(set)
			.where(eq(users.id, userId))
			.returning(profileColumns);
		return { profile: updated };
	} catch (e) {
		if (isUniqueViolation(e)) return { error: 'Username already in use.' };
		throw e;
	}
}
