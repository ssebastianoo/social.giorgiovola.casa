<script lang="ts">
	import { user } from './store';
	import type { Post } from './types';

	export let post: Post;

	function deletePost(id: number) {
		throw new Error('Function not implemented.');
	}
</script>

<a href={`/@${post.user.username}/${post.id}`} class="post-wrapper">
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

				{#if $user && $user.username === post.user.username}
					<button
						on:click={() => {
							deletePost(post.id);
						}}
						><svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 448 512"
							><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
								d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"
							/></svg
						></button
					>
				{/if}
			</div>
			<div class="content">
				<p>{post.content}</p>
			</div>
		</div>
	</div>
</a>

<style lang="scss">
	@import 'src/variables.scss';

	.post-wrapper {
		color: unset;
		text-decoration: none;
		border-radius: 5px;
		padding: 10px;
		display: block;

		&:hover {
			background-color: black;
		}
	}

	// :global(.posts):hover {
	// 	.post:not(:hover) {
	// 		filter: blur(2px);
	// 	}
	// }

	.post {
		display: flex;
		gap: 10px;

		.img-url {
			display: flex;

			img {
				height: fit-content;
			}
		}

		.text {
			display: flex;
			flex-direction: column;
			gap: 3px;

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

				button {
					all: unset;
					display: flex;
					align-items: center;
					opacity: 0;
					cursor: pointer;

					svg {
						fill: $color3;
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
