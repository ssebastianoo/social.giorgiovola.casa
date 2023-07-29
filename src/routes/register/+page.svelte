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

<form method="POST" class="register">
	<input class="input" type="email" name="email" placeholder="Email" required />
	<input class="input" type="text" name="fullName" placeholder="Full name" required />
	<input class="input" type="text" name="username" placeholder="Username" required />
	<input class="input" type="password" name="password" placeholder="Password" required />
	<input type="submit" value="Register" />
</form>

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
