<script lang="ts">
	import { user } from '$lib/store';
</script>

<header>
	<p><a href="/">Home</a></p>
	<div class="auth">
		{#if $user}
			<p><a href={'/@' + $user.username}>{$user.username}</a></p>
			<p><a href="/logout">logout</a></p>
		{:else}
			<p><a href="/login">login</a></p>
		{/if}
	</div>
</header>

<style lang="scss">
	header {
		display: flex;
		justify-content: space-between;
		padding: 20px;
		background-color: rgb(32, 31, 31);

		.auth {
			display: flex;
			gap: 20px;
		}

		a {
			color: unset;
		}
	}
</style>
