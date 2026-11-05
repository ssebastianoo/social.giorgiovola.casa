// See https://kit.svelte.dev/docs/types#app

import type { User } from '#lib/types.js';
import type { SessionRef } from '#lib/server/session.js';
import type { Role } from '#lib/server/moderation.js';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** the profile in use: an account or one of its identities */
			user: User | null;
			/** the account that is signed in (owner of `user` when it is an identity) */
			accountId: number | null;
			/** valid sessions on this browser, active first */
			sessions: SessionRef[];
			/** role of the account that is signed in */
			role: Role;
			/** the account that is signed in is muted */
			muted: boolean;
			/** why the account was muted, if a reason was given */
			muteReason: string | null;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
