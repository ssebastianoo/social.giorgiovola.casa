<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Button from './Button.svelte';
	import { user } from '#lib/store.js';
	import { onRealtime } from '#lib/realtime.js';
	import type { Poll } from '#lib/types.js';

	let { postId, poll }: { postId: number; poll: Poll } = $props();

	// writable derived: follow the post, overwritten by votes and realtime counts
	let votes = $derived(poll.votes);
	let voted = $derived(poll.voted);
	let error: string | null = $state(null);
	let sending = $state(false);

	const endsAt = $derived(new Date(poll.ends_at).getTime());
	// ticks so the time left counts down and the poll closes on screen
	let now = $state(Date.now());
	const closed = $derived(poll.closed || now >= endsAt);
	// results show once you have voted or voting is over
	const showResults = $derived(voted !== null || closed);
	const total = $derived(votes.reduce((a, b) => a + b, 0));
	const leader = $derived(Math.max(...votes));
	// while the poll is open, the result rows move your vote
	const changeable = $derived(voted !== null && !closed);

	const compact = new Intl.NumberFormat(undefined, { notation: 'compact' });

	function timeLeft(ms: number) {
		const minutes = Math.ceil(ms / 60_000);
		if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
		const days = Math.floor(hours / 24);
		return `${days} ${days === 1 ? 'day' : 'days'} left`;
	}

	onMount(() => {
		const tick = setInterval(() => (now = Date.now()), 30_000);
		const off = onRealtime('poll', (p) => {
			if (p.id === postId) votes = p.votes;
		});
		return () => {
			clearInterval(tick);
			off();
		};
	});

	async function vote(option: number) {
		if (!$user) return goto('/login');
		if (sending || option === voted) return;
		sending = true;
		error = null;
		try {
			const res = await fetch(`/api/posts/${postId}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ option })
			});
			if (res.ok) {
				const data = await res.json();
				voted = data.voted;
				// absolute counts, like likes: the realtime event may arrive first
				votes = data.votes;
			} else {
				error = (await res.text()) || 'Could not vote';
			}
		} catch {
			error = 'Could not vote';
		} finally {
			sending = false;
		}
	}
</script>

<!-- Post.svelte doesn't open the post on clicks in here: they vote -->
<div class="flex cursor-default flex-col gap-[5px]" data-poll>
	{#if error}
		<p class="rounded-[5px] bg-danger p-[5px] text-[0.9em]">{error}</p>
	{/if}
	{#each poll.options as option, i}
		{#if showResults}
			{@const share = total ? votes[i] / total : 0}
			<!-- a button only so the vote can move: disabled once final, on your vote and while sending -->
			<button
				type="button"
				disabled={!changeable || voted === i || sending}
				onclick={() => vote(i)}
				class="relative flex w-full items-center justify-between gap-2.5 overflow-hidden rounded-[5px] border border-line p-[5px] text-left enabled:cursor-pointer enabled:hover:border-accent"
			>
				<!-- prettier-ignore -->
				<div class="absolute inset-y-0 left-0 {votes[i] === leader && total ? 'bg-accent/35' : 'bg-white/10'}" style="width: {share * 100}%"></div>
				<span
					class="relative min-w-0 wrap-anywhere {voted === i ? 'font-bold' : ''} {votes[i] ===
						leader && total
						? ''
						: 'opacity-80'}"
				>
					{option}
					{#if voted === i}
						<span class="sr-only">(your vote)</span>
						<svg
							class="inline align-[-2px]"
							height="14px"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#d9d9d9"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg
						>
					{/if}
				</span>
				<span class="relative shrink-0 text-[0.9em]">{Math.round(share * 100)}%</span>
			</button>
		{:else}
			<Button class="w-full" disabled={sending} onclick={() => vote(i)}
				><span class="wrap-anywhere">{option}</span></Button
			>
		{/if}
	{/each}
	<p class="text-[0.85em] text-muted">
		{compact.format(total)}
		{total === 1 ? 'vote' : 'votes'} · {closed ? 'Final results' : timeLeft(endsAt - now)}
		{#if changeable}· Pick another option to change your vote{/if}
	</p>
</div>
