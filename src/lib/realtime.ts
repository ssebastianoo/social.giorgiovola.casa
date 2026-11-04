import type { Post } from './types';

/** Events pushed by /api/stream. */
export type RealtimeEvents = {
	post: Post;
	post_deleted: { id: number };
	counts: { id: number; likes?: number; replies_count?: number };
	notifications: { count: number };
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
	const events: (keyof RealtimeEvents)[] = ['post', 'post_deleted', 'counts', 'notifications'];
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
