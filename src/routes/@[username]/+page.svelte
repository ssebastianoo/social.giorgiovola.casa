<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { PageProps } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import { user } from '#lib/store.js';
	import { goto } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';
	import ModerationControls from '#lib/components/ModerationControls.svelte';
	import { websiteLabel } from '#lib/utils.js';

	let { data }: PageProps = $props();

	let editing = $state(false);
	let error: string | null = $state(null);
	let profile = $derived(data.user);
	// writable derived: reset on navigation, updated by the follow button
	let follow = $derived(data.follow);
	let bio = $derived(data.bio);
	let website = $derived(data.website);
	let followBusy = $state(false);

	const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

	// "A, B, and 3 others", like the profile card
	const followedByText = $derived.by(() => {
		const { users, total } = data.followedBy;
		const names = users.map((u) => u.name);
		const rest = total - names.length;
		if (rest > 0) return `${names.join(', ')}, and ${rest} other${rest === 1 ? '' : 's'}`;
		if (names.length > 1) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
		return names[0] ?? '';
	});

	// identities have no email or password of their own
	let identity = $derived(profile.owner_id !== null);

	async function toggleFollow() {
		followBusy = true;
		try {
			const res = await fetch(`/api/users/${profile.username}/follow`, {
				method: follow.followed ? 'DELETE' : 'POST'
			});
			if (!res.ok) {
				error = (await res.text()) || 'Could not update follow';
				return;
			}
			follow = await res.json();
			error = null;
		} finally {
			followBusy = false;
		}
	}

	async function updateUser(e: SubmitEvent) {
		e.preventDefault();
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

		if (profile.username !== newUser.username) {
			redirect = true;
		}

		profile = newUser;
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
	<Avatar size={60} user={profile} clickable={false} />

	{#if !editing}
		<div class="flex w-full justify-between">
			<div>
				<h2>{profile.name}</h2>
				<p>@{profile.username}</p>
				{#if bio}
					<p class="mt-2 break-words whitespace-pre-line">{bio}</p>
				{/if}
				{#if website}
					<a
						class="mt-1 block break-all"
						href={website}
						target="_blank"
						rel="noopener noreferrer nofollow ugc">{websiteLabel(website)}</a
					>
				{/if}
				<p class="mt-1 flex gap-3 text-[0.9em] text-muted">
					<a class="text-inherit" href="/@{profile.username}/following"
						><b class="text-foreground">{nf.format(follow.following)}</b> following</a
					>
					<a class="text-inherit" href="/@{profile.username}/followers"
						><b class="text-foreground">{nf.format(follow.followers)}</b>
						{follow.followers === 1 ? 'follower' : 'followers'}</a
					>
				</p>
				{#if data.followedBy.total > 0}
					<a
						class="mt-2 flex items-center gap-2.5 text-[0.85em] text-muted"
						href="/@{profile.username}/followers/known"
					>
						<span class="flex shrink-0">
							{#each data.followedBy.users as u, i (u.username)}
								<span class="rounded-full ring-2 ring-background {i > 0 ? '-ml-2' : ''}">
									<Avatar size={24} user={u} clickable={false} />
								</span>
							{/each}
						</span>
						<span>Followed by {followedByText}</span>
					</a>
				{/if}
			</div>
			{#if $user && $user.id === profile.id}
				<div class="flex gap-2.5">
					<Button
						size="sm"
						onclick={() => {
							editing = true;
						}}>Edit</Button
					>
					<form method="POST" action="/logout?/current">
						<Button type="submit" variant="danger" size="sm">Logout</Button>
					</form>
				</div>
			{:else if $user}
				<div class="flex gap-2.5">
					<Button
						size="sm"
						variant={follow.followed ? 'default' : 'primary'}
						disabled={followBusy}
						onclick={toggleFollow}>{follow.followed ? 'Unfollow' : 'Follow'}</Button
					>
					<Button size="sm" href={`/messages/${profile.username}`}>Message</Button>
				</div>
			{/if}
		</div>
	{:else}
		<form class="flex flex-col gap-3.75" onsubmit={updateUser}>
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
					value={profile.name}
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
					value={profile.username}
					required
				/>
			</div>
			<div class="flex flex-col">
				<label class="text-[0.8em] opacity-80" for="bio">Bio</label>
				<!-- same limit as LIMITS.bio, enforced on the server; prettier 2 would self-close it -->
				<!-- prettier-ignore -->
				<textarea
					class="resize-none border-b border-[#ccc] outline-none"
					id="bio"
					name="bio"
					rows="3"
					maxlength="160"
					placeholder="A few words about you"
					value={bio}
				></textarea>
			</div>
			<div class="flex flex-col">
				<label class="text-[0.8em] opacity-80" for="website">Website</label>
				<input
					class="border-b border-[#ccc] outline-none"
					id="website"
					name="website"
					type="text"
					inputmode="url"
					maxlength="200"
					placeholder="giorgiovola.casa"
					value={website}
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
						value={profile.email}
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
				<Button type="submit">Save</Button>
				<Button
					variant="danger"
					type="button"
					onclick={() => {
						editing = false;
					}}>Cancel</Button
				>
			</div>
		</form>
	{/if}
</div>

{#if data.moderation}
	<ModerationControls
		username={profile.username}
		banned={data.moderation.banned}
		muted={data.moderation.muted}
		banReason={data.moderation.ban_reason}
		muteReason={data.moderation.mute_reason}
		identity={data.moderation.identity}
	/>
{/if}

{#key profile}
	<Posts shouldLoadMore posts={data.posts} />
{/key}
