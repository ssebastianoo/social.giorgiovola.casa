<script lang="ts">
	import type { PageData } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import { user } from '#lib/store.js';
	import { goto } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';

	export let data: PageData;
	export let editing = false;

	let error: string | null = null;

	// identities have no email or password of their own
	$: identity = data.user.owner_id !== null;

	async function updateUser(e: Event) {
		const target = e.target as HTMLFormElement;

		const form = new FormData(target);

		const avatar = form.get('avatar') as File;

		if (avatar.size > 1024 * 1024 * 10) {
			error = 'Avatar too big, max size is 10mb';
			return;
		}

		if (!form.get('fullName') || !form.get('username') || (!identity && !form.get('email'))) {
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
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{error}</p>
{/if}
<div class="mb-5 flex gap-2.5">
	<Avatar size={60} user={data.user} clickable={false} />

	{#if !editing}
		<div class="flex w-full justify-between">
			<div>
				<h2>{data.user.name}</h2>
				<p>@{data.user.username}</p>
			</div>
			{#if $user && $user.id === data.user.id}
				<div class="flex gap-2.5">
					<button
						class="btn h-8"
						on:click={() => {
							editing = true;
						}}>Edit</button
					>
					<form method="POST" action="/logout?/current">
						<button type="submit" class="btn btn-red h-8">Logout</button>
					</form>
				</div>
			{:else if $user}
				<a class="btn h-8 hover:no-underline" href={`/messages/${data.user.username}`}>Message</a>
			{/if}
		</div>
	{:else}
		<form class="flex flex-col gap-3.75" on:submit|preventDefault={updateUser}>
			<div class="flex flex-col">
				<label class="text-[0.8em] opacity-80" for="avatar">Avatar</label>
				<input
					class="border-b border-[#ccc] outline-none file:mr-1 file:cursor-pointer file:rounded-sm file:border file:border-line file:px-1.5"
					name="avatar"
					id="avatar"
					type="file"
					accept="image/*"
				/>
			</div>
			<div class="flex flex-col">
				<label class="text-[0.8em] opacity-80" for="fullName">Name</label>
				<input
					class="border-b border-[#ccc] outline-none"
					id="fullName"
					placeholder="Giorgio"
					name="fullName"
					type="text"
					value={data.user.name}
					required
				/>
			</div>
			<div class="flex flex-col">
				<label class="text-[0.8em] opacity-80" for="username">Username</label>
				<input
					class="border-b border-[#ccc] outline-none"
					id="username"
					placeholder="Infinit7Even"
					name="username"
					type="text"
					value={data.user.username}
					required
				/>
			</div>
			{#if !identity}
				<div class="flex flex-col">
					<label class="text-[0.8em] opacity-80" for="email">Email</label>
					<input
						class="border-b border-[#ccc] outline-none"
						id="email"
						placeholder="social@giorgiovola.casa"
						name="email"
						type="email"
						value={data.user.email}
						required
					/>
				</div>
				<div class="flex flex-col">
					<label class="text-[0.8em] opacity-80" for="password">New password</label>
					<input
						class="border-b border-[#ccc] outline-none"
						placeholder="G1*rg!07"
						name="password"
						type="password"
					/>
				</div>
				<div class="flex flex-col">
					<label class="text-[0.8em] opacity-80" for="password">Confirm new password</label>
					<input
						class="border-b border-[#ccc] outline-none"
						placeholder="G1*rg!07"
						name="confirmPassword"
						type="password"
					/>
				</div>
			{/if}
			<div>
				<button class="btn" type="submit">Save</button>
				<button
					class="btn btn-red"
					on:click={() => {
						editing = false;
					}}>Cancel</button
				>
			</div>
		</form>
	{/if}
</div>

{#key data.user}
	<Posts shouldLoadMore posts={data.posts} />
{/key}
