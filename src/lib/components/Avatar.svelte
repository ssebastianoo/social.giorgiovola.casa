<script lang="ts">
	import type { User } from '$lib/types';

	export let user: Pick<User, 'username' | 'name' | 'avatar'>;
	export let size: number;
	export let clickable: boolean = true;
</script>

<div class="avatar">
	{#if clickable}
		<a class="img-url" href={'/@' + user.username}>
			<img
				src={user.avatar || `https://source.boringavatars.com/beam/${size}/${user.username}`}
				alt={user.name + "'s avatar"}
				width={size}
				height={size}
			/>
		</a>
	{:else}
		<img
			src={user.avatar || `https://source.boringavatars.com/beam/${size}/${user.username}`}
			alt={user.name + "'s avatar"}
			width={size}
			height={size}
		/>
	{/if}
</div>

<style lang="scss">
	.avatar {
		display: flex;

		img {
			border-radius: 50%;
			object-fit: cover;
		}
	}
	.img-url {
		display: flex;

		img {
			border-radius: 50%;
			object-fit: cover;
		}
	}
</style>
