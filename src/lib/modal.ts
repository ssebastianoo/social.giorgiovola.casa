import type { Action } from 'svelte/action';

type Params = { open: boolean; onclose: () => void };

const focusable =
	'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// behaviour of a modal dialog: Escape and a click outside the `[data-modal-panel]` close it, Tab
// stays inside it, focus moves in when it opens and goes back to where it was when it closes
export const modal: Action<HTMLElement, Params> = (node, params) => {
	let current = params;
	let cleanup: (() => void) | undefined;

	const visible = () =>
		[...node.querySelectorAll<HTMLElement>(focusable)].filter((el) => el.offsetParent !== null);

	const start = () => {
		const previous = document.activeElement as HTMLElement | null;

		const onkeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				current.onclose();
			} else if (e.key === 'Tab') {
				const items = visible();
				if (items.length === 0) return e.preventDefault();
				const first = items[0];
				const last = items[items.length - 1];
				const active = document.activeElement;
				if (!node.contains(active)) {
					e.preventDefault();
					first.focus();
				} else if (e.shiftKey && active === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && active === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};
		const onclick = (e: MouseEvent) => {
			if (!(e.target as Element).closest('[data-modal-panel]')) current.onclose();
		};
		// focus that wandered out (a click on the page behind) comes back
		const onfocusin = (e: FocusEvent) => {
			if (!node.contains(e.target as Node)) (visible()[0] ?? node).focus();
		};

		document.addEventListener('keydown', onkeydown, true);
		document.addEventListener('focusin', onfocusin);
		node.addEventListener('click', onclick);

		// content such as the likes list renders after the dialog opens, so wait a tick
		queueMicrotask(() => {
			if (node.contains(document.activeElement)) return;
			const items = visible();
			(node.querySelector<HTMLElement>('input, textarea') ?? items[0] ?? node).focus();
		});

		return () => {
			document.removeEventListener('keydown', onkeydown, true);
			document.removeEventListener('focusin', onfocusin);
			node.removeEventListener('click', onclick);
			if (previous?.isConnected) previous.focus();
		};
	};

	const sync = () => {
		if (current.open && !cleanup) cleanup = start();
		else if (!current.open && cleanup) {
			cleanup();
			cleanup = undefined;
		}
	};
	sync();

	return {
		update(next) {
			current = next;
			sync();
		},
		destroy() {
			cleanup?.();
			cleanup = undefined;
		}
	};
};
