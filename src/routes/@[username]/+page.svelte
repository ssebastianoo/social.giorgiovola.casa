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
			<div class="left">
				<h2>{data.user.name}</h2>
				<p>@{data.user.username}</p>
			</div>
			<div class="right">
				<button
					class="btn"
					on:click={() => {
						editing = true;
					}}>Edit</button
				>
				<a href="/logout" class="btn">Logout</a>
			</div>
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

		.avatar {
			display: flex;

			img {
				border-radius: 50%;
				object-fit: cover;
			}
		}
		.content {
			width: 100%;
			display: flex;
			justify-content: space-between;

			.right {
				display: flex;
				gap: 10px;

				.btn {
					height: 20px;
				}

				a {
					border-color: $color4;

					&:hover {
						background: $color4;
						text-decoration: none;
					}
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
