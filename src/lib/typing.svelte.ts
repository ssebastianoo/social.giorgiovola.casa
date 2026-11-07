import { onRealtime } from './realtime';

/**
 * Typing indicators. Who is writing to you, per conversation: `dm:<username>` for a direct one,
 * `group:<id>` for a group. Writers send a signal every few seconds (sendTyping), and an entry
 * fades out when they stop, or as soon as their message arrives.
 */

// how often a writer signals, and how long an entry lasts without a new signal
const SEND_EVERY_MS = 3000;
const EXPIRE_MS = 6000;

type Typer = { username: string; name: string };

export const dmKey = (username: string) => `dm:${username}`;
export const groupKey = (id: number) => `group:${id}`;

const typers = $state<Record<string, Typer[]>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function stop(key: string, username: string) {
	const id = `${key}/${username}`;
	clearTimeout(timers.get(id));
	timers.delete(id);
	const list = typers[key];
	if (!list?.some((t) => t.username === username)) return;
	const rest = list.filter((t) => t.username !== username);
	if (rest.length > 0) typers[key] = rest;
	else delete typers[key];
}

function start(key: string, typer: Typer) {
	const id = `${key}/${typer.username}`;
	clearTimeout(timers.get(id));
	timers.set(
		id,
		setTimeout(() => stop(key, typer.username), EXPIRE_MS)
	);
	const list = typers[key] ?? [];
	if (!list.some((t) => t.username === typer.username)) typers[key] = [...list, typer];
}

let listening = false;

/** Starts listening to the stream; call from components that show indicators. Idempotent. */
export function listenTyping() {
	if (listening) return;
	listening = true;
	onRealtime('typing', ({ group_id, user }) =>
		start(group_id === null ? dmKey(user.username) : groupKey(group_id), user)
	);
	// a message from someone means they are done writing it
	onRealtime('message', (m) => stop(dmKey(m.sender), m.sender));
	onRealtime('group_message', (m) => stop(groupKey(m.group_id), m.sender.username));
	// switching profile reconnects the stream: indicators were for the previous one
	onRealtime('open', () => {
		for (const key of Object.keys(typers)) for (const t of typers[key]) stop(key, t.username);
	});
}

/** Who is writing in a conversation, in the order they started. Reactive. */
export const typingIn = (key: string): Typer[] => typers[key] ?? [];

/** "Alice is typing…", "Alice and Bob are typing…", "Alice, Bob and 2 others are typing…" */
export function typingText(list: Typer[]) {
	const names = list.map((t) => t.name);
	if (names.length === 0) return '';
	if (names.length === 1) return `${names[0]} is typing…`;
	if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
	const others = names.length - 2;
	return `${names[0]}, ${names[1]} and ${others} other${others > 1 ? 's' : ''} are typing…`;
}

const lastSent = new Map<string, number>();

/** Signals that you are writing in a conversation, at most every few seconds. */
export function sendTyping(target: { to: string } | { group: number }) {
	const key = 'to' in target ? dmKey(target.to) : groupKey(target.group);
	const now = Date.now();
	if (now - (lastSent.get(key) ?? 0) < SEND_EVERY_MS) return;
	lastSent.set(key, now);
	fetch('/api/typing', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(target)
	}).catch(() => {});
}

/** Your message went out: the next keystroke signals again right away. */
export function resetTyping(target: { to: string } | { group: number }) {
	lastSent.delete('to' in target ? dmKey(target.to) : groupKey(target.group));
}
