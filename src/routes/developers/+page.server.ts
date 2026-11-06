import type { PageServerLoad } from './$types';
import { PUBLIC_URL } from '$app/env/public';
import { MAX_BOTS, MAX_PROFILE_UPDATES } from '#lib/server/bots.js';
import { LIMITS } from '#lib/server/validation.js';

// public: the docs are for people deciding whether to build a bot, who may not have an account
export const load: PageServerLoad = ({ url }) => ({
	origin: PUBLIC_URL ? new URL(PUBLIC_URL).origin : url.origin,
	limits: {
		postContent: LIMITS.postContent,
		messageContent: LIMITS.messageContent,
		name: LIMITS.name,
		bio: LIMITS.bio,
		username: LIMITS.username,
		maxBots: MAX_BOTS,
		maxProfileUpdates: MAX_PROFILE_UPDATES
	}
});
