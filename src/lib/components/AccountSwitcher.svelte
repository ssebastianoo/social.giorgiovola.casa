<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import type { SwitcherAccount, SwitcherProfile } from '#lib/types.js';
	import { user } from '#lib/store.js';
	import { getAvatar } from '#lib/utils.js';
	import UnreadBadges from './UnreadBadges.svelte';

	const dotClass =
		'absolute top-0 right-0 size-4 rounded-full border-2 border-background bg-accent';
	const linkClass = 'rounded-sm p-1.5 text-[0.9em] hover:bg-white/5 hover:no-underline';

	let open = false;
	let root: HTMLElement;

	const accounts = () => (page.data.accounts ?? []) as SwitcherAccount[];
	const otherUnread = () =>
		accounts()
			.flatMap(profilesOf)
			.filter((p) => !p.active)
			.reduce((n, p) => n + p.unread + p.unreadMessages, 0);

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
	<div class="relative" bind:this={root}>
		<button
			class="relative flex cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			aria-haspopup="menu"
			aria-expanded={open}
			title="Switch account"
			on:click={() => (open = !open)}
		>
			<img
				class="size-12.5 max-w-none rounded-full object-cover"
				src={getAvatar($user, 50)}
				alt={$user.username + "'s avatar"}
				height="50"
				width="50"
			/>
			{#if otherUnread() > 0}
				<!-- prettier-ignore -->
				<span class={dotClass} title="Unread notifications or messages on your other profiles"></span>
			{/if}
		</button>

		{#if open}
			<div
				class="absolute top-[calc(100%+10px)] right-0 flex max-h-[calc(var(--fh,100vh)-86px)] w-71 max-w-[calc(100vw-26px)] flex-col gap-1 overflow-y-auto rounded-md border border-accent bg-background/95 p-1.5"
				role="menu"
			>
				<a
					class="flex items-center gap-2.5 rounded-sm p-1.5 hover:bg-white/5 hover:no-underline"
					href={'/@' + $user.username}
					role="menuitem"
				>
					<img
						class="size-10 max-w-none shrink-0 rounded-full object-cover"
						src={getAvatar($user, 40)}
						alt=""
						width="40"
						height="40"
					/>
					<div class="flex min-w-0 flex-1 flex-col text-left">
						<b class="truncate text-foreground">{$user.name}</b>
						<span class="truncate text-[0.8em] text-muted"
							>@{$user.username}{$user.owner_id ? ' · identity' : ''}</span
						>
					</div>
				</a>

				{#each accounts() as account (account.id)}
					{#if !isActiveAccount(account) || profilesOf(account).some((p) => !p.active)}
						<div class="flex flex-col border-t border-line pt-1">
							<p class="truncate px-1.5 py-0.5 text-[0.75em] text-muted">
								{isActiveAccount(account) ? 'Switch profile' : 'Signed in as @' + account.username}
							</p>
							{#each profilesOf(account) as profile (profile.id)}
								{#if !profile.active}
									<form method="POST" action="/accounts?/switch">
										<input type="hidden" name="id" value={profile.id} />
										<input type="hidden" name="redirectTo" value={page.url.pathname} />
										<button
											class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-[5px] outline-none hover:bg-white/5 focus-visible:bg-white/5"
											type="submit"
											role="menuitem"
											title={label(profile)}
										>
											<img
												class="size-7 max-w-none shrink-0 rounded-full object-cover"
												src={getAvatar(profile, 28)}
												alt=""
												width="28"
												height="28"
											/>
											<span class="flex min-w-0 flex-1 flex-col text-left">
												<span class="truncate text-[0.9em] text-foreground">{profile.name}</span>
												<span class="truncate text-[0.8em] text-muted"
													>@{profile.username}{profile.sharedBy ? ' · shared' : ''}</span
												>
											</span>
											<UnreadBadges
												notifications={profile.unread}
												messages={profile.unreadMessages}
											/>
										</button>
									</form>
								{/if}
							{/each}
						</div>
					{/if}
				{/each}

				<div class="flex flex-col border-t border-line pt-1">
					{#if page.data.role && page.data.role !== 'user'}
						<a class={linkClass} href="/admin" role="menuitem">Moderation</a>
					{/if}
					<a class={linkClass} href="/accounts" role="menuitem">+ New identity / manage</a>
					<a class={linkClass} href="/settings" role="menuitem">Settings</a>
					<a class={linkClass} href="/install" role="menuitem">Install app</a>
					<a class={linkClass} href="/login" role="menuitem">+ Sign in to another account</a>
					<a class="{linkClass} text-danger" href="/logout" role="menuitem">Log out</a>
				</div>
			</div>
		{/if}
	</div>
{/if}
