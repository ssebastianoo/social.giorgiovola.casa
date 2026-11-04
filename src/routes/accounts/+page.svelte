<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import { page } from '$app/state';

	export let data: PageData;
	export let form: ActionData;

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
	<p class="error">{form.error}</p>
{/if}

{#if current}
	<section>
		<h2>Identities</h2>
		<p class="hint">
			Identities are extra profiles of <b>@{current.username}</b>: they post, like and get
			notifications on their own, but have no email or password. Nobody else can see they belong to
			you.
		</p>

		<ul class="profiles">
			{#each [current, ...current.identities] as profile (profile.id)}
				<li class:active={profile.active}>
					<Avatar user={profile} size={40} />
					<div class="names">
						<a href={'/@' + profile.username}>{profile.name}</a>
						<span>@{profile.username}{profile === current ? ' · account' : ''}</span>
					</div>
					{#if profile.unread > 0}
						<span class="badge" title="Unread notifications">{profile.unread}</span>
					{/if}
					<div class="actions">
						{#if profile.active}
							<span class="using">in use</span>
						{:else}
							<form method="POST" action="?/switch">
								<input type="hidden" name="id" value={profile.id} />
								<input type="hidden" name="redirectTo" value={page.url.pathname} />
								<button class="btn" type="submit">Switch</button>
							</form>
						{/if}
						{#if profile !== current}
							<form method="POST" action="?/delete" on:submit={confirmDelete(profile)}>
								<input type="hidden" name="id" value={profile.id} />
								<button class="btn btn-red" type="submit">Delete</button>
							</form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		{#if canCreate}
			<form method="POST" action="?/create" class="create">
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
				<button class="btn" type="submit">Create and switch</button>
			</form>
		{:else}
			<p class="hint">You reached the limit of {data.maxIdentities} identities.</p>
		{/if}
	</section>
{/if}

<section>
	<h2>Other accounts</h2>
	{#if others.length > 0}
		<ul class="profiles">
			{#each others as account (account.id)}
				<li>
					<Avatar user={account} size={40} />
					<div class="names">
						<a href={'/@' + account.username}>{account.name}</a>
						<span>
							@{account.username}
							{#if account.identities.length > 0}
								· {account.identities.length}
								{account.identities.length === 1 ? 'identity' : 'identities'}
							{/if}
						</span>
					</div>
					{#if account.unread + account.identities.reduce((n, i) => n + i.unread, 0) > 0}
						<span class="badge" title="Unread notifications">
							{account.unread + account.identities.reduce((n, i) => n + i.unread, 0)}
						</span>
					{/if}
					<div class="actions">
						<form method="POST" action="?/switch">
							<input type="hidden" name="id" value={account.id} />
							<input type="hidden" name="redirectTo" value="/accounts" />
							<button class="btn" type="submit">Switch</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">No other accounts are signed in on this browser.</p>
	{/if}
	<div class="footer">
		<a class="btn" href="/login">Sign in to another account</a>
		<a class="btn btn-red" href="/logout">Log out</a>
	</div>
</section>

<style lang="scss">
	@import 'src/variables';

	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 40px;
	}

	.hint {
		font-size: 0.85em;
		color: $color6;
	}

	.error {
		background-color: $color4;
		padding: 5px;
		border-radius: 5px;
		margin-bottom: 20px;
	}

	.profiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;

		li {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 8px;
			border: 1px solid $color7;
			border-radius: 6px;

			&.active {
				border-color: $color1;
			}
		}

		.names {
			display: flex;
			flex-direction: column;
			min-width: 0;
			flex: 1;

			a {
				color: $color3;
				font-weight: 700;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			span {
				font-size: 0.8em;
				color: $color6;
			}
		}

		.actions {
			display: flex;
			gap: 6px;
			align-items: center;
		}

		.using {
			font-size: 0.8em;
			color: $color1;
		}
	}

	.badge {
		background-color: $color1;
		color: $color2;
		border-radius: 100px;
		padding: 0 8px;
		font-size: 0.8em;
		font-weight: 700;
	}

	.create {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 10px;

		input {
			width: calc(100% - 20px);
		}

		.btn {
			align-self: flex-start;
		}
	}

	.footer {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
