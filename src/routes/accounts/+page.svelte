<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { ActionData, PageData } from './$types';
	import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import { page } from '$app/state';

	export let data: PageData;
	export let form: ActionData;

	const sectionClass = 'mb-10 flex flex-col gap-3';
	const hintClass = 'text-[0.85em] text-muted';
	const rowClass = 'flex items-center gap-2.5 rounded-md border p-2';
	const badgeClass = 'rounded-full bg-accent px-2 text-[0.8em] font-bold text-background';

	$: accounts = data.accounts as SwitcherAccount[];
	// keeps what was typed when creating an identity fails
	$: values = (form && 'values' in form ? form.values : null) as {
		name: string;
		username: string;
	} | null;
	$: current = accounts.find((a) => a.active || a.identities.some((i) => i.active));
	$: others = accounts.filter((a) => a !== current);
	$: canCreate = !!current && current.identities.length < data.maxIdentities;

	const confirmDelete = (profile: SwitcherProfile) => (e: SubmitEvent) => {
		const ok = confirm(
			`Delete @${profile.username}? Its posts, likes and notifications will be deleted too. This can't be undone.`
		);
		if (!ok) e.preventDefault();
	};
</script>

{#if form?.error}
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{form.error}</p>
{/if}

{#if current}
	<section class={sectionClass}>
		<h2>Identities</h2>
		<p class={hintClass}>
			Identities are extra profiles of <b>@{current.username}</b>: they post, like and get
			notifications on their own, but have no email or password. Nobody else can see they belong to
			you.
		</p>

		<ul class="flex flex-col gap-2">
			{#each [current, ...current.identities] as profile (profile.id)}
				<li class="{rowClass} {profile.active ? 'border-accent' : 'border-line'}">
					<Avatar user={profile} size={40} />
					<div class="flex min-w-0 flex-1 flex-col">
						<a class="truncate font-bold text-foreground" href={'/@' + profile.username}
							>{profile.name}</a
						>
						<span class="text-[0.8em] text-muted"
							>@{profile.username}{profile === current ? ' · account' : ''}</span
						>
					</div>
					{#if profile.unread > 0}
						<span class={badgeClass} title="Unread notifications">{profile.unread}</span>
					{/if}
					<div class="flex items-center gap-1.5">
						{#if profile.active}
							<span class="text-[0.8em] text-accent">in use</span>
						{:else}
							<form method="POST" action="?/switch">
								<input type="hidden" name="id" value={profile.id} />
								<input type="hidden" name="redirectTo" value={page.url.pathname} />
								<Button type="submit">Switch</Button>
							</form>
						{/if}
						{#if profile !== current}
							<form method="POST" action="?/delete" on:submit={confirmDelete(profile)}>
								<input type="hidden" name="id" value={profile.id} />
								<Button variant="danger" type="submit">Delete</Button>
							</form>
						{/if}
					</div>
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
				<li class="{rowClass} border-line">
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
					{#if account.unread + account.identities.reduce((n, i) => n + i.unread, 0) > 0}
						<span class={badgeClass} title="Unread notifications">
							{account.unread + account.identities.reduce((n, i) => n + i.unread, 0)}
						</span>
					{/if}
					<div class="flex items-center gap-1.5">
						<form method="POST" action="?/switch">
							<input type="hidden" name="id" value={account.id} />
							<input type="hidden" name="redirectTo" value="/accounts" />
							<Button type="submit">Switch</Button>
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
