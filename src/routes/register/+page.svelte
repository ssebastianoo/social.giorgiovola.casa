<script lang="ts">
	import type { ActionData } from './$types';

	export let form: ActionData;
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
	<input value="ciao@email.com" type="email" name="email" placeholder="Email" required />
	<input value="Uomo ciao" type="text" name="fullName" placeholder="Full name" required />
	<input value="ciao" type="text" name="username" placeholder="username" required />
	<input value="giorgio" type="password" name="password" placeholder="Password" required />
	<input type="submit" value="Register" />
</form>
