<script lang="ts">
	import { afterNavigate, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { user } from '#lib/store.js';
	import { closeCard, holdCard, hoverCard, releaseCard, setCard } from '#lib/profileCard.svelte.js';
	import Avatar from './Avatar.svelte';
	import Button from './Button.svelte';

	const WIDTH = 300;
	const GAP = 8;
	const MARGIN = 8;

	let height = $state(0);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const card = $derived(hoverCard.data);

	// placed in page coordinates so it scrolls with the anchor; below it unless that runs off screen
	const position = $derived.by(() => {
		const anchor = hoverCard.anchor;
		if (!anchor) return null;
		const rect = anchor.getBoundingClientRect();
		const below = rect.bottom + GAP + height <= innerHeight || rect.top - GAP - height < 0;
		const left = Math.min(
			Math.max(rect.left, MARGIN),
			Math.max(MARGIN, document.documentElement.clientWidth - WIDTH - MARGIN)
		);
		return {
			left: left + scrollX,
			top: below ? rect.bottom + GAP + scrollY : rect.top - GAP - height + scrollY
		};
	});

	const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

	const followedByText = $derived.by(() => {
		if (!card) return '';
		const { users, total } = card.followedBy;
		const names = users.map((u) => u.name);
		const rest = total - names.length;
		if (rest > 0) return `${names.join(', ')}, and ${rest} other${rest === 1 ? '' : 's'}`;
		if (names.length > 1) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
		return names[0] ?? '';
	});

	$effect(() => {
		// a new card starts without the previous one's error
		void card?.username;
		error = null;
	});

	afterNavigate(closeCard);

	async function toggleFollow() {
		if (!card) return;
		busy = true;
		try {
			const res = await fetch(`/api/users/${card.username}/follow`, {
				method: card.followed ? 'DELETE' : 'POST'
			});
			if (!res.ok) {
				error = (await res.text()) || 'Could not update follow';
				return;
			}
			const stats: Pick<typeof card, 'followers' | 'following' | 'followed'> = await res.json();
			setCard({ ...card, ...stats });
			// the profile page being looked at shows the same counts
			if (page.params.username?.toLowerCase() === card.username) invalidate('app:posts');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeCard()} />

{#if card && position}
	<div
		class="absolute z-1000 flex flex-col gap-2.5 rounded-[5px] border border-accent bg-background p-2.5"
		style:left="{position.left}px"
		style:top="{position.top}px"
		style:width="{WIDTH}px"
		bind:offsetHeight={height}
		role="dialog"
		aria-label="{card.name}'s profile"
		tabindex="-1"
		onpointerenter={holdCard}
		onpointerleave={releaseCard}
	>
		<div class="flex items-start justify-between gap-2.5">
			<Avatar size={64} user={card} />
			{#if $user && !card.self}
				<Button
					class="group"
					size="sm"
					variant={card.followed ? 'danger-on-hover' : 'primary'}
					disabled={busy}
					onclick={toggleFollow}
				>
					{#if card.followed}
						<span class="group-hover:hidden">Following</span>
						<span class="hidden group-hover:inline">Unfollow</span>
					{:else}
						Follow
					{/if}
				</Button>
			{/if}
		</div>

		<div>
			<a class="font-extrabold text-inherit" href="/@{card.username}">{card.name}</a>
			<p class="flex items-center gap-1.5 opacity-80">
				@{card.username}
				{#if card.followsYou}
					<span class="rounded-[5px] border border-line px-1.5 py-px text-[0.75em]"
						>Follows you</span
					>
				{/if}
			</p>
		</div>

		{#if card.bio}
			<p class="break-words whitespace-pre-line">{card.bio}</p>
		{/if}

		<p class="flex gap-4 text-[0.9em] text-muted">
			<span><b class="text-foreground">{nf.format(card.following)}</b> Following</span>
			<span
				><b class="text-foreground">{nf.format(card.followers)}</b>
				{card.followers === 1 ? 'Follower' : 'Followers'}</span
			>
		</p>

		{#if card.followedBy.total > 0}
			<div class="flex items-center gap-2.5 text-[0.85em] text-muted">
				<div class="flex shrink-0">
					{#each card.followedBy.users as u, i (u.username)}
						<div class="rounded-full ring-2 ring-background {i > 0 ? '-ml-2' : ''}">
							<Avatar size={24} user={u} />
						</div>
					{/each}
				</div>
				<p>Followed by {followedByText} you follow</p>
			</div>
		{/if}

		{#if error}
			<p class="rounded-[5px] bg-danger p-[5px] text-[0.85em]">{error}</p>
		{/if}
	</div>
{/if}
