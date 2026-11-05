<script lang="ts">
	import { deserialize } from '$app/forms';
	import { user } from '#lib/store.js';
	import { profileHover } from '#lib/profileCard.svelte.js';
	import type { FollowListEntry, User } from '#lib/types.js';
	import type { Action } from 'svelte/action';
	import Avatar from './Avatar.svelte';
	import Button from './Button.svelte';

	type Props = {
		data: {
			profile: Pick<User, 'username' | 'name' | 'avatar'>;
			list: 'followers' | 'following' | 'known';
			followers: number;
			following: number;
			known: number;
			showKnown: boolean;
			entries: FollowListEntry[];
			pageSize: number;
		};
	};

	let { data }: Props = $props();

	// writable deriveds: reset when switching tabs, extended by the infinite scroll and follow buttons
	let entries = $derived(data.entries);
	let done = $derived(data.entries.length < data.pageSize);
	let following = $derived(data.following);
	let loading = $state(false);
	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);

	const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
	const own = $derived($user?.username === data.profile.username);

	const tabs = $derived([
		{ list: 'followers', label: 'Followers', count: data.followers, href: 'followers' },
		{ list: 'following', label: 'Following', count: following, href: 'following' },
		...(data.showKnown
			? [{ list: 'known', label: 'Followers you know', count: data.known, href: 'followers/known' }]
			: [])
	]);

	const empty = $derived(
		data.list === 'followers'
			? own
				? 'Nobody follows you yet.'
				: `@${data.profile.username} has no followers yet.`
			: data.list === 'following'
			? own
				? "You don't follow anyone yet."
				: `@${data.profile.username} doesn't follow anyone yet.`
			: `None of the profiles you follow follow @${data.profile.username}.`
	);

	async function loadMore() {
		if (loading || done) return;
		loading = true;
		try {
			const form = new FormData();
			form.set('offset', entries.length.toString());
			const res = await fetch('', { method: 'POST', body: form });
			const result = deserialize(await res.text());
			if (result.type !== 'success' || !result.data) {
				done = true;
				return;
			}
			const more = result.data.entries as FollowListEntry[];
			// rows may shift while scrolling (new follows): skip the ones already shown
			const seen = new Set(entries.map((e) => e.username));
			entries = [...entries, ...more.filter((e) => !seen.has(e.username))];
			if (more.length < data.pageSize) done = true;
		} finally {
			loading = false;
		}
	}

	// the end of the list is in view: keep loading pages until it isn't
	let atEnd = $state(false);
	const sentinel: Action = (node) => {
		const observer = new IntersectionObserver((items) => (atEnd = items[0].isIntersecting), {
			rootMargin: '200px'
		});
		observer.observe(node);
		return {
			destroy: () => {
				observer.disconnect();
				atEnd = false;
			}
		};
	};
	$effect(() => {
		if (atEnd && !loading && !done) loadMore();
	});

	async function toggleFollow(entry: FollowListEntry) {
		busy = entry.username;
		try {
			const res = await fetch(`/api/users/${entry.username}/follow`, {
				method: entry.followed ? 'DELETE' : 'POST'
			});
			if (!res.ok) {
				error = (await res.text()) || 'Could not update follow';
				return;
			}
			const { followed }: { followed: boolean } = await res.json();
			entries = entries.map((e) => (e.username === entry.username ? { ...e, followed } : e));
			// your own following count changes with it
			if (own && followed !== entry.followed) following += followed ? 1 : -1;
			error = null;
		} finally {
			busy = null;
		}
	}
</script>

<div class="mb-5 flex items-center gap-2.5">
	<Avatar size={45} user={data.profile} />
	<div>
		<a class="font-extrabold text-inherit" href="/@{data.profile.username}">{data.profile.name}</a>
		<p class="opacity-80">@{data.profile.username}</p>
	</div>
</div>

<nav class="mb-5 flex overflow-x-auto">
	{#each tabs as tab (tab.list)}
		<a
			class="shrink-0 border-b-2 px-2.5 pb-1.5 text-inherit hover:no-underline {tab.list ===
			data.list
				? 'border-accent'
				: 'border-transparent opacity-60 hover:opacity-100'}"
			href="/@{data.profile.username}/{tab.href}"
			aria-current={tab.list === data.list ? 'page' : undefined}
			data-sveltekit-replacestate
			data-sveltekit-noscroll
		>
			{tab.label} <span class="text-[0.85em] text-muted">{nf.format(tab.count)}</span>
		</a>
	{/each}
</nav>

{#if error}
	<p class="mb-2.5 rounded-[5px] bg-danger p-[5px]">{error}</p>
{/if}

{#if entries.length === 0}
	<p class="text-muted">{empty}</p>
{:else}
	<ul class="flex flex-col">
		{#each entries as entry (entry.username)}
			<li class="flex items-start gap-2.5 rounded-md p-2.5 hover:bg-black">
				<div class="flex" use:profileHover={entry.username}>
					<Avatar size={45} user={entry} />
				</div>
				<div class="flex min-w-0 grow flex-col gap-0.5">
					<div class="flex items-start justify-between gap-2.5">
						<div class="min-w-0">
							<a
								class="block truncate font-bold text-inherit"
								href="/@{entry.username}"
								use:profileHover={entry.username}>{entry.name}</a
							>
							<p class="flex items-center gap-1.5 opacity-80">
								<span class="truncate">@{entry.username}</span>
								{#if entry.followsYou}
									<span class="shrink-0 rounded-[5px] border border-line px-1.5 py-px text-[0.75em]"
										>Follows you</span
									>
								{/if}
							</p>
						</div>
						{#if $user && !entry.self}
							<Button
								class="group shrink-0"
								size="sm"
								variant={entry.followed ? 'danger-on-hover' : 'primary'}
								disabled={busy === entry.username}
								onclick={() => toggleFollow(entry)}
							>
								{#if entry.followed}
									<span class="group-hover:hidden">Following</span>
									<span class="hidden group-hover:inline">Unfollow</span>
								{:else}
									Follow
								{/if}
							</Button>
						{/if}
					</div>
					{#if entry.bio}
						<p class="line-clamp-2 text-[0.9em] break-words whitespace-pre-line">{entry.bio}</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	{#if !done}
		<div use:sentinel class="p-2.5 text-center text-muted">{loading ? 'Loading...' : ''}</div>
	{/if}
{/if}
