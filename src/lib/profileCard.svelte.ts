import type { Action } from 'svelte/action';
import type { ProfileCard } from './types';

// the profile hover card is a single popover mounted in the root layout, like the image viewer
const OPEN_DELAY = 500;
const CLOSE_DELAY = 250;
const CACHE_MS = 60_000;

export const hoverCard = $state<{ anchor: HTMLElement | null; data: ProfileCard | null }>({
	anchor: null,
	data: null
});

const cache = new Map<string, { at: number; card: Promise<ProfileCard | null> }>();

function fetchCard(username: string) {
	const hit = cache.get(username);
	if (hit && Date.now() - hit.at < CACHE_MS) return hit.card;
	const card = fetch(`/api/users/${encodeURIComponent(username)}/card`)
		.then((res) => (res.ok ? (res.json() as Promise<ProfileCard>) : null))
		.catch(() => null);
	cache.set(username, { at: Date.now(), card });
	// failures aren't worth remembering
	card.then((c) => c || cache.delete(username));
	return card;
}

/** Replaces the cached card, after following from it. */
export function setCard(card: ProfileCard) {
	cache.set(card.username, { at: Date.now(), card: Promise.resolve(card) });
	if (hoverCard.data?.username === card.username) hoverCard.data = card;
}

let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
// the element waiting for its card, so a card that loads after the pointer left is dropped
let pending: HTMLElement | null = null;

export function closeCard() {
	clearTimeout(openTimer);
	clearTimeout(closeTimer);
	pending = null;
	hoverCard.anchor = null;
	hoverCard.data = null;
}

/** Keeps the card open while the pointer moves from the anchor onto it. */
export const holdCard = () => clearTimeout(closeTimer);

export function releaseCard() {
	clearTimeout(closeTimer);
	closeTimer = setTimeout(closeCard, CLOSE_DELAY);
}

/** Opens the profile card of `username` when a mouse rests on the element. */
export const profileHover: Action<HTMLElement, string> = (node, username) => {
	let current = username;

	const enter = (e: PointerEvent) => {
		// touch and pen taps would open it on the way to following the link
		if (e.pointerType !== 'mouse') return;
		holdCard();
		if (hoverCard.anchor === node) return;
		clearTimeout(openTimer);
		pending = node;
		openTimer = setTimeout(async () => {
			const card = await fetchCard(current);
			if (pending !== node || !card) return;
			pending = null;
			hoverCard.anchor = node;
			hoverCard.data = card;
		}, OPEN_DELAY);
	};

	const leave = () => {
		clearTimeout(openTimer);
		if (pending === node) pending = null;
		if (hoverCard.anchor) releaseCard();
	};

	node.addEventListener('pointerenter', enter);
	node.addEventListener('pointerleave', leave);
	return {
		update(username) {
			current = username;
		},
		destroy() {
			node.removeEventListener('pointerenter', enter);
			node.removeEventListener('pointerleave', leave);
			if (pending === node) pending = null;
			if (hoverCard.anchor === node) closeCard();
		}
	};
};
