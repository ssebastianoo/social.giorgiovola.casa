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
	/** username of the account that shared this identity, null when it is not shared with you */
	sharedBy: string | null;
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

/** The profile hover card (see src/lib/components/ProfileCard.svelte). */
export type ProfileCard = Pick<User, 'username' | 'name' | 'avatar'> & {
	bio: string;
	/** an http(s) URL, may be empty */
	website: string;
	followers: number;
	following: number;
	/** the viewer follows this profile */
	followed: boolean;
	/** this profile follows the viewer */
	followsYou: boolean;
	self: boolean;
	followedBy: FollowedBy;
};

/** Profiles the viewer follows that follow a profile: the first few, and how many in all. */
export type FollowedBy = { users: Pick<User, 'username' | 'name' | 'avatar'>[]; total: number };

/** An entry of a followers / following list. */
export type FollowListEntry = Pick<User, 'username' | 'name' | 'avatar'> & {
	bio: string;
	/** the viewer follows this profile */
	followed: boolean;
	/** this profile follows the viewer */
	followsYou: boolean;
	self: boolean;
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

export type NotificationType = 'like' | 'reply' | 'mention' | 'ratio' | 'ratioed_by_you' | 'follow';

export type Notification = {
	id: number;
	user_id: number;
	sender: Pick<User, 'id' | 'username' | 'name' | 'avatar'>;
	/** null for follows */
	post: Pick<Post, 'id' | 'content'> | null;
	type: NotificationType;
	created_at: Date;
	read_at: Date | null;
};

/** A direct message. Sender and recipient are usernames: ids of other profiles stay private. */
export type ChatMessage = {
	id: number;
	sender: string;
	recipient: string;
	content: string;
	/** URL paths of uploaded images */
	images: string[];
	created_at: Date;
};

export type ChatPeer = Pick<User, 'username' | 'name' | 'avatar'>;

/** An entry of the conversation list. */
export type Conversation = {
	peer: ChatPeer;
	/** the latest message, clipped */
	preview: string;
	mine: boolean;
	created_at: Date;
	unread: number;
};

/** A profile in search results. */
export type UserResult = Pick<User, 'username' | 'name' | 'avatar'>;

/** A hashtag in search results, with how many posts use it. */
export type HashtagResult = { tag: string; posts: number };
