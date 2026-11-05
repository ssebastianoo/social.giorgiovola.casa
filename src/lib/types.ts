export type User = {
	id: number;
	/** null for identities */
	email: string | null;
	name: string;
	username: string;
	avatar: string | null;
	created_at: Date;
	/** the account owning this identity, null for regular accounts */
	owner_id: number | null;
};

/** An entry of the account switcher. */
export type SwitcherProfile = Pick<User, 'id' | 'name' | 'username' | 'avatar'> & {
	unread: number;
	active: boolean;
};

export type SwitcherAccount = SwitcherProfile & {
	identities: SwitcherProfile[];
};

export type PublicUser = {
	name: string;
	username: string;
	avatar: string | null;
	created_at: Date;
};

export type Post = {
	id: number;
	user: User | PublicUser;
	content: string;
	/** URL paths of uploaded images */
	images: string[];
	created_at: Date;
	edited_at: Date | null;
	likes: number;
	liked?: boolean;
	replies_count: number;
	reply_to: {
		username: string;
		id: number;
		/** the parent's like count, to tell whether this reply ratios it */
		likes: number;
	} | null;
};

export type NotificationType = 'like' | 'reply' | 'mention' | 'ratio' | 'ratioed_by_you';

export type Notification = {
	id: number;
	user_id: number;
	sender: Pick<User, 'id' | 'username' | 'name' | 'avatar'>;
	post: Pick<Post, 'id' | 'content'>;
	type: NotificationType;
	created_at: Date;
	read_at: Date | null;
};
