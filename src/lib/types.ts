export type User = {
	id: number;
	email: string;
	name: string;
	username: string;
	avatar: string | null;
	created_at: Date;
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
	created_at: Date;
	edited_at: Date | null;
	likes: number;
	liked?: boolean;
	replies_count: number;
	reply_to: {
		username: string;
		id: number;
	} | null;
};

export type Notification = {
	id: number;
	user_id: number;
	sender: Pick<User, 'id' | 'username' | 'name' | 'avatar'>;
	post: Pick<Post, 'id' | 'content'>;
	type: 'like' | 'reply' | 'mention';
	created_at: Date;
	read_at: Date | null;
};
