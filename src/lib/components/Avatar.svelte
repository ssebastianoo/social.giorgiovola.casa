<script lang="ts">
	import type { User } from '$lib/types';
	import { getAvatar } from '$lib/utils';

	export let user: Pick<User, 'username' | 'name' | 'avatar'>;
	export let size: number;
	export let clickable: boolean = true;
</script>

<div class="avatar">
	{#if clickable}
		<a class="img-url" href={'/@' + user.username}>
			<img src={getAvatar(user, size)} alt={user.name + "'s avatar"} width={size} height={size} />
		</a>
	{:else}
		<img src={getAvatar(user, size)} alt={user.name + "'s avatar"} width={size} height={size} />
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
