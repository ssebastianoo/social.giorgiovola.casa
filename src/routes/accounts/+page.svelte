<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { ActionData, PageData } from './$types';
	import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import { page } from '$app/state';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const sectionClass = 'mb-10 flex flex-col gap-3';
	const hintClass = 'text-[0.85em] text-muted';
	const rowClass = 'flex flex-col gap-2.5 rounded-md border p-2';
	const badgeClass = 'rounded-full bg-accent px-2 text-[0.8em] font-bold text-background';

	let accounts = $derived(data.accounts as SwitcherAccount[]);
	// keeps what was typed when creating an identity fails
	let values = $derived(
		(form && 'values' in form ? form.values : null) as { name: string; username: string } | null
	);
	let current = $derived(accounts.find((a) => a.active || a.identities.some((i) => i.active)));
	let others = $derived(accounts.filter((a) => a !== current));
	let owned = $derived(current?.identities.filter((i) => !i.sharedBy).length ?? 0);
	let canCreate = $derived(!!current && owned < data.maxIdentities);
	// a failed share keeps its form open with what was typed
	let shareFailed = $derived(
		(form && 'shareId' in form ? form : null) as {
			error: string;
			shareId: number;
			username: string;
		} | null
	);
	let sharing = $state<number | null>(null);
	let shareOpen = $derived(sharing ?? shareFailed?.shareId ?? null);

	const membersOf = (profile: SwitcherProfile) =>
		data.members.filter((m) => m.identity_id === profile.id);

	const confirmDelete = (profile: SwitcherProfile) => (e: SubmitEvent) => {
		const ok = confirm(
			`Delete @${profile.username}? Its posts, likes and notifications will be deleted too. This can't be undone.`
		);
		if (!ok) e.preventDefault();
	};

	const confirmLeave = (profile: SwitcherProfile) => (e: SubmitEvent) => {
		const ok = confirm(
			`Stop using @${profile.username}? You will need @${profile.sharedBy} to share it again.`
		);
		if (!ok) e.preventDefault();
	};

	const confirmUnshare = (profile: SwitcherProfile, username: string) => (e: SubmitEvent) => {
		if (!confirm(`Stop sharing @${profile.username} with @${username}?`)) e.preventDefault();
	};
</script>

{#if form && 'error' in form && form.error && !shareFailed}
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{form.error}</p>
{/if}

{#if current}
	<section class={sectionClass}>
		<h2>Identities</h2>
		<p class={hintClass}>
			Identities are extra profiles of <b>@{current.username}</b>: they post, like and get
			notifications on their own, but have no email or password. Nobody can see they belong to you,
			except the accounts you share one with: those can switch to it and use it too.
		</p>

		<ul class="flex flex-col gap-2">
			{#each [current, ...current.identities] as profile (profile.id)}
				{@const members = membersOf(profile)}
				<li class="{rowClass} {profile.active ? 'border-accent' : 'border-line'}">
					<div class="flex items-center gap-2.5">
						<Avatar user={profile} size={40} />
						<div class="flex min-w-0 flex-1 flex-col">
							<a class="truncate font-bold text-foreground" href={'/@' + profile.username}
								>{profile.name}</a
							>
							<span class="truncate text-[0.8em] text-muted">
								@{profile.username}
								{#if profile === current}
									· account
								{:else if profile.sharedBy}
									· shared by @{profile.sharedBy}
								{:else if members.length > 0}
									· shared with {members.length}
								{/if}
							</span>
						</div>
						{#if profile.unread > 0}
							<span class={badgeClass} title="Unread notifications">{profile.unread}</span>
						{/if}
						<div class="flex flex-wrap items-center justify-end gap-1.5">
							{#if profile.active}
								<span class="text-[0.8em] text-accent">in use</span>
							{:else}
								<form method="POST" action="?/switch">
									<input type="hidden" name="id" value={profile.id} />
									<input type="hidden" name="redirectTo" value={page.url.pathname} />
									<Button type="submit" size="sm">Switch</Button>
								</form>
							{/if}
							{#if profile.sharedBy}
								<form method="POST" action="?/leave" onsubmit={confirmLeave(profile)}>
									<input type="hidden" name="id" value={profile.id} />
									<Button variant="danger" type="submit" size="sm">Leave</Button>
								</form>
							{:else if profile !== current}
								<Button
									size="sm"
									variant={shareOpen === profile.id ? 'primary' : 'default'}
									aria-expanded={shareOpen === profile.id}
									onclick={() => (sharing = shareOpen === profile.id ? -1 : profile.id)}
									>Share</Button
								>
								<form method="POST" action="?/delete" onsubmit={confirmDelete(profile)}>
									<input type="hidden" name="id" value={profile.id} />
									<Button variant="danger" type="submit" size="sm">Delete</Button>
								</form>
							{/if}
						</div>
					</div>

					{#if shareOpen === profile.id}
						<div class="flex flex-col gap-2.5 border-t border-line pt-2.5">
							<p class={hintClass}>
								Accounts you share <b>@{profile.username}</b> with can switch to it, post, reply, send
								messages and edit its profile. Only you can delete it or change who it is shared with.
							</p>
							{#if members.length > 0}
								<ul class="flex flex-col gap-1.5">
									{#each members as member (member.id)}
										<li class="flex items-center gap-2.5">
											<Avatar user={member} size={24} />
											<a class="min-w-0 flex-1 truncate text-[0.9em]" href={'/@' + member.username}
												>{member.name} <span class="opacity-70">@{member.username}</span></a
											>
											<form
												method="POST"
												action="?/unshare"
												onsubmit={confirmUnshare(profile, member.username)}
											>
												<input type="hidden" name="id" value={profile.id} />
												<input type="hidden" name="account" value={member.id} />
												<Button variant="danger" type="submit" size="sm">Remove</Button>
											</form>
										</li>
									{/each}
								</ul>
							{/if}
							{#if shareFailed?.shareId === profile.id}
								<p class="rounded-[5px] bg-danger p-[5px]">{shareFailed.error}</p>
							{/if}
							{#if members.length < data.maxMembers}
								<form method="POST" action="?/share" class="flex items-center gap-2.5">
									<input type="hidden" name="id" value={profile.id} />
									<input
										class="input min-w-0 flex-1"
										type="text"
										name="username"
										placeholder="Username of an account"
										maxlength="33"
										autocomplete="off"
										value={shareFailed?.shareId === profile.id ? shareFailed.username : ''}
										required
									/>
									<Button type="submit" size="sm">Share</Button>
								</form>
							{:else}
								<p class={hintClass}>
									You can share an identity with at most {data.maxMembers} accounts.
								</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if canCreate}
			<form method="POST" action="?/create" class="mt-2.5 flex flex-col gap-3">
				<h3>New identity</h3>
				<input
					class="input"
					type="text"
					name="fullName"
					placeholder="Display name"
					maxlength="64"
					value={values?.name ?? ''}
					required
				/>
				<input
					class="input"
					type="text"
					name="username"
					placeholder="Username (a-z, 0-9, _)"
					pattern={'[a-zA-Z0-9_]{1,32}'}
					maxlength="32"
					value={values?.username ?? ''}
					required
				/>
				<Button class="self-start" type="submit">Create and switch</Button>
			</form>
		{:else}
			<p class={hintClass}>You reached the limit of {data.maxIdentities} identities.</p>
		{/if}
	</section>
{/if}

<section class={sectionClass}>
	<h2>Other accounts</h2>
	{#if others.length > 0}
		<ul class="flex flex-col gap-2">
			{#each others as account (account.id)}
				{@const unread = account.unread + account.identities.reduce((n, i) => n + i.unread, 0)}
				<li class="{rowClass} border-line">
					<div class="flex items-center gap-2.5">
						<Avatar user={account} size={40} />
						<div class="flex min-w-0 flex-1 flex-col">
							<a class="truncate font-bold text-foreground" href={'/@' + account.username}
								>{account.name}</a
							>
							<span class="text-[0.8em] text-muted">
								@{account.username}
								{#if account.identities.length > 0}
									· {account.identities.length}
									{account.identities.length === 1 ? 'identity' : 'identities'}
								{/if}
							</span>
						</div>
						{#if unread > 0}
							<span class={badgeClass} title="Unread notifications">{unread}</span>
						{/if}
						<form method="POST" action="?/switch">
							<input type="hidden" name="id" value={account.id} />
							<input type="hidden" name="redirectTo" value="/accounts" />
							<Button type="submit" size="sm">Switch</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class={hintClass}>No other accounts are signed in on this browser.</p>
	{/if}
	<div class="flex flex-wrap gap-2.5">
		<Button href="/login">Sign in to another account</Button>
		<Button variant="danger" href="/logout">Log out</Button>
	</div>
</section>
