<script lang="ts">
	import { page } from '$app/state';
	import type { SwitcherAccount } from '#lib/types.js';

	const accounts = () => (page.data.accounts ?? []) as SwitcherAccount[];
	const current = () => accounts().find((a) => a.active || a.identities.some((i) => i.active));
</script>

<div class="logout">
	{#each [current()].filter((a) => !!a) as account}
		<p>
			Do you want to log out of <b>@{account.username}</b>{#if account.identities.length > 0}
				&nbsp;and its identities{/if}?
		</p>
		<div class="buttons">
			<form method="POST" action="?/current">
				<button class="btn" type="submit">Log out @{account.username}</button>
			</form>
			{#if accounts().length > 1}
				<form method="POST" action="?/all">
					<button class="btn btn-red" type="submit">Log out of all accounts</button>
				</form>
			{/if}
		</div>
	{:else}
		<p>You are not logged in.</p>
	{/each}
</div>

<style>
	.logout {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}

	.buttons {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
