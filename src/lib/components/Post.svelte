<script lang="ts">
	import { user } from '$lib/store';
	import type { Post } from '$lib/types';

	export let post: Post;

	async function deletePost(id: number) {
		await fetch('/api/posts', {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id
			})
		});
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
            post = data.post;
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
            <button on:click={toggleLike} class="like">
                <svg fill="#ffffff" height="20px" width="20px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 471.701 471.701" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M433.601,67.001c-24.7-24.7-57.4-38.2-92.3-38.2s-67.7,13.6-92.4,38.3l-12.9,12.9l-13.1-13.1 c-24.7-24.7-57.6-38.4-92.5-38.4c-34.8,0-67.6,13.6-92.2,38.2c-24.7,24.7-38.3,57.5-38.2,92.4c0,34.9,13.7,67.6,38.4,92.3 l187.8,187.8c2.6,2.6,6.1,4,9.5,4c3.4,0,6.9-1.3,9.5-3.9l188.2-187.5c24.7-24.7,38.3-57.5,38.3-92.4 C471.801,124.501,458.301,91.701,433.601,67.001z M414.401,232.701l-178.7,178l-178.3-178.3c-19.6-19.6-30.4-45.6-30.4-73.3 s10.7-53.7,30.3-73.2c19.5-19.5,45.5-30.3,73.1-30.3c27.7,0,53.8,10.8,73.4,30.4l22.6,22.6c5.3,5.3,13.8,5.3,19.1,0l22.4-22.4 c19.6-19.6,45.7-30.4,73.3-30.4c27.6,0,53.6,10.8,73.2,30.3c19.6,19.6,30.3,45.6,30.3,73.3 C444.801,187.101,434.001,213.101,414.401,232.701z"></path> </g> </g></svg>
            </button>
            {#if $user && $user.username === post.user.username}
            <button
                on:click={() => {
                    deletePost(post.id);
                }}
                ><svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 448 512"
                    ><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
                        d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"
                    /></svg
                ></button
            >
        {/if}
        </div>
	</div>
</div>

<style lang="scss">
	@import 'src/variables.scss';

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
                width: 100%;
                gap: 10px;
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
