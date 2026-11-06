<script lang="ts">
	import type { QuotedPost } from '#lib/types.js';
	import Avatar from './Avatar.svelte';

	// the post a quote regiorg quotes, embedded in the quote (or in the composer, as a preview).
	// Post.svelte leaves clicks on links inside it alone, so this one opens the quoted post.
	let { quote, link = true }: { quote: QuotedPost | { deleted: true }; link?: boolean } = $props();

	const href = $derived('deleted' in quote ? null : `/@${quote.user.username}/${quote.id}`);
	// markdown-linked images (see Post.svelte) aren't loaded in a quote: drop their syntax
	const text = $derived(
		'deleted' in quote ? '' : quote.content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()
	);
</script>

{#if 'deleted' in quote}
	<div class="rounded-[5px] border border-line p-2.5 text-[0.9em] text-muted">
		This post was deleted.
	</div>
{:else}
	<svelte:element
		this={link ? 'a' : 'div'}
		href={link ? href : undefined}
		class="flex flex-col gap-[5px] rounded-[5px] border border-line p-2.5 text-foreground {link
			? 'hover:bg-white/5 hover:no-underline'
			: ''}"
	>
		<div class="flex min-w-0 items-center gap-[5px] text-[0.9em]">
			<Avatar user={quote.user} size={20} clickable={false} />
			<span class="truncate font-bold"
				>{quote.user.name} <span class="font-medium opacity-80">@{quote.user.username}</span></span
			>
			<span class="ml-auto shrink-0 text-[0.8em] opacity-70"
				>{new Date(quote.created_at).toLocaleDateString()}</span
			>
		</div>
		{#if text}
			<p class="line-clamp-6 text-[0.95em] wrap-anywhere whitespace-pre-line">{text}</p>
		{/if}
		{#if quote.is_quote}
			<p class="text-[0.85em] text-muted">Quoting another post</p>
		{/if}
		{#if quote.images.length > 0}
			<div class="grid gap-1 {quote.images.length > 1 ? 'grid-cols-4' : ''}">
				{#each quote.images.slice(0, 4) as image}
					<img
						class={quote.images.length > 1
							? 'aspect-square w-full rounded-[5px] object-cover'
							: 'max-h-50 max-w-full self-start rounded-[5px] object-contain'}
						src={image}
						alt=""
						loading="lazy"
					/>
				{/each}
			</div>
		{/if}
	</svelte:element>
{/if}
