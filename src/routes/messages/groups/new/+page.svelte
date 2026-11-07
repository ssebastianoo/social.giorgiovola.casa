<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '#lib/components/Button.svelte';
	import UserPicker from '#lib/components/UserPicker.svelte';
	import { user } from '#lib/store.js';
	import type { ChatPeer } from '#lib/types.js';

	// same limits as the server (src/lib/server/validation.ts)
	const MAX_NAME = 64;
	const MAX_MEMBERS = 32;

	let name = $state('');
	let members = $state<ChatPeer[]>([]);
	let creating = $state(false);
	let error = $state<string | null>(null);

	const ready = $derived(name.trim().length > 0 && members.length > 0 && !creating);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!ready) return;
		creating = true;
		error = null;
		try {
			const res = await fetch('/api/groups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), members: members.map((m) => m.username) })
			});
			if (res.ok) {
				const { id }: { id: number } = await res.json();
				await goto(`/messages/groups/${id}`, { replaceState: true });
				return;
			}
			error = res.status < 500 ? await res.text() : 'Something went wrong.';
		} catch {
			error = 'Could not reach the server, check your connection.';
		}
		creating = false;
	}
</script>

<svelte:head>
	<title>New group</title>
</svelte:head>

<div class="mb-5 flex items-center gap-2.5">
	<a
		class="px-1 text-[1.4em] text-inherit hover:no-underline"
		href="/messages"
		title="Back to messages">&larr;</a
	>
	<h1>New group</h1>
</div>

<form class="flex flex-col gap-5" onsubmit={create}>
	<label class="flex flex-col">
		<span class="text-[0.8em] opacity-80">Name</span>
		<input
			class="border-b p-2.5"
			type="text"
			maxlength={MAX_NAME}
			placeholder="Group name"
			autocomplete="off"
			required
			bind:value={name}
		/>
	</label>

	<div class="flex flex-col gap-[5px]">
		<span class="text-[0.8em] opacity-80">People ({members.length + 1}/{MAX_MEMBERS})</span>
		<UserPicker
			bind:selected={members}
			exclude={$user ? [$user.username] : []}
			max={MAX_MEMBERS - 1}
		/>
	</div>

	{#if error}
		<p class="rounded-[5px] bg-danger p-[5px]">{error}</p>
	{/if}

	<Button type="submit" variant="primary" class="self-start" disabled={!ready}>Create group</Button>
</form>
