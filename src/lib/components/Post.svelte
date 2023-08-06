<script lang="ts">
	import { user, isMobile } from '$lib/store';
	import type { Post } from '$lib/types';
	import Posts from './Posts.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';

	export let loadReplies = false;
	export let post: Post;
	export let showReplyTo = false;
	export let isPostOpen = false;
	export let showThread = false;

	const dispatch = createEventDispatcher();
	let isModalOpen = false;

	const urlRegex = /(https?:\/\/[^\s]+)/g;
	$: contentParts = post.content.split(urlRegex);

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
		if (res.ok) {
			if ($page.route.id === '/@[username]/[post]') {
				return await goto('/');
			}
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
			if (post.liked) {
				post.likes++;
			} else {
				post.likes--;
			}
		}
	}
</script>

<dialog open={isModalOpen}>
	<p>Are you sure you want to delete this post?</p>
	<div class="buttons">
		<button class="btn" on:click|stopPropagation={deletePost}>Yes</button>
		<button
			class="btn"
			on:click|stopPropagation={() => {
				isModalOpen = false;
			}}>No</button
		>
	</div>
</dialog>
<div class="posts">
	<div class="post-parent">
		{#if post.reply_to && showReplyTo}
			<a class="reply_to" href={'/@' + post.reply_to.username + '/' + post.reply_to.id}
				>Replying to @{post.reply_to.username}</a
			>
		{/if}
		<div
			class="post"
			data-post-open={isPostOpen}
			data-mobile={$isMobile}
			data-thread={showThread}
			tabindex="0"
			role="button"
			aria-pressed="false"
			on:keypress={() => {
				goto(`/@${post.user.username}/${post.id}`);
			}}
			on:click|preventDefault={(e) => {
				// allow dragging to select text

				const selection = getSelection();
				if (selection && selection.type === 'Range') return;
				// if (e.target && e.target.matches('a')) return;
				goto(`/@${post.user.username}/${post.id}`);
			}}
		>
			<a class="img-url" href={'/@' + post.user.username}>
				<img
					src={'https://source.boringavatars.com/beam/45/' + post.user.username}
					alt={post.user.name + "'s avatar"}
				/>
			</a>
			<div class="text">
				<div class="post-info">
					<p class="name">
						<a href={'/@' + post.user.username}
							>{post.user.name} <span class="username">@{post.user.username}</span></a
						>
					</p>
					<p class="date">
						{new Date(post.created_at).toLocaleString()}
					</p>
				</div>
				<div class="content">
					<p>
						{#each contentParts as part}
							{#if part.match(urlRegex)}
								<a on:click|stopPropagation href={part} target="_blank">{part}</a>
							{:else}
								{part}
							{/if}
						{/each}
					</p>
				</div>
				<div class="actions">
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
						class="like"
						data-liked={post.liked}
						data-logged={$user ? 'true' : 'false'}
					>
						<svg height="20px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
							><g id="SVGRepo_bgCarrier" stroke-width="0" /><g
								id="SVGRepo_tracerCarrier"
								stroke-linecap="round"
								stroke-linejoin="round"
							/><g id="SVGRepo_iconCarrier">
								<path
									d="M2 9.1371C2 14 6.01943 16.5914 8.96173 18.9109C10 19.7294 11 20.5 12 20.5C13 20.5 14 19.7294 15.0383 18.9109C17.9806 16.5914 22 14 22 9.1371C22 4.27416 16.4998 0.825464 12 5.50063C7.50016 0.825464 2 4.27416 2 9.1371Z"
									fill={post.liked ? '#bb5353' : 'transparent'}
									stroke={post.liked ? '#bb5353' : '#d9d9d9'}
								/>
							</g></svg
						>
					</button>
					<div class="likes">
						<p>{post.likes ? post.likes : '0'}</p>
					</div>
					{#if $user && $user.username === post.user.username}
						<button
							class="trash"
							on:click|preventDefault|stopPropagation={() => (isModalOpen = true)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" height="15px" viewBox="0 0 448 512"
								><path
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
		<div class="replies-parent">
			<div class="replies">
				{#await fetchRepliesPromise()}
					Loading replies...
				{:then replies}
					<Posts posts={replies} replies={true} showThread={true} />
				{/await}
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	@import 'src/variables.scss';

	.replies-parent {
		display: flex;
		justify-content: flex-end;

		.replies {
			width: 90.5%;
			position: relative;

			&::before {
				content: '';
				display: block;
				width: 1px;
				height: calc(100% - 74px);
				background-color: $color1;
				position: absolute;
				left: -20px;
				top: 0;
			}
		}
	}

	.posts {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.post-parent {
		display: flex;
		flex-direction: column;
		gap: 10px;

		.reply_to {
			margin-left: 3px;
		}
	}

	p {
		cursor: text;
	}

	.post {
		display: flex;
		gap: 10px;
		color: unset;
		text-decoration: none;
		border-radius: 5px;
		cursor: pointer;
		padding: 10px;
		-webkit-tap-highlight-color: transparent;
		position: relative;

		button {
			all: unset;
			display: flex;
			align-items: center;
			cursor: pointer;

			svg {
				fill: $color3;
			}
		}

		.img-url {
			display: flex;

			img {
				height: fit-content;
			}
		}

		.text {
			display: flex;
			flex-direction: column;
			width: 100%;
			gap: 3px;

			.content {
				p {
					overflow-wrap: anywhere;
				}
			}

			.actions {
				margin-top: 10px;
				display: flex;
				align-items: center;
				width: 100%;
				gap: 10px;

				.like:hover {
					svg {
						fill: rgb(245, 129, 129);
					}
				}
			}

			.post-info {
				display: flex;
				align-items: center;
				justify-content: space-between;
				flex-wrap: wrap;
				gap: 5px;

				a {
					color: unset;
					text-decoration: unset;

					&:hover {
						text-decoration: underline;
					}
				}

				.name {
					font-weight: 800;

					.username {
						font-weight: 500;
						opacity: 0.8;
					}
				}

				.date {
					font-size: 0.8rem;
					opacity: 0.7;
				}
			}
		}

		&[data-thread='true']::before {
			content: '';
			display: block;
			width: 20px;
			height: 5px;
			border-bottom: 1px solid $color1;
			border-left: 1px solid $color1;
			border-bottom-left-radius: 10px;
			position: absolute;
			top: 27.5px;
			left: -20px;
		}

		&[data-mobile='false'] {
			.like svg path {
				transition: fill 0.1s ease-in-out, stroke 0.1s ease-in-out;
			}

			.like:not([data-liked='true']):not([data-logged='false']):hover {
				svg path {
					fill: $color3;
				}
			}

			.trash:hover {
				svg path {
					fill-opacity: 0.8;
				}
			}
		}

		&[data-post-open='false'][data-mobile='false'] {
			&:hover {
				background-color: black;
			}
		}
	}
</style>
