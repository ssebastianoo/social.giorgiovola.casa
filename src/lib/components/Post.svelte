<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import { user, isMobile } from '#lib/store.js';
	import type { Post } from '#lib/types.js';
	import Posts from './Posts.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Likes from './Likes.svelte';
	import Avatar from './Avatar.svelte';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { markMentionSeen } from '#lib/mentions.js';
	import { isHttpLink, isRatio, ratioPercent } from '#lib/utils.js';
	import { hashtagHref, parseHashtag } from '#lib/hashtags.js';
	import { openImage } from '#lib/imageViewer.svelte.js';
	import { profileHover } from '#lib/profileCard.svelte.js';

	type Props = {
		post: Post;
		loadReplies?: boolean;
		showReplyTo?: boolean;
		isPostOpen?: boolean;
		showThread?: boolean;
		onpostdeleted?: (id: number) => void;
	};

	let {
		post,
		loadReplies = false,
		showReplyTo = false,
		isPostOpen = false,
		showThread = false,
		onpostdeleted
	}: Props = $props();

	const dialogClass =
		'fixed top-0 left-0 z-999 m-0 h-full w-screen border-none bg-background/20 p-0 text-foreground backdrop-blur-[2px]';
	const dialogContentClass =
		'flex w-[calc(85%+2px)] max-w-[392px] flex-col gap-2.5 rounded-md border border-accent bg-background/80 p-5';
	// which list of users is open
	let showing: 'likes' | 'regiorgs' | null = $state(null);
	let isModalOpen = $state(false);
	let popup: HTMLDivElement | undefined = $state();

	// writable derived: follow the post, overwritten by the buttons and realtime counts
	let liked = $derived(post.liked ?? false);
	let likes = $derived(post.likes);
	let regiorged = $derived(post.regiorged ?? false);
	let regiorgs = $derived(post.regiorgs ?? 0);
	let repliesCount = $derived(post.replies_count);
	// the parent's likes decide whether this reply ratios it
	let parentLikes = $derived(post.reply_to?.likes ?? 0);

	const mentionRegex = /^@[a-zA-Z0-9_]+$/;
	const imageRegex = /!\[[^\]]*\]\((?<filename>.*?)(?="|\))(?<optionalpart>".*")?\)/;

	// an image linked with markdown syntax in the content: only absolute https images, no
	// same-origin URLs that could trigger actions
	const linkedImage = $derived.by(() => {
		const match = post.content.match(imageRegex);
		const src = match?.[1].trim();
		return src && src.startsWith('https://') && isHttpLink(src) ? src : null;
	});
	const contentParts = $derived(post.content.replace(imageRegex, '').split(/(\s)/));
	// uploaded images first, then the linked one
	const gallery = $derived([...(post.images ?? []), ...(linkedImage ? [linkedImage] : [])]);

	const ratioPost = $derived({
		likes,
		user: post.user,
		reply_to: post.reply_to && { ...post.reply_to, likes: parentLikes }
	});
	const ratio = $derived(isRatio(ratioPost));
	const percent = $derived(ratioPercent(ratioPost));

	// a mention notification is read as soon as the post it points at is actually on screen
	let postElement: HTMLDivElement | undefined = $state();
	let onScreen = $state(false);
	let visibilityState: Document['visibilityState'] | undefined = $state();
	$effect(() => {
		if (
			$user &&
			onScreen &&
			visibilityState === 'visible' &&
			contentParts.includes(`@${$user.username}`)
		)
			markMentionSeen($user.id, post.id);
	});

	onMount(() => {
		if (!$user || !postElement) return;
		// below the fixed header, and past the very bottom edge of the screen
		const observer = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), {
			rootMargin: '-80px 0px -10% 0px'
		});
		observer.observe(postElement);
		return () => observer.disconnect();
	});

	onMount(() => {
		const offCounts = onRealtime('counts', (c) => {
			if (post.reply_to && c.id === post.reply_to.id && c.likes !== undefined)
				parentLikes = c.likes;
			if (c.id !== post.id) return;
			if (c.likes !== undefined) likes = c.likes;
			if (c.replies_count !== undefined) repliesCount = c.replies_count;
			if (c.regiorgs !== undefined) regiorgs = c.regiorgs;
		});
		const offDeleted = onRealtime('post_deleted', ({ id }) => {
			// the open post vanished under the viewer
			if (id === post.id && isPostOpen) goto('/');
		});
		return () => {
			offCounts();
			offDeleted();
		};
	});

	// fetched once per post: realtime reply counts don't refetch the thread
	const repliesPromise = $derived(
		loadReplies && post.replies_count > 0 ? fetchReplies(post.id) : null
	);

	async function fetchReplies(id: number): Promise<Post[]> {
		const res = await fetch(`/api/posts/${id}/replies`, {
			headers: {
				'Content-Type': 'application/json'
			}
		});
		return res.json();
	}

	async function deletePost() {
		isModalOpen = false;
		const res = await fetch('/api/posts', {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id: post.id
			})
		});
		// staff can try to delete any post, the server refuses the ones they can't (a missing one is gone anyway)
		if (!res.ok && res.status !== 404) return alert(await res.text());
		if (page.route.id === '/@[username]/[post]') {
			return await goto('/');
		}
		onpostdeleted?.(post.id);
	}

	async function toggleLike() {
		const res = await fetch('/api/posts/like', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id: post.id
			})
		});

		if (res.status === 200) {
			const data = await res.json();
			liked = data.liked;
			// absolute count, so it doesn't double up with the realtime `counts` event
			likes = data.likes;
		}
	}

	async function toggleRegiorg() {
		const res = await fetch('/api/posts/regiorg', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id: post.id
			})
		});
		if (res.ok) {
			const data = await res.json();
			regiorged = data.regiorged;
			// absolute count, like for likes
			regiorgs = data.regiorgs;
		} else if (res.status !== 401) alert((await res.text()) || 'Could not regiorg');
	}

	function sharePost(post: Post) {
		if (!popup) return;
		const el = popup;
		navigator.clipboard.writeText(`${window.location.origin}/@${post.user.username}/${post.id}`);
		el.style.top = '90px';
		el.style.visibility = 'visible';
		setTimeout(() => {
			el.style.top = '-100px';
			el.style.visibility = 'hidden';
		}, 1500);
	}

	const stop = (e: Event) => e.stopPropagation();
</script>

<svelte:document bind:visibilityState />

<div
	class="invisible fixed top-[-100px] left-1/2 z-999 w-[calc(80%+42px)] max-w-[442px] -translate-x-1/2 rounded-[5px] border border-accent bg-black/10 p-5 text-center backdrop-blur-[2px] transition-all duration-400 ease-[cubic-bezier(0.86,0,0.07,1)]"
	bind:this={popup}
>
	<p>Link copied!</p>
</div>

<dialog class={dialogClass} open={isModalOpen}>
	<div class="flex h-full items-center justify-center">
		<div class={dialogContentClass}>
			<p>
				Are you sure you want to delete this post{$user && $user.username !== post.user.username
					? ' as a moderator'
					: ''}?
			</p>
			<div class="flex gap-2.5">
				<Button
					class="w-full"
					onclick={(e) => {
						e.stopPropagation();
						deletePost();
					}}>Yes</Button
				>
				<Button
					variant="danger"
					class="w-full"
					onclick={(e) => {
						e.stopPropagation();
						isModalOpen = false;
					}}>No</Button
				>
			</div>
		</div>
	</div>
</dialog>
<dialog class={dialogClass} open={showing !== null}>
	{#if showing}<!--  we don't want to render the component until the dialog is open -->
		<div class="flex h-full items-center justify-center">
			<div class={dialogContentClass}>
				<div class="flex items-center justify-between">
					<h3>{showing === 'likes' ? 'Users who liked' : 'Users who regiorged'}</h3>
					<button
						class="flex cursor-pointer outline-none"
						aria-label="Close"
						onclick={(e) => {
							e.stopPropagation();
							showing = null;
						}}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							height="1.6em"
							viewBox="0 0 384 512"
							fill="#bb5353"
							><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
								d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
							/></svg
						>
					</button>
				</div>
				<div class="max-h-[calc(var(--fh)-160px)] cursor-pointer overflow-auto hover:underline">
					<Likes postId={post.id} kind={showing} />
				</div>
			</div>
		</div>
	{/if}
</dialog>
<div class="flex flex-col gap-2.5">
	<div class="flex flex-col gap-2.5">
		{#if post.regiorged_by}
			<a
				class="ml-0.75 flex items-center gap-[5px] text-[0.85em] text-muted"
				href={'/@' + post.regiorged_by.username}
			>
				<svg
					class="stroke-muted"
					height="14px"
					viewBox="0 0 24 24"
					fill="none"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
					><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path
						d="M7 23l-4-4 4-4"
					/><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg
				>
				{post.regiorged_by.username === $user?.username ? 'You' : post.regiorged_by.name} regiorged
			</a>
		{/if}
		{#if post.reply_to && (showReplyTo || post.regiorged_by)}
			<a class="ml-0.75" href={'/@' + post.reply_to.username + '/' + post.reply_to.id}
				>Replying to @{post.reply_to.username}</a
			>
		{/if}
		<div
			bind:this={postElement}
			class="relative flex cursor-pointer gap-2.5 rounded-[5px] p-2.5 [-webkit-tap-highlight-color:transparent] {showThread
				? 'before:absolute before:top-[27.5px] before:-left-5 before:block before:h-1.5 before:w-[21px] before:rounded-bl-[10px] before:border-b before:border-l before:border-accent'
				: ''} {!isPostOpen && !$isMobile ? 'hover:bg-black' : ''}"
			tabindex="0"
			role="button"
			aria-pressed="false"
			onkeypress={() => {
				goto(`/@${post.user.username}/${post.id}`);
			}}
			onclick={() => {
				// allow dragging to select text
				const selection = getSelection();
				if (selection && selection.type === 'Range') return;
				goto(`/@${post.user.username}/${post.id}`);
			}}
		>
			<div class="flex self-start" use:profileHover={post.user.username}>
				<Avatar size={45} user={post.user} />
			</div>
			<div class="flex w-full flex-col gap-0.75">
				<div class="flex flex-wrap items-center justify-between gap-[5px]">
					<p class="font-extrabold">
						<a
							class="text-inherit"
							href={'/@' + post.user.username}
							use:profileHover={post.user.username}
							>{post.user.name}
							<span class="font-medium opacity-80">@{post.user.username}</span></a
						>
					</p>
					<p class="text-[0.8rem] opacity-70">
						{new Date(post.created_at).toLocaleString()}
					</p>
				</div>
				<div class="flex flex-col gap-2.5">
					{#if contentParts.join('').trim()}
						<p class="cursor-text wrap-anywhere">
							{#each contentParts as part}
								{#if isHttpLink(part)}
									<a onclick={stop} href={part} target="_blank" rel="noopener noreferrer nofollow"
										>{part}</a
									>
								{:else if parseHashtag(part)}
									{@const hashtag = parseHashtag(part)!}
									<a onclick={stop} href={hashtagHref(hashtag.tag)}>#{hashtag.tag}</a>{hashtag.rest}
								{:else if mentionRegex.test(part)}
									<a onclick={stop} href={`/${part}`} use:profileHover={part.slice(1).toLowerCase()}
										>{part}</a
									>
								{:else}
									{part}
								{/if}
							{/each}
						</p>
					{/if}
					{#if gallery.length > 0}
						<div class="grid gap-1.5 {gallery.length > 1 ? 'grid-cols-2' : ''}">
							{#each gallery as image, i}
								<button
									type="button"
									class="flex cursor-zoom-in justify-center overflow-hidden rounded-[5px] bg-black/40 outline-none"
									aria-label="Open image"
									onclick={(e) => {
										e.stopPropagation();
										openImage(gallery, i);
									}}
								>
									<img
										class={gallery.length > 1
											? 'aspect-square w-full object-cover'
											: 'max-h-[500px] max-w-full object-contain'}
										src={image}
										alt=""
										referrerpolicy="no-referrer"
										loading="lazy"
									/>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<div class="mt-2.5 flex w-full items-center gap-2.5">
					<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 512 512"
						><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
							fill="#d9d9d9"
							fill-opacity="0.5"
							d="M123.6 391.3c12.9-9.4 29.6-11.8 44.6-6.4c26.5 9.6 56.2 15.1 87.8 15.1c124.7 0 208-80.5 208-160s-83.3-160-208-160S48 160.5 48 240c0 32 12.4 62.8 35.7 89.2c8.6 9.7 12.8 22.5 11.8 35.5c-1.4 18.1-5.7 34.7-11.3 49.4c17-7.9 31.1-16.7 39.4-22.7zM21.2 431.9c1.8-2.7 3.5-5.4 5.1-8.1c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208s-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6c-15.1 6.6-32.3 12.6-50.1 16.1c-.8 .2-1.6 .3-2.4 .5c-4.4 .8-8.7 1.5-13.2 1.9c-.2 0-.5 .1-.7 .1c-5.1 .5-10.2 .8-15.3 .8c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c4.1-4.2 7.8-8.7 11.3-13.5c1.7-2.3 3.3-4.6 4.8-6.9c.1-.2 .2-.3 .3-.5z"
						/></svg
					>
					<p>{repliesCount ? repliesCount : '0'}</p>
					<button
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							toggleRegiorg();
						}}
						class="group flex cursor-pointer items-center outline-none"
						title={regiorged ? 'undo regiorg' : 'regiorg'}
						aria-pressed={regiorged}
					>
						<svg
							height="19px"
							viewBox="0 0 24 24"
							fill="none"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							xmlns="http://www.w3.org/2000/svg"
							class="{regiorged ? 'stroke-accent' : 'stroke-foreground'} {$isMobile
								? ''
								: `transition-[stroke] duration-100 ease-in-out ${
										!regiorged && $user ? 'group-hover:stroke-accent' : ''
								  }`}"
							><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path
								d="M7 23l-4-4 4-4"
							/><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg
						>
					</button>
					<div class="cursor-pointer hover:underline">
						<div
							role="button"
							tabindex="0"
							title="Users who regiorged"
							onkeypress={(e) => {
								e.stopPropagation();
								showing = 'regiorgs';
							}}
							onclick={(e) => {
								e.stopPropagation();
								showing = 'regiorgs';
							}}
						>
							{regiorgs ? regiorgs : '0'}
						</div>
					</div>
					<button
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							toggleLike();
						}}
						class="group flex cursor-pointer items-center outline-none"
						title="like"
					>
						<svg height="20px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
							><g id="SVGRepo_bgCarrier" stroke-width="0" /><g
								id="SVGRepo_tracerCarrier"
								stroke-linecap="round"
								stroke-linejoin="round"
							/><g id="SVGRepo_iconCarrier">
								<path
									class={$isMobile
										? ''
										: `transition-[fill,stroke] duration-100 ease-in-out ${
												!liked && $user ? 'group-hover:fill-foreground' : ''
										  }`}
									d="M2 9.1371C2 14 6.01943 16.5914 8.96173 18.9109C10 19.7294 11 20.5 12 20.5C13 20.5 14 19.7294 15.0383 18.9109C17.9806 16.5914 22 14 22 9.1371C22 4.27416 16.4998 0.825464 12 5.50063C7.50016 0.825464 2 4.27416 2 9.1371Z"
									fill={liked ? '#bb5353' : 'transparent'}
									stroke={liked ? '#bb5353' : '#d9d9d9'}
								/>
							</g></svg
						>
					</button>
					<div class="cursor-pointer hover:underline">
						<div
							role="button"
							tabindex="0"
							onkeypress={(e) => {
								e.stopPropagation();
								showing = 'likes';
							}}
							onclick={(e) => {
								e.stopPropagation();
								showing = 'likes';
							}}
						>
							{likes ? likes : '0'}
						</div>
					</div>
					{#if ratio}
						<span
							class="rounded-[5px] border border-[#bb5353] px-1.5 text-[0.7rem] font-extrabold tracking-wider text-[#bb5353]"
							title="This reply has {percent}% of the likes between it and @{post.reply_to
								?.username}'s post ({likes} vs {parentLikes})">RATIO {percent}%</span
						>
					{/if}
					<svg
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							sharePost(post);
						}}
						onkeypress={(e) => {
							e.preventDefault();
							e.stopPropagation();
							sharePost(post);
						}}
						class="group outline-none select-none [-webkit-tap-highlight-color:transparent]"
						role="button"
						tabindex="0"
						height="28px"
						viewBox="0 -0.5 25 25"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							class={$isMobile ? '' : 'group-hover:fill-foreground'}
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M14.734 15.8974L19.22 12.1374C19.3971 11.9927 19.4998 11.7761 19.4998 11.5474C19.4998 11.3187 19.3971 11.1022 19.22 10.9574L14.734 7.19743C14.4947 6.9929 14.1598 6.94275 13.8711 7.06826C13.5824 7.19377 13.3906 7.47295 13.377 7.78743V9.27043C7.079 8.17943 5.5 13.8154 5.5 16.9974C6.961 14.5734 10.747 10.1794 13.377 13.8154V15.3024C13.3888 15.6178 13.5799 15.8987 13.8689 16.0254C14.158 16.1521 14.494 16.1024 14.734 15.8974Z"
							stroke="#d9d9d9"
							stroke-width="0.9"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{#if $user && ($user.username === post.user.username || page.data.role !== 'user')}
						<button
							class="group flex cursor-pointer items-center outline-none"
							aria-label="Delete post"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								isModalOpen = true;
							}}
						>
							<svg
								class="fill-foreground"
								xmlns="http://www.w3.org/2000/svg"
								height="15px"
								viewBox="0 0 448 512"
								><path
									class={$isMobile ? '' : 'group-hover:[fill-opacity:0.8]'}
									fill-opacity=".4"
									d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"
								/>
							</svg>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
	{#if repliesPromise}
		<div class="flex justify-end">
			<div
				class="relative w-[90.5%] before:absolute before:top-0 before:-left-5 before:block before:h-[calc(100%-74px)] before:w-px before:bg-accent"
			>
				{#await repliesPromise}
					Loading replies...
				{:then replies}
					<Posts posts={replies} replies={true} showThread={true} />
				{/await}
			</div>
		</div>
	{/if}
</div>
