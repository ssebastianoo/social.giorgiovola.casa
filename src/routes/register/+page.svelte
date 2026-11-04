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
	<div class="errors">
		{#each form.errors as error}
			<p>{error}</p>
		{/each}
	</div>
{/if}

{#if data.registrationOpen}
	<form method="POST" class="register">
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
		<input type="submit" value="Register" />
	</form>
{:else}
	<p>Registration is currently closed.</p>
{/if}

<style lang="scss">
	@import 'src/variables';

	.register {
		display: flex;
		flex-direction: column;
		gap: 20px;

		input {
			width: calc(100% - 20px);
		}

		input[type='submit'] {
			all: unset;
			border: 1px solid $color3;
			padding: 10px;
			border-radius: 5px;
			cursor: pointer;
			text-align: center;
			margin-top: 10px;

			&:hover {
				background-color: $color5;
			}
		}
	}
</style>
