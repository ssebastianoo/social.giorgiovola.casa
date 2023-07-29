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

<div class="register">
	<p>New here? <a href="/register">Register!</a></p>
</div>
<form method="POST" class="login">
	<input type="text" class="input" name="username" placeholder="Username or Email" required />
	<input type="password" class="input" name="password" placeholder="Password" required />
	<input type="submit" value="Login" />
</form>

<style lang="scss">
	@import 'src/variables';

	.register {
		background-color: $color5;
		padding: 8px;
		border-radius: 5px;
		font-size: 0.8rem;
		margin-bottom: 10px;

		a {
			color: $color1;
		}
	}

	.login {
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
