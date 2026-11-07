<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import { modal } from '#lib/modal.js';
	import { share, closeShare, postUrl } from '#lib/share.svelte.js';
	import { isMobile, user } from '#lib/store.js';
	import type { ChatPeer, ShareRecipient } from '#lib/types.js';

	const target = $derived(share.target);
	const open = $derived(target !== null);

	let recent: ShareRecipient[] = $state([]);
	let groups: ShareRecipient[] = $state([]);
	let loadingRecent = $state(false);
	let query = $state('');
	let results: ShareRecipient[] = $state([]);
	let selected: ShareRecipient | null = $state(null);
	let note = $state('');
	let sending = $state(false);
	let error = $state('');

	let searchInput: HTMLInputElement | undefined = $state();
	// height of the on-screen keyboard, so the sheet stays above it
	let keyboard = $state(0);

	const searching = $derived(query.trim() !== '');
	// groups match by name, on the client: the dialog already has all of them
	const matchingGroups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return groups.filter((g) => g.kind === 'group' && g.group.name.toLowerCase().includes(q));
	});
	const people = $derived(searching ? [...matchingGroups, ...results] : recent);

	const keyOf = (r: ShareRecipient) =>
		r.kind === 'user' ? `user:${r.peer.username}` : `group:${r.group.id}`;
	const labelOf = (r: ShareRecipient) => (r.kind === 'user' ? `@${r.peer.username}` : r.group.name);

	// every opening starts empty
	$effect(() => {
		if (!open) return;
		query = '';
		results = [];
		selected = null;
		note = '';
		error = '';
		loadRecent();
		// on touch screens the keyboard would cover the recent people, so it waits for a tap
		if (!$isMobile) queueMicrotask(() => searchInput?.focus());
	});

	$effect(() => {
		if (!open) return;
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => (keyboard = Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
		update();
		vv.addEventListener('resize', update);
		vv.addEventListener('scroll', update);
		return () => {
			vv.removeEventListener('resize', update);
			vv.removeEventListener('scroll', update);
			keyboard = 0;
		};
	});

	afterNavigate(closeShare);

	async function loadRecent() {
		loadingRecent = true;
		try {
			const res = await fetch('/api/messages');
			if (res.ok) ({ recent, groups } = await res.json());
		} catch {
			// the search still works without them
		} finally {
			loadingRecent = false;
		}
	}

	let timer: ReturnType<typeof setTimeout>;
	let request = 0;

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
				const found: ChatPeer[] = await res.json();
				results = found
					.filter((u) => u.username !== $user?.username)
					.map((peer) => ({ kind: 'user', peer }));
			} catch {
				results = [];
			}
		}, 120);
	}

	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (!target || !selected || sending) return;
		sending = true;
		error = '';
		const url = postUrl(target);
		const text = note.trim();
		try {
			const content = text ? `${text}\n${url}` : url;
			const res = await fetch(
				selected.kind === 'user' ? '/api/messages' : `/api/groups/${selected.group.id}/messages`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(
						selected.kind === 'user' ? { to: selected.peer.username, content } : { content }
					)
				}
			);
			if (!res.ok) {
				error = (await res.text()) || 'Could not send the message';
				return;
			}
			target.notify?.(`Sent to ${labelOf(selected)}!`);
			closeShare();
		} catch {
			error = 'Could not send the message';
		} finally {
			sending = false;
		}
	}
</script>

<dialog
	class="fixed top-0 left-0 z-999 m-0 h-full w-screen border-none bg-background/20 p-0 text-foreground backdrop-blur-[2px]"
	{open}
	aria-modal="true"
	aria-labelledby="share-title"
	use:modal={{ open, onclose: closeShare }}
>
	{#if target}
		<div
			class="flex h-full items-end justify-center sm:items-center"
			style:padding-bottom="{keyboard}px"
		>
			<!-- a bottom sheet on phones, a centered dialog elsewhere -->
			<div
				data-modal-panel
				class="flex max-h-full w-full flex-col gap-2.5 overflow-hidden rounded-t-md border-t border-accent bg-background p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:w-[calc(85%+2px)] sm:max-w-[392px] sm:rounded-md sm:border sm:bg-background/80 sm:pb-5"
			>
				<div class="flex items-center gap-2.5">
					<h3 id="share-title" class="flex-1 font-bold">Send via message</h3>
					<button
						class="flex size-8 cursor-pointer items-center justify-center outline-none"
						aria-label="Close"
						onclick={closeShare}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							height="1.6em"
							viewBox="0 0 384 512"
							fill="#bb5353"
							><path
								d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
							/></svg
						>
					</button>
				</div>
				<input
					bind:this={searchInput}
					class="input"
					type="search"
					placeholder="Search people and groups"
					aria-label="Search people and groups"
					autocomplete="off"
					maxlength="33"
					bind:value={query}
					oninput={onSearch}
				/>
				<div
					class="-mx-[5px] flex min-h-0 flex-col overflow-y-auto px-[5px] sm:max-h-[min(40vh,320px)]"
					role="listbox"
					aria-label={searching ? 'Search results' : 'Recent conversations'}
				>
					{#if !searching}
						<p class="px-2.5 pb-[5px] text-[0.8em] text-muted">Recent</p>
					{/if}
					{#each people as person (keyOf(person))}
						{@const isSelected = selected !== null && keyOf(selected) === keyOf(person)}
						<button
							class="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-[5px] text-left outline-none hover:bg-white/5 focus-visible:bg-white/5 {isSelected
								? 'border-accent'
								: 'border-transparent'}"
							role="option"
							aria-selected={isSelected}
							onclick={() => {
								selected = isSelected ? null : person;
								error = '';
							}}
						>
							{#if person.kind === 'user'}
								<Avatar user={person.peer} size={40} clickable={false} />
								<span class="flex min-w-0 flex-1 flex-col">
									<span class="truncate font-bold">{person.peer.name}</span>
									<span class="truncate text-[0.85em] opacity-70">@{person.peer.username}</span>
								</span>
							{:else}
								{#if person.group.members.length === 1}
									<Avatar user={person.group.members[0]} size={40} clickable={false} />
								{:else if person.group.members.length === 0}
									<!-- everyone else left -->
									<div class="size-10 shrink-0 rounded-full border border-line" aria-hidden="true">
										&nbsp;
									</div>
								{:else}
									<!-- two faces of the group, stacked in the space of one avatar -->
									<div class="relative size-10 shrink-0">
										{#each person.group.members.slice(0, 2) as member, i (member.username)}
											<div class="absolute {i === 0 ? 'top-0 left-0' : 'right-0 bottom-0'}">
												<Avatar user={member} size={26} clickable={false} />
											</div>
										{/each}
									</div>
								{/if}
								<span class="flex min-w-0 flex-1 flex-col">
									<span class="truncate font-bold">{person.group.name}</span>
									<span class="truncate text-[0.85em] opacity-70">
										{person.group.size} members
									</span>
								</span>
							{/if}
							{#if isSelected}
								<svg
									height="18px"
									viewBox="0 0 24 24"
									fill="none"
									stroke="#799a74"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									xmlns="http://www.w3.org/2000/svg"
									aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg
								>
							{/if}
						</button>
					{:else}
						<p class="px-2.5 py-[5px] text-[0.85em] text-muted">
							{#if searching}
								Nobody found.
							{:else if loadingRecent}
								Loading…
							{:else}
								No conversations yet, search for someone above.
							{/if}
						</p>
					{/each}
				</div>
				<form class="flex flex-col gap-2.5" onsubmit={send}>
					<input
						class="input"
						placeholder="Add a message (optional)"
						aria-label="Message"
						maxlength="1500"
						bind:value={note}
					/>
					{#if error}
						<p class="rounded-[5px] bg-danger p-[5px]" role="alert">{error}</p>
					{/if}
					<Button
						type="submit"
						variant="primary"
						size="lg"
						class="w-full"
						disabled={!selected || sending}
					>
						{sending ? 'Sending…' : selected ? `Send to ${labelOf(selected)}` : 'Choose someone'}
					</Button>
				</form>
			</div>
		</div>
	{/if}
</dialog>
