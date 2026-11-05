<script lang="ts">
	import type { PageProps } from './$types';
	import Avatar from '#lib/components/Avatar.svelte';
	import { hashtagHref } from '#lib/hashtags.js';
	import { profileHover } from '#lib/profileCard.svelte.js';

	let { data }: PageProps = $props();

	const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
	const nothing = $derived(data.users.length === 0 && data.hashtags.length === 0);
</script>

<form class="mb-5 flex" action="/search" role="search">
	<input
		class="input"
		type="search"
		name="q"
		value={data.query}
		placeholder="Search people and #hashtags"
		maxlength="64"
		aria-label="Search"
	/>
</form>

{#if !data.query}
	<section class="mb-10 flex flex-col gap-3">
		<h3>Trending</h3>
		{#if data.hashtags.length === 0}
			<p class="text-muted">No hashtags used this week yet.</p>
		{/if}
		{@render hashtagList()}
	</section>
{:else if nothing}
	<p class="text-muted">Nothing found for “{data.query}”.</p>
{:else}
	{#if data.users.length}
		<section class="mb-10 flex flex-col gap-3">
			<h3>People</h3>
			<ul class="flex flex-col">
				{#each data.users as user (user.username)}
					<li>
						<a
							class="flex items-center gap-2.5 rounded-md p-2.5 text-foreground hover:bg-black hover:no-underline"
							href="/@{user.username}"
							use:profileHover={user.username}
						>
							<Avatar size={45} {user} clickable={false} />
							<span class="flex min-w-0 flex-col">
								<span class="truncate font-bold">{user.name}</span>
								<span class="truncate opacity-80">@{user.username}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#if data.hashtags.length}
		<section class="mb-10 flex flex-col gap-3">
			<h3>Hashtags</h3>
			{@render hashtagList()}
		</section>
	{/if}
{/if}

{#snippet hashtagList()}
	<ul class="flex flex-col">
		{#each data.hashtags as hashtag (hashtag.tag)}
			<li>
				<a
					class="flex items-center justify-between gap-2.5 rounded-md p-2.5 text-foreground hover:bg-black hover:no-underline"
					href={hashtagHref(hashtag.tag)}
				>
					<span class="min-w-0 truncate font-bold">#{hashtag.tag}</span>
					<span class="shrink-0 text-[0.85em] text-muted"
						>{nf.format(hashtag.posts)} {hashtag.posts === 1 ? 'post' : 'posts'}</span
					>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}
