import type { ChatMessage, GroupMessage, Post } from './types';

/** Events pushed by /api/stream. */
export type RealtimeEvents = {
	post: Post;
	post_deleted: { id: number };
	counts: {
		id: number;
		likes?: number;
		replies_count?: number;
		regiorgs?: number;
		quotes?: number;
	};
	/** someone voted in a poll: the vote counts of each option */
	poll: { id: number; votes: number[] };
	/** someone regiorged a post: the post, with `regiorged_by` set */
	regiorg: Post;
	notifications: { count: number };
	message: ChatMessage;
	message_deleted: { id: number };
	messages_unread: { count: number };
	group_message: GroupMessage;
	group_message_deleted: { group_id: number; id: number };
	/** a group was renamed or its members changed (you may have been removed) */
	group_updated: { id: number };
	/** someone is writing to you: in a group, or in your direct conversation (group_id null) */
	typing: { group_id: number | null; user: { username: string; name: string } };
	/** the stream (re)connected: anything sent while it was down was missed */
	open: undefined;
};

type Listener<K extends keyof RealtimeEvents> = (data: RealtimeEvents[K]) => void;

const listeners = new Map<string, Set<Listener<never>>>();
let source: EventSource | null = null;

/** Subscribes to an event; returns the unsubscribe function. */
export function onRealtime<K extends keyof RealtimeEvents>(event: K, fn: Listener<K>) {
	let set = listeners.get(event);
	if (!set) listeners.set(event, (set = new Set()));
	set.add(fn as Listener<never>);
	return () => set.delete(fn as Listener<never>);
}

/** (Re)opens the stream. The server picks the user from the session cookie. */
export function connectRealtime() {
	disconnectRealtime();
	source = new EventSource('/api/stream');
	source.addEventListener('open', () => {
		for (const fn of listeners.get('open') ?? []) (fn as () => void)();
	});
	const events: (keyof RealtimeEvents)[] = [
		'post',
		'post_deleted',
		'counts',
		'regiorg',
		'poll',
		'notifications',
		'message',
		'message_deleted',
		'messages_unread',
		'group_message',
		'group_message_deleted',
		'group_updated',
		'typing'
	];
	for (const event of events) {
		source.addEventListener(event, (e) => {
			let data;
			try {
				data = JSON.parse((e as MessageEvent).data);
			} catch {
				return;
			}
			for (const fn of listeners.get(event) ?? []) (fn as (d: unknown) => void)(data);
		});
	}
}

export function disconnectRealtime() {
	source?.close();
	source = null;
}
