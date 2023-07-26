<script lang="ts">
	import type { ActionData } from './$types';
	import { onMount } from 'svelte';

	export let form: ActionData;

	onMount(() => {
		if (form?.user) {
			location.href = '/';
		}
	});
</script>

{#if form?.user}
	<p>{form.user.username}</p>
{/if}

{#if form?.errors}
	<div class="errors">
		{#each form.errors as error}
			<p>{error}</p>
		{/each}
	</div>
{/if}

<form method="POST">
	<input type="email" name="email" placeholder="Email" required />
	<input type="text" name="fullName" placeholder="Full name" required />
	<input type="text" name="username" placeholder="username" required />
	<input type="password" name="password" placeholder="Password" required />
	<input type="submit" value="Register" />
</form>
