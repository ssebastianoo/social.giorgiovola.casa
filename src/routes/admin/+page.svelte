<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { PageProps } from './$types';
	import { enhance, type SubmitFunction } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';

	let { data, form }: PageProps = $props();

	const filters = [
		{ value: 'all', label: 'All' },
		{ value: 'banned', label: 'Banned' },
		{ value: 'muted', label: 'Muted' },
		{ value: 'staff', label: 'Staff' }
	];

	const hintClass = 'text-[0.85em] text-muted';
	const badgeClass = 'rounded-full border px-2 text-[0.75em] font-bold';

	// keeps the search and filter when moving between pages
	const href = (page: number, filter: string = data.filter) => {
		const params = new URLSearchParams();
		if (data.q) params.set('q', data.q);
		if (filter !== 'all') params.set('filter', filter);
		if (page > 0) params.set('page', String(page));
		const query = params.toString();
		return query ? `?${query}` : '?';
	};

	// a search that found the account through one of its identities opens the list
	const matches = (p: { username: string; name: string }) => {
		const q = data.q.toLowerCase();
		return !!q && (p.username.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
	};

	// enhance submits even when onsubmit calls preventDefault, so the confirms go through cancel()
	const confirmBan =
		(username: string): SubmitFunction =>
		({ cancel }) => {
			if (!confirm(`Ban @${username}? They will be signed out everywhere.`)) cancel();
		};
	const confirmPassword =
		(username: string): SubmitFunction =>
		({ cancel }) => {
			if (!confirm(`Reset the password of @${username}? They will be signed out everywhere.`))
				return cancel();
			return async ({ update }) => {
				// the new password shouldn't linger in the field
				await update({ reset: true });
			};
		};
</script>

<svelte:head>
	<title>Moderation</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h2>Moderation</h2>
		<p class={hintClass}>
			You are {data.role === 'admin' ? 'an admin' : 'a mod'}.
			{#if data.role === 'admin'}
				Admins reset passwords, manage mods and can do everything mods can.
			{:else}
				Mods ban, mute, unban and unmute users. Posts are deleted from the post itself.
			{/if}
		</p>
	</div>

	{#if form?.error}
		<p class="rounded-[5px] bg-danger p-[5px]">{form.error}</p>
	{:else if form?.message}
		<p class="rounded-[5px] bg-accent p-[5px] text-background">{form.message}</p>
	{/if}

	<form method="GET" class="flex flex-wrap gap-2.5">
		<input
			class="input min-w-0 flex-1"
			type="search"
			name="q"
			placeholder="Search users or identities"
			value={data.q}
		/>
		{#if data.filter !== 'all'}
			<input type="hidden" name="filter" value={data.filter} />
		{/if}
		<Button type="submit">Search</Button>
	</form>

	<nav class="flex flex-wrap gap-2.5">
		{#each filters as filter (filter.value)}
			<Button
				variant={data.filter === filter.value ? 'primary' : 'default'}
				aria-current={data.filter === filter.value ? 'page' : undefined}
				href={href(0, filter.value)}>{filter.label}</Button
			>
		{/each}
	</nav>

	<ul class="flex flex-col gap-2">
		{#each data.users as u (u.username)}
			<li class="flex flex-col gap-2 rounded-md border border-line p-2">
				<div class="flex items-center gap-2.5">
					<Avatar user={u} size={40} />
					<div class="flex min-w-0 flex-1 flex-col">
						<a class="truncate font-bold text-foreground" href={'/@' + u.username}>{u.name}</a>
						<span class="text-[0.8em] text-muted">@{u.username}</span>
					</div>
					<div class="flex flex-wrap justify-end gap-1.5">
						{#if u.role !== 'user'}
							<span class="{badgeClass} border-accent text-accent">{u.role}</span>
						{/if}
						{#if u.banned_at}
							<span class="{badgeClass} border-danger text-danger">banned</span>
						{/if}
						{#if u.muted_at}
							<span class="{badgeClass} border-danger text-danger">muted</span>
						{/if}
					</div>
				</div>

				{#if u.banned_at && u.ban_reason}
					<p class={hintClass}>Ban reason: {u.ban_reason}</p>
				{/if}
				{#if u.muted_at && u.mute_reason}
					<p class={hintClass}>Mute reason: {u.mute_reason}</p>
				{/if}

				{#if u.identities.length > 0 || u.sharedWith.length > 0}
					{@const profiles = [...u.identities, ...u.sharedWith]}
					<details class="text-[0.9em]" open={!matches(u) && profiles.some(matches)}>
						<summary class="cursor-pointer text-muted">
							{#if u.identities.length > 0}
								{u.identities.length}
								{u.identities.length === 1 ? 'identity' : 'identities'}
							{/if}
							{#if u.identities.length > 0 && u.sharedWith.length > 0}·{/if}
							{#if u.sharedWith.length > 0}
								{u.sharedWith.length} shared by others
							{/if}
						</summary>
						<ul class="mt-2 flex flex-col gap-1.5">
							{#each u.identities as i (i.username)}
								<li
									class="flex items-center gap-2.5 rounded-md p-[5px] {matches(i)
										? 'bg-white/5'
										: ''}"
								>
									<Avatar user={i} size={24} />
									<div class="flex min-w-0 flex-1 flex-col">
										<span class="truncate">
											<a class="font-bold text-foreground" href={'/@' + i.username}>{i.name}</a>
											<span class="opacity-70">@{i.username}</span>
										</span>
										{#if i.members.length > 0}
											<span class={hintClass}>
												Shared with {i.members.map((m) => '@' + m).join(', ')}
											</span>
										{/if}
									</div>
									{#if i.bot}
										<span class="{badgeClass} border-line text-muted">bot</span>
									{/if}
								</li>
							{/each}
							{#each u.sharedWith as i (i.username)}
								<li
									class="flex items-center gap-2.5 rounded-md p-[5px] {matches(i)
										? 'bg-white/5'
										: ''}"
								>
									<Avatar user={i} size={24} />
									<div class="flex min-w-0 flex-1 flex-col">
										<span class="truncate">
											<a class="font-bold text-foreground" href={'/@' + i.username}>{i.name}</a>
											<span class="opacity-70">@{i.username}</span>
										</span>
										<span class={hintClass}>
											Owned by
											<a href={'?q=' + encodeURIComponent(i.owner_username)}>@{i.owner_username}</a>
										</span>
									</div>
								</li>
							{/each}
						</ul>
					</details>
				{/if}

				{#if u.canModerate}
					<div class="flex flex-wrap items-center gap-2">
						{#if u.banned_at}
							<form method="POST" action="?/unban" use:enhance>
								<input type="hidden" name="username" value={u.username} />
								<Button type="submit">Unban</Button>
							</form>
						{:else}
							<form
								class="flex flex-wrap items-center gap-2"
								method="POST"
								action="?/ban"
								use:enhance={confirmBan(u.username)}
							>
								<input type="hidden" name="username" value={u.username} />
								<input
									class="input w-auto! min-w-0 flex-1 p-[5px]!"
									type="text"
									name="reason"
									placeholder="Reason (optional)"
									maxlength="200"
								/>
								<Button variant="danger" type="submit">Ban</Button>
							</form>
						{/if}
						{#if u.muted_at}
							<form method="POST" action="?/unmute" use:enhance>
								<input type="hidden" name="username" value={u.username} />
								<Button type="submit">Unmute</Button>
							</form>
						{:else}
							<form
								class="flex flex-wrap items-center gap-2"
								method="POST"
								action="?/mute"
								use:enhance
							>
								<input type="hidden" name="username" value={u.username} />
								<input
									class="input w-auto! min-w-0 flex-1 p-[5px]!"
									type="text"
									name="reason"
									placeholder="Reason (optional)"
									maxlength="200"
								/>
								<Button type="submit">Mute</Button>
							</form>
						{/if}
					</div>
				{:else if u.self}
					<p class={hintClass}>This is you.</p>
				{/if}

				{#if u.canManage}
					<details class="text-[0.9em]">
						<summary class="cursor-pointer text-muted">Admin actions</summary>
						<div class="mt-2 flex flex-col gap-2">
							<form method="POST" action="?/role" use:enhance>
								<input type="hidden" name="username" value={u.username} />
								<input type="hidden" name="role" value={u.role === 'mod' ? 'user' : 'mod'} />
								<Button type="submit">{u.role === 'mod' ? 'Remove mod' : 'Make mod'}</Button>
							</form>
							<form
								class="flex flex-wrap items-center gap-2"
								method="POST"
								action="?/password"
								use:enhance={confirmPassword(u.username)}
							>
								<input type="hidden" name="username" value={u.username} />
								<input
									class="input w-auto! min-w-0 flex-1 p-[5px]!"
									type="password"
									name="password"
									placeholder="New password"
									autocomplete="new-password"
									minlength="8"
									maxlength="256"
									required
								/>
								<Button variant="danger" type="submit">Reset password</Button>
							</form>
						</div>
					</details>
				{/if}
			</li>
		{:else}
			<li class={hintClass}>No users found.</li>
		{/each}
	</ul>

	{#if data.page > 0 || data.hasMore}
		<div class="flex gap-2.5">
			{#if data.page > 0}
				<Button href={href(data.page - 1)}>Previous</Button>
			{/if}
			{#if data.hasMore}
				<Button href={href(data.page + 1)}>Next</Button>
			{/if}
		</div>
	{/if}
</div>
