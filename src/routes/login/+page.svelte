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
	<p>Logged in as {form.user.username}</p>
{:else if form?.error}
	<p>{form.error}</p>
{/if}

<p>new? <a href="/register">register</a></p>
<form method="POST">
	<input type="text" name="username" placeholder="Username or Email" required />
	<input type="password" name="password" placeholder="Password" required />
	<input type="submit" value="Login" />
</form>
