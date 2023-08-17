<script lang="ts">
	import type { PageData } from './$types';
	import Posts from '$lib/components/Posts.svelte';
	import { user } from '$lib/store';
	import { goto, invalidate } from '$app/navigation';

	export let data: PageData;
	export let editing = false;

	let error: string | null = null;

	async function updateUser(e: Event) {
		const target = e.target as HTMLFormElement;

		const form = new FormData(target);

		const avatar = form.get('avatar') as File;

		if (avatar.size > 1024 * 1024 * 10) {
			error = 'Avatar too big, max size is 10mb';
			return;
		}

		if (!form.get('fullName') || !form.get('username') || !form.get('email')) {
			return;
		}

		if (form.get('password')) {
			if (form.get('password') !== form.get('confirmPassword')) {
				error = 'Passwords do not match';
				return;
			}
		}

		const res = await fetch('/api/user', {
			method: 'PATCH',
			body: form
		});

		if (!res.ok) {
			error = await res.text();
			return;
		}

		const newUser = await res.json();
		let redirect = false;

		if (data.user.username !== newUser.username) {
			redirect = true;
		}

		data.user = newUser;
		$user = newUser;

		editing = false;
		error = null;

		if (redirect) {
			goto(`/@${newUser.username}`);
		} else {
			location.reload();
		}
	}
</script>

{#if error}
	<p class="error">{error}</p>
{/if}
<div class="user">
	<div class="avatar">
		<img
			src={data.user.avatar || 'https://source.boringavatars.com/beam/60/' + data.user.username}
			alt={data.user.name}
			height="60"
			width="60"
		/>
	</div>
	{#if !editing}
		<div class="content">
			<div class="top">
				<h2>{data.user.name}</h2>
				<button
					on:click={() => {
						editing = true;
					}}
					><svg xmlns="http://www.w3.org/2000/svg" fill="white" height="1em" viewBox="0 0 512 512"
						><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
							d="M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160V416c0 53 43 96 96 96H352c53 0 96-43 96-96V320c0-17.7-14.3-32-32-32s-32 14.3-32 32v96c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V160c0-17.7 14.3-32 32-32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32H96z"
						/></svg
					></button
				>
			</div>
			<p>@{data.user.username}</p>
		</div>
	{:else}
		<form on:submit|preventDefault={updateUser}>
			<div class="field">
				<label for="avatar">Avatar</label>
				<input name="avatar" id="avatar" type="file" accept="image/*" />
			</div>
			<div class="field">
				<label for="fullName">Name</label>
				<input
					id="fullName"
					placeholder="Giorgio"
					name="fullName"
					type="text"
					value={data.user.name}
					required
				/>
			</div>
			<div class="field">
				<label for="username">Username</label>
				<input
					id="username"
					placeholder="Infinit7Even"
					name="username"
					type="text"
					value={data.user.username}
					required
				/>
			</div>
			<div class="field">
				<label for="email">Email</label>
				<input
					id="email"
					placeholder="social@giorgiovola.casa"
					name="email"
					type="email"
					value={data.user.email}
					required
				/>
			</div>
			<div class="field">
				<label for="password">New password</label>
				<input placeholder="G1*rg!07" name="password" type="password" />
			</div>
			<div class="field">
				<label for="password">Confirm new password</label>
				<input placeholder="G1*rg!07" name="confirmPassword" type="password" />
			</div>
			<div class="buttons">
				<button class="btn" type="submit">Save</button>
				<button
					class="btn cancel"
					on:click={() => {
						editing = false;
					}}>Cancel</button
				>
			</div>
		</form>
	{/if}
</div>

{#key data.user}
	<Posts posts={data.posts} />
{/key}

<style lang="scss">
	@import 'src/variables';

	.error {
		background-color: $color4;
		padding: 5px;
		border-radius: 5px;
		margin-bottom: 20px;
	}

	.user {
		display: flex;
		margin-bottom: 20px;
		gap: 10px;

		img {
			border-radius: 50%;
			object-fit: cover;
		}

		.content {
			width: 100%;
			display: flex;
			flex-direction: column;

			.top {
				display: flex;
				justify-content: space-between;

				button {
					all: unset;
					cursor: pointer;
				}
			}
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 15px;

			.field {
				display: flex;
				flex-direction: column;

				label {
					font-size: 0.8em;
					opacity: 0.8;
				}

				input {
					all: unset;
					border-bottom: 1px solid #ccc;
				}
			}

			.buttons {
				.cancel {
					border: 1px solid $color4;

					&:hover {
						background: $color4;
					}
				}
			}
		}
	}
</style>
