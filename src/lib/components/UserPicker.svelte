<script lang="ts">
	import { onDestroy } from 'svelte';
	import Avatar from './Avatar.svelte';
	import type { ChatPeer } from '#lib/types.js';

	type Props = {
		/** the people picked so far */
		selected: ChatPeer[];
		/** usernames that can't be picked (yourself, current members) */
		exclude?: string[];
		/** how many can be picked in all */
		max: number;
	};

	let { selected = $bindable(), exclude = [], max }: Props = $props();

	let query = $state('');
	let results = $state<ChatPeer[]>([]);
	let timer: ReturnType<typeof setTimeout>;
	let request = 0;

	const visible = $derived(
		results.filter(
			(r) => !exclude.includes(r.username) && !selected.some((s) => s.username === r.username)
		)
	);

	function onSearch() {
		clearTimeout(timer);
		const current = ++request;
		const q = query.trim().replace(/^@/, '').toLowerCase();
		if (!q) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
				// a newer keystroke supersedes this response
				if (!res.ok || current !== request) return;
				results = await res.json();
			} catch {
				results = [];
			}
		}, 120);
	}

	function pick(peer: ChatPeer) {
		if (selected.length >= max) return;
		selected = [...selected, peer];
		query = '';
		results = [];
	}

	const unpick = (peer: ChatPeer) =>
		(selected = selected.filter((s) => s.username !== peer.username));

	onDestroy(() => clearTimeout(timer));
</script>

<div class="flex flex-col gap-2.5">
	{#if selected.length > 0}
		<div class="flex flex-wrap gap-[5px]">
			{#each selected as peer (peer.username)}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-[5px] rounded-full border border-accent py-0.5 pr-2.5 pl-0.5 text-[0.9em] outline-none hover:border-danger"
					title="Remove @{peer.username}"
					onclick={() => unpick(peer)}
				>
					<Avatar user={peer} size={24} clickable={false} />
					{peer.name}
					<span aria-hidden="true" class="opacity-70">×</span>
				</button>
			{/each}
		</div>
	{/if}

	<input
		class="input"
		type="search"
		placeholder={selected.length >= max ? 'The group is full' : 'Search people to add'}
		aria-label="Search people to add"
		autocomplete="off"
		maxlength="33"
		disabled={selected.length >= max}
		bind:value={query}
		oninput={onSearch}
	/>

	{#if query.trim()}
		<div class="flex flex-col gap-1">
			{#each visible as result (result.username)}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-2.5 rounded-md p-2.5 text-left outline-none hover:bg-black focus-visible:bg-black"
					onclick={() => pick(result)}
				>
					<Avatar user={result} size={40} clickable={false} />
					<div class="flex min-w-0 flex-col">
						<span class="truncate font-extrabold">{result.name}</span>
						<span class="truncate text-[0.85em] opacity-70">@{result.username}</span>
					</div>
				</button>
			{:else}
				<p class="p-2.5 text-muted">Nobody found.</p>
			{/each}
		</div>
	{/if}
</div>
