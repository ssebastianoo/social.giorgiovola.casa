import type { GroupMessageKind } from './types';

type Person = { username: string; name: string };

/**
 * The line shown for a group chat event ("Alice added Bob"), in the chat and as the preview in
 * the conversation list. `me` is the viewer's username: they read "You" instead of their name.
 */
export function groupEventText(
	event: { kind: GroupMessageKind; sender: Person; target: Person | null; content: string },
	me: string | null | undefined
) {
	const who = (p: Person | null) => (!p ? 'someone' : p.username === me ? 'you' : p.name);
	const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const sender = capital(who(event.sender));
	switch (event.kind) {
		case 'created':
			return `${sender} created the group "${event.content}"`;
		case 'added':
			return `${sender} added ${who(event.target)}`;
		case 'removed':
			return `${sender} removed ${who(event.target)}`;
		case 'left':
			return `${sender} left`;
		case 'renamed':
			return `${sender} renamed the group to "${event.content}"`;
		case 'owner':
			return `${sender} ${event.sender.username === me ? 'are' : 'is'} now the owner`;
		default:
			return event.content;
	}
}
