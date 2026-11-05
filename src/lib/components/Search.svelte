<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { hashtagHref } from '#lib/hashtags.js';
	import type { HashtagResult, UserResult } from '#lib/types.js';
	import Avatar from './Avatar.svelte';

	type Item =
		| { kind: 'user'; href: string; user: UserResult }
		| { kind: 'hashtag'; href: string; hashtag: HashtagResult }
		| { kind: 'all'; href: string };

	let query = $state('');
	let users = $state<UserResult[]>([]);
	let hashtags = $state<HashtagResult[]>([]);
	// the query the results above belong to
	let resultsFor = $state<string | null>(null);
	let focused = $state(false);
	// small screens show an icon that expands into a full width bar
	let expanded = $state(false);
	// -1: nothing picked, Enter searches for the query
	let active = $state(-1);
	let input: HTMLInputElement;
	let timer: ReturnType<typeof setTimeout>;
	let request = 0;
	const listId = `search-${Math.random().toString(36).slice(2)}`;

	const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

	const trimmed = $derived(query.trim());
	const items: Item[] = $derived([
		...users.map((user) => ({ kind: 'user' as const, href: `/@${user.username}`, user })),
		...hashtags.map((hashtag) => ({
			kind: 'hashtag' as const,
			href: hashtagHref(hashtag.tag),
			hashtag
		})),
		...(trimmed ? [{ kind: 'all' as const, href: `/search?q=${encodeURIComponent(trimmed)}` }] : [])
	]);
	const open = $derived(focused && resultsFor !== null && items.length > 0);
	const userCount = $derived(users.length);

	async function fetchResults() {
		const q = trimmed;
		const current = ++request;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			// a newer keystroke supersedes this response
			if (!res.ok || current !== request) return;
			({ users, hashtags } = await res.json());
			resultsFor = q;
			active = -1;
		} catch {
			// suggestions are a nicety, the search page still works
		}
	}

	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(fetchResults, 150);
	}

	function onFocus() {
		focused = true;
		if (resultsFor !== trimmed) fetchResults();
	}

	function close() {
		clearTimeout(timer);
		request++;
		focused = false;
		active = -1;
	}

	async function expand() {
		expanded = true;
		await tick();
		input.focus();
	}

	function collapse() {
		close();
		expanded = false;
		input?.blur();
	}

	afterNavigate(() => {
		collapse();
		query = '';
		resultsFor = null;
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			collapse();
		} else if (!open) {
			return;
		} else if (e.key === 'ArrowDown') {
			active = active + 1 >= items.length ? -1 : active + 1;
		} else if (e.key === 'ArrowUp') {
			active = active <= -1 ? items.length - 1 : active - 1;
		} else if (e.key === 'Enter' && active >= 0) {
			goto(items[active].href);
		} else {
			return;
		}
		e.preventDefault();
	}

	const rowClass = (i: number) =>
		`flex items-center gap-2.5 rounded-[5px] p-[5px] text-foreground hover:no-underline ${
			i === active ? 'bg-white/5' : ''
		}`;
</script>

{#snippet searchIcon(className: string)}
	<svg
		class={className}
		xmlns="http://www.w3.org/2000/svg"
		height="1.2em"
		viewBox="0 0 512 512"
		aria-hidden="true"
		><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
			d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 368a160 160 0 1 0 0-320 160 160 0 1 0 0 320z"
		/></svg
	>
{/snippet}

{#if !expanded}
	<button
		type="button"
		class="group flex h-8.75 cursor-pointer items-center outline-none sm:hidden"
		aria-label="Search"
		title="Search"
		onclick={expand}
	>
		{@render searchIcon('fill-white group-hover:fill-accent')}
	</button>
{/if}

<!-- a plain GET form: Enter opens the search page, with or without JavaScript -->
<form
	action="/search"
	role="search"
	class={expanded
		? 'absolute inset-0 z-10 flex items-center gap-2.5 bg-background px-5 sm:static sm:bg-transparent sm:px-0'
		: 'hidden sm:flex sm:items-center'}
>
	<div
		class="relative w-full sm:w-56 md:w-72"
		onfocusout={(e) => {
			// focus moving into the list (or nowhere, on a click inside it) keeps it open
			const next = e.relatedTarget as Node | null;
			if (!next || !e.currentTarget.contains(next)) close();
		}}
	>
		<div class="flex items-center gap-2.5 border-b border-foreground px-[5px]">
			{@render searchIcon('shrink-0 fill-muted')}
			<input
				bind:this={input}
				bind:value={query}
				class="w-full bg-transparent py-[5px] outline-none"
				type="search"
				name="q"
				placeholder="Search people and #hashtags"
				maxlength="64"
				autocomplete="off"
				role="combobox"
				aria-label="Search"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
				oninput={onInput}
				onfocus={onFocus}
				onkeydown={onKeydown}
			/>
		</div>
		{#if open}
			<!-- mousedown is cancelled so the input keeps focus until the link's click navigates -->
			<div
				id={listId}
				role="listbox"
				tabindex="-1"
				class="absolute top-full right-0 left-0 mt-[5px] flex flex-col gap-[5px] rounded-[5px] border border-accent bg-background p-[5px]"
				onmousedown={(e) => e.preventDefault()}
			>
				{#if !trimmed}
					<p class="px-[5px] text-[0.8em] text-muted">Trending</p>
				{/if}
				{#each items as item, i (item.href)}
					{#if trimmed && item.kind === 'user' && i === 0}
						<p class="px-[5px] text-[0.8em] text-muted">People</p>
					{:else if trimmed && item.kind === 'hashtag' && i === userCount}
						<p class="px-[5px] text-[0.8em] text-muted">Hashtags</p>
					{/if}
					<a
						id="{listId}-{i}"
						role="option"
						aria-selected={i === active}
						class={rowClass(i)}
						href={item.href}
						onmouseenter={() => (active = i)}
					>
						{#if item.kind === 'user'}
							<Avatar size={32} user={item.user} clickable={false} />
							<span class="flex min-w-0 flex-col">
								<span class="truncate font-bold">{item.user.name}</span>
								<span class="truncate text-[0.85em] opacity-70">@{item.user.username}</span>
							</span>
						{:else if item.kind === 'hashtag'}
							<span class="min-w-0 grow truncate font-bold">#{item.hashtag.tag}</span>
							<span class="shrink-0 text-[0.85em] text-muted"
								>{nf.format(item.hashtag.posts)}
								{item.hashtag.posts === 1 ? 'post' : 'posts'}</span
							>
						{:else}
							<span class="min-w-0 truncate text-[0.9em]">Search for “{trimmed}”</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
	{#if expanded}
		<button
			type="button"
			class="group flex shrink-0 cursor-pointer outline-none sm:hidden"
			aria-label="Close search"
			title="Close search"
			onclick={collapse}
		>
			<svg
				class="fill-white group-hover:fill-accent"
				xmlns="http://www.w3.org/2000/svg"
				height="1.2em"
				viewBox="0 0 384 512"
				aria-hidden="true"
				><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
					d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
				/></svg
			>
		</button>
	{/if}
</form>
