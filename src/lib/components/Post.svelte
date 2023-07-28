<script lang="ts">
	import { user } from '$lib/store';
	import type { Post } from '$lib/types';
    import { page } from '$app/stores';
	import { goto, invalidate } from '$app/navigation';
	export let post: Post;

	async function deletePost(e: Event) {
		e.preventDefault();
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
            if($page.route.id === "/@[username]/[post]"){
                return await goto('/')
            }
            invalidate('app:posts')
		}
	}

	async function toggleLike(e: Event) {
		e.preventDefault();
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

<div class="post">
	<a class="img-url" href={'/@' + post.user.username}>
		<img
			src={'https://source.boringavatars.com/beam/45/' + post.user.username}
			alt={post.user.name + "'s avatar"}
		/>
	</a>
	<div class="text">
		<div class="user">
			<p class="name">
				<a href={'/@' + post.user.username}
					>{post.user.name} <span class="username">@{post.user.username}</span></a
				>
			</p>
		</div>
		<div class="content">
			<p>{post.content}</p>
		</div>
		<div class="actions">
			<button on:click={toggleLike} class="like" data-liked={post.liked} data-logged={$user ? 'true' : 'false'}>
				<svg height="20px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
					><g id="SVGRepo_bgCarrier" stroke-width="0" /><g
						id="SVGRepo_tracerCarrier"
						stroke-linecap="round"
						stroke-linejoin="round"
					/><g id="SVGRepo_iconCarrier">
						<path
							d="M2 9.1371C2 14 6.01943 16.5914 8.96173 18.9109C10 19.7294 11 20.5 12 20.5C13 20.5 14 19.7294 15.0383 18.9109C17.9806 16.5914 22 14 22 9.1371C22 4.27416 16.4998 0.825464 12 5.50063C7.50016 0.825464 2 4.27416 2 9.1371Z"
							fill={post.liked ? '#bb5353' : 'transparent'}
							stroke={post.liked ? '#bb5353' : 'white'}
						/>
					</g></svg
				>
			</button>
			<div class="likes">
				<p>{post.likes ? post.likes : '0'}</p>
			</div>
			{#if $user && $user.username === post.user.username}
				<button class="trash" on:click={deletePost}>
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

<style lang="scss">
	@import 'src/variables.scss';

	.like svg path {
		transition: fill 0.1s ease-in-out, stroke 0.1s ease-in-out;
	}

	.like:not([data-liked='true']):not([data-logged='false']):hover {
		svg path {
			fill: white;
		}
	}

	.trash:hover {
		svg path {
			fill-opacity: 0.8;
		}
	}

	.post {
		display: flex;
		gap: 10px;

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
			.user {
				display: flex;
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
			}
		}

		&:hover {
			.text .user button {
				opacity: 1;
			}
		}
	}
</style>
