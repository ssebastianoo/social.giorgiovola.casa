<script lang="ts">
	import type { User } from '#lib/types.js';
	import { getAvatar } from '#lib/utils.js';

	type Suggestion = Pick<User, 'username' | 'name' | 'avatar'>;

	type Props = {
		value?: string;
		name?: string;
		placeholder?: string;
		maxlength?: number;
		required?: boolean;
	};

	let {
		value = $bindable(''),
		name = 'content',
		placeholder = '',
		maxlength = 2000,
		required = false
	}: Props = $props();

	// a textarea that grows with the text, so a long post can be read whole before sending it
	let input: HTMLTextAreaElement | undefined = $state();
	let suggestions: Suggestion[] = $state([]);
	let active = $state(0);
	// index of the "@" being completed, null when no mention is being typed
	let start: number | null = $state(null);
	let query = '';
	let timer: ReturnType<typeof setTimeout>;
	let request = 0;
	const listId = `mentions-${Math.random().toString(36).slice(2)}`;

	const open = $derived(start !== null && suggestions.length > 0);

	// fit the height to the text, also when it is cleared or a mention is inserted
	$effect(() => {
		void value;
		if (!input) return;
		input.style.height = 'auto';
		// scrollHeight leaves out the bottom border
		input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
	});

	function close() {
		clearTimeout(timer);
		request++;
		start = null;
		suggestions = [];
	}

	/** Looks for an "@word" right before the caret. */
	function detect() {
		if (!input) return;
		const caret = input.selectionStart ?? 0;
		const match = /(?<![a-zA-Z0-9_@/])@([a-zA-Z0-9_]{0,32})$/.exec(input.value.slice(0, caret));
		if (!match) return close();

		const newStart = caret - match[1].length - 1;
		if (newStart === start && match[1] === query) return;
		start = newStart;
		query = match[1];
		clearTimeout(timer);
		timer = setTimeout(search, 120);
	}

	async function search() {
		const current = ++request;
		try {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.toLowerCase())}`);
			// a newer keystroke (or closing) supersedes this response
			if (!res.ok || current !== request) return;
			suggestions = await res.json();
			active = 0;
		} catch {
			// autocomplete is a nicety, typing must keep working
		}
	}

	function select(user: Suggestion) {
		if (start === null || !input) return;
		const el = input;
		const caret = input.selectionStart ?? value.length;
		const inserted = `@${user.username} `;
		value = value.slice(0, start) + inserted + value.slice(caret);
		const position = start + inserted.length;
		close();
		el.focus();
		// wait for the value to reach the DOM before moving the caret
		requestAnimationFrame(() => el.setSelectionRange(position, position));
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) {
			// Enter sends, like the single line input this used to be (posts don't keep newlines)
			if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
				e.preventDefault();
				input?.form?.requestSubmit();
			}
			return;
		}
		if (e.key === 'ArrowDown') {
			active = (active + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			active = (active - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			select(suggestions[active]);
		} else if (e.key === 'Escape') {
			close();
		} else {
			return;
		}
		e.preventDefault();
	}
</script>

<div class="relative w-full">
	<!-- prettier-ignore -->
	<textarea
		bind:this={input}
		bind:value
		class="input block max-h-[40vh] w-full resize-none overflow-y-auto wrap-anywhere"
		rows="1"
		{name}
		{required}
		{placeholder}
		{maxlength}
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={open ? `${listId}-${active}` : undefined}
		oninput={detect}
		onclick={detect}
		onkeydown={onKeydown}
		onkeyup={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && detect()}
		onblur={close}
	></textarea>
	{#if open}
		<ul
			id={listId}
			role="listbox"
			class="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-accent bg-background/95 backdrop-blur-[2px]"
		>
			{#each suggestions as user, i (user.username)}
				<!-- mousedown (not click) so the input keeps focus and doesn't blur-close first -->
				<li
					id={`${listId}-${i}`}
					role="option"
					aria-selected={i === active}
					class="flex cursor-pointer items-center gap-2.5 p-2.5 {i === active ? 'bg-black' : ''}"
					onmousedown={(e) => {
						e.preventDefault();
						select(user);
					}}
					onmouseenter={() => (active = i)}
				>
					<img
						class="aspect-square max-w-none rounded-full object-cover"
						src={getAvatar(user, 32)}
						alt=""
						width="32"
						height="32"
					/>
					<div class="flex min-w-0 flex-col">
						<span class="truncate font-extrabold">{user.name}</span>
						<span class="truncate text-[0.85rem] opacity-70">@{user.username}</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
