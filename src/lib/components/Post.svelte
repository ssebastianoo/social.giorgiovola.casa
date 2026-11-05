<script lang="ts">
	import { user, isMobile } from '#lib/store.js';
	import type { Post } from '#lib/types.js';
	import Posts from './Posts.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';
	import Likes from './Likes.svelte';
	import Avatar from './Avatar.svelte';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { markMentionSeen } from '#lib/mentions.js';
	import { isHttpLink, isRatio, ratioPercent } from '#lib/utils.js';

	export let loadReplies = false;
	export let post: Post;
	export let showReplyTo = false;
	export let isPostOpen = false;
	export let showThread = false;

	const dispatch = createEventDispatcher();
	const dialogClass =
		'fixed top-0 left-0 z-999 m-0 h-full w-screen border-none bg-background/20 p-0 text-foreground backdrop-blur-[2px]';
	const dialogContentClass =
		'flex w-[calc(85%+2px)] max-w-[392px] flex-col gap-2.5 rounded-md border border-accent bg-background/80 p-5';
	let showingLikes = false;
	let isModalOpen = false;
	let popup: HTMLDivElement;

	const mentionRegex = /^@[a-zA-Z0-9_]+$/;

	const imageRegex = /!\[[^\]]*\]\((?<filename>.*?)(?=\"|\))(?<optionalpart>\".*\")?\)/;
	$: contentParts = post.content.split(/(\s)/);
	$: ratio = isRatio(post);
	$: percent = ratioPercent(post);

	// images linked with markdown syntax in the content
	let images: string[] = [];
	// uploaded images first, then linked ones
	$: gallery = [...(post.images ?? []), ...images];

	// a mention notification is read as soon as the post it points at is actually on screen
	let postElement: HTMLDivElement;
	let onScreen = false;
	let visibilityState: DocumentVisibilityState;
	$: if (
		$user &&
		onScreen &&
		visibilityState === 'visible' &&
		contentParts.includes(`@${$user.username}`)
	)
		markMentionSeen($user.id, post.id);

	onMount(() => {
		if (!$user) return;
		// below the fixed header, and past the very bottom edge of the screen
		const observer = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), {
			rootMargin: '-80px 0px -10% 0px'
		});
		observer.observe(postElement);
		return () => observer.disconnect();
	});

	onMount(() => {
		const matchImage = post.content.match(imageRegex);
		if (matchImage) {
			// only absolute https images: no same-origin URLs that could trigger actions
			const src = matchImage[1].trim();
			if (src.startsWith('https://') && isHttpLink(src)) images = [...images, src];
			post.content = post.content.replace(imageRegex, '');
		}
	});

	onMount(() => {
		const offCounts = onRealtime('counts', (c) => {
			// the parent's likes decide whether this reply ratios it
			if (post.reply_to && c.id === post.reply_to.id && c.likes !== undefined)
				post.reply_to.likes = c.likes;
			if (c.id !== post.id) return;
			if (c.likes !== undefined) post.likes = c.likes;
			if (c.replies_count !== undefined) post.replies_count = c.replies_count;
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

	const fetchRepliesPromise = async () => {
		if (!loadReplies || post.replies_count === 0) return;
		const res = await fetch(`/api/posts/${post.id}/replies`, {
			headers: {
				'Content-Type': 'application/json'
			}
		});
		const json = await res.json();
		return json;
	};

	async function deletePost(e: Event) {
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
		dispatch('postDeleted', {
			id: post.id
		});
	}

	async function toggleLike(e: Event) {
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
			post.liked = data.liked;
			// absolute count, so it doesn't double up with the realtime `counts` event
			post.likes = data.likes;
		}
	}

	function sharePost(post: Post) {
		navigator.clipboard.writeText(`${window.location.origin}/@${post.user.username}/${post.id}`);
		popup.style.top = '90px';
		popup.style.visibility = 'visible';
		setTimeout(() => {
			popup.style.top = '-100px';
			popup.style.visibility = 'hidden';
		}, 1500);
	}
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
				<button class="btn w-full" on:click|stopPropagation={deletePost}>Yes</button>
				<button
					class="btn btn-red w-full"
					on:click|stopPropagation={() => {
						isModalOpen = false;
					}}>No</button
				>
			</div>
		</div>
	</div>
</dialog>
<dialog class={dialogClass} open={showingLikes}>
	{#if showingLikes}<!--  we don't want to render the component until the dialog is open -->
		<div class="flex h-full items-center justify-center">
			<div class={dialogContentClass}>
				<div class="flex items-center justify-between">
					<h3>Users who liked</h3>
					<button
						class="flex cursor-pointer outline-none"
						on:click|stopPropagation={() => (showingLikes = false)}
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
					<Likes postId={post.id} />
				</div>
			</div>
		</div>
	{/if}
</dialog>
<div class="flex flex-col gap-2.5">
	<div class="flex flex-col gap-2.5">
		{#if post.reply_to && showReplyTo}
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
			on:keypress={() => {
				goto(`/@${post.user.username}/${post.id}`);
			}}
			on:click={(e) => {
				// allow dragging to select text

				const selection = getSelection();
				if (selection && selection.type === 'Range') return;
				// if (e.target && e.target.matches('a')) return;
				goto(`/@${post.user.username}/${post.id}`);
			}}
		>
			<Avatar size={45} user={post.user} />
			<div class="flex w-full flex-col gap-0.75">
				<div class="flex flex-wrap items-center justify-between gap-[5px]">
					<p class="font-extrabold">
						<a class="text-inherit" href={'/@' + post.user.username}
							>{post.user.name}
							<span class="font-medium opacity-80">@{post.user.username}</span></a
						>
					</p>
					<p class="text-[0.8rem] opacity-70">
						{new Date(post.created_at).toLocaleString()}
					</p>
				</div>
				<div class="flex flex-col gap-2.5">
					{#if post.content.trim()}
						<p class="cursor-text wrap-anywhere">
							{#each contentParts as part}
								{#if isHttpLink(part)}
									<a
										on:click|stopPropagation
										href={part}
										target="_blank"
										rel="noopener noreferrer nofollow">{part}</a
									>
								{:else if mentionRegex.test(part)}
									<a on:click|stopPropagation href={`/${part}`}>{part}</a>
								{:else}
									{part}
								{/if}
							{/each}
						</p>
					{/if}
					{#if gallery.length > 0}
						<div class="grid gap-1.5 {gallery.length > 1 ? 'grid-cols-2' : ''}">
							{#each gallery as image}
								<a
									class="flex justify-center overflow-hidden rounded-[5px] bg-black/40"
									href={image}
									target="_blank"
									rel="noopener noreferrer"
									on:click|stopPropagation
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
								</a>
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
					<p>{post.replies_count ? post.replies_count : '0'}</p>
					<button
						on:click|preventDefault|stopPropagation={toggleLike}
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
												!post.liked && $user ? 'group-hover:fill-foreground' : ''
										  }`}
									d="M2 9.1371C2 14 6.01943 16.5914 8.96173 18.9109C10 19.7294 11 20.5 12 20.5C13 20.5 14 19.7294 15.0383 18.9109C17.9806 16.5914 22 14 22 9.1371C22 4.27416 16.4998 0.825464 12 5.50063C7.50016 0.825464 2 4.27416 2 9.1371Z"
									fill={post.liked ? '#bb5353' : 'transparent'}
									stroke={post.liked ? '#bb5353' : '#d9d9d9'}
								/>
							</g></svg
						>
					</button>
					<div class="cursor-pointer hover:underline">
						<div
							role="button"
							tabindex="0"
							on:keypress|stopPropagation={() => {
								showingLikes = true;
							}}
							on:click|stopPropagation={() => {
								showingLikes = true;
							}}
						>
							{post.likes ? post.likes : '0'}
						</div>
					</div>
					{#if ratio}
						<span
							class="rounded-[5px] border border-[#bb5353] px-1.5 text-[0.7rem] font-extrabold tracking-wider text-[#bb5353]"
							title="This reply has {percent}% of the likes between it and @{post.reply_to
								?.username}'s post ({post.likes} vs {post.reply_to?.likes})">RATIO {percent}%</span
						>
					{/if}
					<svg
						on:click|preventDefault|stopPropagation={() => {
							sharePost(post);
						}}
						on:keypress|preventDefault|stopPropagation={() => {
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
							on:click|preventDefault|stopPropagation={() => (isModalOpen = true)}
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
	{#if post.replies_count > 0 && loadReplies}
		<div class="flex justify-end">
			<div
				class="relative w-[90.5%] before:absolute before:top-0 before:-left-5 before:block before:h-[calc(100%-74px)] before:w-px before:bg-accent"
			>
				{#await fetchRepliesPromise()}
					Loading replies...
				{:then replies}
					<Posts posts={replies} replies={true} showThread={true} />
				{/await}
			</div>
		</div>
	{/if}
</div>
