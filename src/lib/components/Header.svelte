<script lang="ts">
	import { user } from '$lib/store';
</script>

<header>
	<a href="/">
		<img src="/Logo.png" alt="Logo" height="50px" />
	</a>
	<div class="auth">
		{#if $user}
			<a href={'/@' + $user.username}>
				<img
					src={'https://source.boringavatars.com/beam/50/' + $user.username}
					alt={$user.username + "'s avatar"}
					height="50px"
				/>
			</a>
		{:else}
			<p><a href="/login">login</a></p>
		{/if}
	</div>
</header>

<style lang="scss">
	@import 'src/variables.scss';

	header {
		position: fixed;
		top: 0;
		left: 0;
		width: calc(100% - 40px);
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 15px 20px;
		background-color: rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(3px);
		z-index: 999;

		a {
			display: flex;
			align-items: center;
		}

		.auth {
			display: flex;
			gap: 20px;
		}

		a {
			color: unset;
		}
	}
</style>
