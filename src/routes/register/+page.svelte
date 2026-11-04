<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount } from 'svelte';

	export let form: ActionData;
	export let data: PageData;

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
	<div>
		{#each form.errors as error}
			<p>{error}</p>
		{/each}
	</div>
{/if}

{#if data.registrationOpen}
	<form method="POST" class="flex flex-col gap-5">
		<input
			class="input"
			type="password"
			name="signupPassword"
			placeholder="Signup password"
			autocomplete="off"
			required
		/>
		<input class="input" type="email" name="email" placeholder="Email" maxlength="254" required />
		<input
			class="input"
			type="text"
			name="fullName"
			placeholder="Full name"
			maxlength="64"
			required
		/>
		<input
			class="input"
			type="text"
			name="username"
			placeholder="Username (a-z, 0-9, _)"
			pattern={'[a-zA-Z0-9_]{1,32}'}
			maxlength="32"
			required
		/>
		<input
			class="input"
			type="password"
			name="password"
			placeholder="Password (min. 8 characters)"
			minlength="8"
			maxlength="256"
			autocomplete="new-password"
			required
		/>
		<input
			class="mt-2.5 cursor-pointer rounded-[5px] border border-foreground p-2.5 text-center outline-none hover:bg-black/70"
			type="submit"
			value="Register"
		/>
	</form>
{:else}
	<p>Registration is currently closed.</p>
{/if}
