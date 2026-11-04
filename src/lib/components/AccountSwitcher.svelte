<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';
	import { user } from '#lib/store.js';
	import { getAvatar } from '#lib/utils.js';

	let open = false;
	let root: HTMLElement;

	const accounts = () => (page.data.accounts ?? []) as SwitcherAccount[];
	const otherUnread = () =>
		accounts()
			.flatMap(profilesOf)
			.filter((p) => !p.active)
			.reduce((n, p) => n + p.unread, 0);

	beforeNavigate(() => (open = false));

	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	const isActiveAccount = (a: SwitcherAccount) => a.active || a.identities.some((i) => i.active);
	const profilesOf = (a: SwitcherAccount): SwitcherProfile[] => [a, ...a.identities];
	const label = (p: SwitcherProfile) => `${p.name} (@${p.username})`;
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKeydown} />

{#if $user}
	<div class="switcher" bind:this={root}>
		<button
			class="trigger"
			aria-haspopup="menu"
			aria-expanded={open}
			title="Switch account"
			on:click={() => (open = !open)}
		>
			<img src={getAvatar($user, 50)} alt={$user.username + "'s avatar"} height="50" width="50" />
			{#if otherUnread() > 0}
				<span class="dot" title="Unread notifications on your other profiles"></span>
			{/if}
		</button>

		{#if open}
			<div class="menu" role="menu">
				<a class="current" href={'/@' + $user.username} role="menuitem">
					<img src={getAvatar($user, 40)} alt="" width="40" height="40" />
					<div class="names">
						<b>{$user.name}</b>
						<span>@{$user.username}{$user.owner_id ? ' · identity' : ''}</span>
					</div>
				</a>

				{#each accounts() as account (account.id)}
					{#if !isActiveAccount(account) || profilesOf(account).some((p) => !p.active)}
						<div class="group">
							<p class="group-title">
								{isActiveAccount(account) ? 'Switch profile' : 'Signed in as @' + account.username}
							</p>
							{#each profilesOf(account) as profile (profile.id)}
								{#if !profile.active}
									<form method="POST" action="/accounts?/switch">
										<input type="hidden" name="id" value={profile.id} />
										<input type="hidden" name="redirectTo" value={page.url.pathname} />
										<button class="profile" type="submit" role="menuitem" title={label(profile)}>
											<img src={getAvatar(profile, 28)} alt="" width="28" height="28" />
											<span class="names">
												<span class="name">{profile.name}</span>
												<span>@{profile.username}</span>
											</span>
											{#if profile.unread > 0}
												<span class="badge">{profile.unread}</span>
											{/if}
										</button>
									</form>
								{/if}
							{/each}
						</div>
					{/if}
				{/each}

				<div class="group links">
					<a href="/accounts" role="menuitem">+ New identity / manage</a>
					<a href="/login" role="menuitem">+ Sign in to another account</a>
					<a href="/logout" role="menuitem" class="logout">Log out</a>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	@import 'src/variables.scss';

	.switcher {
		position: relative;
	}

	.trigger {
		all: unset;
		cursor: pointer;
		display: flex;
		position: relative;
		border-radius: 50%;

		&:focus-visible {
			outline: 2px solid $color1;
			outline-offset: 2px;
		}

		img {
			object-fit: cover;
			border-radius: 50%;
		}

		.dot {
			position: absolute;
			top: 0;
			right: 0;
			width: 12px;
			height: 12px;
			border-radius: 50%;
			background-color: $color1;
			border: 2px solid $color2;
		}
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 10px);
		width: 270px;
		max-width: calc(100vw - 40px);
		max-height: calc(var(--fh, 100vh) - 100px);
		overflow-y: auto;
		background-color: rgba($color: $color2, $alpha: 0.95);
		border: 1px solid $color1;
		border-radius: 6px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;

		img {
			object-fit: cover;
			border-radius: 50%;
			flex-shrink: 0;
		}
	}

	.names {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		text-align: left;

		b,
		.name {
			color: $color3;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		span {
			font-size: 0.8em;
			color: $color6;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.name {
			font-size: 0.9em;
		}
	}

	.current {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px;
		border-radius: 4px;

		&:hover {
			text-decoration: none;
			background-color: rgba(255, 255, 255, 0.05);
		}
	}

	.group {
		border-top: 1px solid $color7;
		padding-top: 4px;
		display: flex;
		flex-direction: column;
	}

	.group-title {
		font-size: 0.75em;
		color: $color6;
		padding: 2px 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile {
		all: unset;
		box-sizing: border-box;
		cursor: pointer;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 6px;
		border-radius: 4px;

		&:hover,
		&:focus-visible {
			background-color: rgba(255, 255, 255, 0.05);
		}
	}

	.badge {
		background-color: $color1;
		color: $color2;
		border-radius: 100px;
		padding: 0 7px;
		font-size: 0.75em;
		font-weight: 700;
	}

	.links a {
		padding: 6px;
		font-size: 0.9em;
		border-radius: 4px;

		&:hover {
			text-decoration: none;
			background-color: rgba(255, 255, 255, 0.05);
		}

		&.logout {
			color: $color4;
		}
	}
</style>
