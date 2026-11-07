<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import UserPicker from '#lib/components/UserPicker.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { user } from '#lib/store.js';
	import type { ChatPeer } from '#lib/types.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// same limits as the server (src/lib/server/validation.ts)
	const MAX_NAME = 64;
	const MAX_MEMBERS = 32;

	type Init = NonNullable<Parameters<typeof fetch>[1]>;

	const group = $derived(data.group);
	const base = $derived(`/api/groups/${group.id}`);
	const isOwner = $derived(group.owner === $user?.username);

	// null until edited, so a rename by someone else shows up
	let draft = $state<string | null>(null);
	const name = $derived(draft ?? group.name);
	let adding = $state<ChatPeer[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function call(url: string, init: Init) {
		busy = true;
		error = null;
		try {
			const res = await fetch(url, init);
			if (res.ok) return true;
			error = res.status < 500 ? await res.text() : 'Something went wrong.';
		} catch {
			error = 'Could not reach the server, check your connection.';
		} finally {
			busy = false;
		}
		return false;
	}

	const json = (method: string, body: unknown): Init => ({
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	async function rename(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim() || name.trim() === group.name) return;
		if (await call(base, json('PATCH', { name: name.trim() }))) {
			draft = null;
			await invalidate('app:group');
		}
	}

	async function add() {
		if (adding.length === 0) return;
		const usernames = adding.map((p) => p.username);
		if (await call(`${base}/members`, json('POST', { usernames }))) {
			adding = [];
			await invalidate('app:group');
		}
	}

	async function remove(member: ChatPeer) {
		if (!confirm(`Remove ${member.name} from ${group.name}?`)) return;
		if (await call(`${base}/members/${member.username}`, { method: 'DELETE' }))
			await invalidate('app:group');
	}

	async function leave() {
		const last = group.members.length === 1;
		const warning = last
			? `Leave ${group.name}? You are the last member: the group and its messages will be deleted.`
			: `Leave ${group.name}? You won't get its messages anymore unless someone adds you back.`;
		if (!confirm(warning)) return;
		if (await call(`${base}/members/${$user?.username}`, { method: 'DELETE' }))
			await goto('/messages', { replaceState: true });
	}

	onMount(() =>
		onRealtime('group_updated', ({ id }) => {
			if (id === group.id) invalidate('app:group');
		})
	);
</script>

<svelte:head>
	<title>{group.name} · Group info</title>
</svelte:head>

<div class="mb-5 flex items-center gap-2.5">
	<a
		class="px-1 text-[1.4em] text-inherit hover:no-underline"
		href={`/messages/groups/${group.id}`}
		title="Back to the chat">&larr;</a
	>
	<h1 class="truncate">{group.name}</h1>
</div>

{#if error}
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{error}</p>
{/if}

<section class="mb-10 flex flex-col gap-3">
	<h2 class="font-bold">Name</h2>
	<form class="flex items-end gap-2.5" onsubmit={rename}>
		<input
			class="flex-1 border-b p-2.5"
			type="text"
			maxlength={MAX_NAME}
			aria-label="Group name"
			autocomplete="off"
			required
			value={name}
			oninput={(e) => (draft = e.currentTarget.value)}
		/>
		<Button type="submit" disabled={busy || !name.trim() || name.trim() === group.name}>Save</Button
		>
	</form>
</section>

<section class="mb-10 flex flex-col gap-3">
	<h2 class="font-bold">Members ({group.members.length}/{MAX_MEMBERS})</h2>
	<div class="flex flex-col gap-1">
		{#each group.members as member (member.username)}
			<div class="flex items-center gap-2.5 rounded-md p-2.5">
				<Avatar user={member} size={45} />
				<a class="flex min-w-0 flex-1 flex-col text-inherit" href={`/@${member.username}`}>
					<span class="truncate font-extrabold">
						{member.name}
						{#if member.username === $user?.username}<span class="font-medium opacity-70"
								>(you)</span
							>{/if}
					</span>
					<span class="truncate text-[0.85em] opacity-70">@{member.username}</span>
				</a>
				{#if member.username === group.owner}
					<span class="shrink-0 rounded-full border border-accent px-[7px] text-[0.75em]"
						>Owner</span
					>
				{:else if isOwner}
					<Button
						variant="danger"
						size="sm"
						class="shrink-0"
						disabled={busy}
						onclick={() => remove(member)}>Remove</Button
					>
				{/if}
			</div>
		{/each}
	</div>
</section>

{#if group.members.length < MAX_MEMBERS}
	<section class="mb-10 flex flex-col gap-3">
		<h2 class="font-bold">Add people</h2>
		<UserPicker
			bind:selected={adding}
			exclude={group.members.map((m) => m.username)}
			max={MAX_MEMBERS - group.members.length}
		/>
		{#if adding.length > 0}
			<Button class="self-start" variant="primary" disabled={busy} onclick={add}
				>Add {adding.length === 1 ? adding[0].name : `${adding.length} people`}</Button
			>
		{/if}
	</section>
{/if}

<section class="mb-10 flex flex-col gap-3">
	<Button variant="danger" class="self-start" disabled={busy} onclick={leave}>Leave group</Button>
</section>
