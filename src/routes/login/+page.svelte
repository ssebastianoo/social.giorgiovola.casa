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

<div class="mb-2.5 rounded-[5px] bg-black/70 p-2 text-[0.8rem]">
	<p>New here? <a href="/register">Register!</a></p>
</div>
<form method="POST" class="flex flex-col gap-5">
	<input type="text" class="input" name="username" placeholder="Username or Email" required />
	<input type="password" class="input" name="password" placeholder="Password" required />
	<input
		class="mt-2.5 cursor-pointer rounded-[5px] border border-foreground p-2.5 text-center outline-none hover:bg-black/70"
		type="submit"
		value="Login"
	/>
</form>
