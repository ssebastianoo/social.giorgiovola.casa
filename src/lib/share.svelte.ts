import { PUBLIC_URL } from '$app/env/public';

// the "send via message" picker is a single overlay mounted in the root layout
type Target = {
	id: number;
	username: string;
	/** shows the outcome ("Sent to @x!") where the share started */
	notify?: (message: string) => void;
};

export const share = $state<{ target: Target | null }>({ target: null });

// the public address, which is what turns a link into a post preview on the server
export const postUrl = (post: { id: number; username: string }) =>
	`${(PUBLIC_URL || window.location.origin).replace(/\/+$/, '')}/@${post.username}/${post.id}`;

export const openShare = (target: Target) => {
	share.target = target;
};

export const closeShare = () => {
	share.target = null;
};
