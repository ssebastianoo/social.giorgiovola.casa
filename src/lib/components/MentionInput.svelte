<script lang="ts">
	import type { User } from '#lib/types.js';
	import { getAvatar } from '#lib/utils.js';

	type Suggestion = Pick<User, 'username' | 'name' | 'avatar'>;

	export let value = '';
	export let name = 'content';
	export let placeholder = '';
	export let maxlength = 2000;
	export let required = false;

	let input: HTMLInputElement;
	let suggestions: Suggestion[] = [];
	let active = 0;
	// index of the "@" being completed, null when no mention is being typed
	let start: number | null = null;
	let query = '';
	let timer: ReturnType<typeof setTimeout>;
	let request = 0;
	const listId = `mentions-${Math.random().toString(36).slice(2)}`;

	$: open = start !== null && suggestions.length > 0;

	function close() {
		clearTimeout(timer);
		request++;
		start = null;
		suggestions = [];
	}

	/** Looks for an "@word" right before the caret. */
	function detect() {
		const caret = input.selectionStart ?? 0;
		const match = /(?:^|\s)@([a-zA-Z0-9_]{0,32})$/.exec(input.value.slice(0, caret));
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
		if (start === null) return;
		const caret = input.selectionStart ?? value.length;
		const inserted = `@${user.username} `;
		value = value.slice(0, start) + inserted + value.slice(caret);
		const position = start + inserted.length;
		close();
		input.focus();
		// wait for the value to reach the DOM before moving the caret
		requestAnimationFrame(() => input.setSelectionRange(position, position));
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
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
	<input
		bind:this={input}
		bind:value
		class="input"
		type="text"
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
		on:input={detect}
		on:click={detect}
		on:keydown={onKeydown}
		on:keyup={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && detect()}
		on:blur={close}
	/>
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
					on:mousedown|preventDefault={() => select(user)}
					on:mouseenter={() => (active = i)}
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
