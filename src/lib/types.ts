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
};
