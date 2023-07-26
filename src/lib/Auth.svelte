<script lang="ts">
	import { user } from '$lib/store';
</script>

<div class="auth">
	{#if $user}
		<p>{$user.username}</p>
		<p><a href="/logout">logout</a></p>
	{:else}
		<p><a href="/login">login</a></p>
	{/if}
</div>

<style lang="scss">
	.auth {
		display: flex;
		gap: 20px;
		justify-content: flex-end;
		padding: 20px;
		background-color: rgb(32, 31, 31);
	}
</style>
