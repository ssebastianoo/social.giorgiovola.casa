<script lang="ts">
	import type { User } from '#lib/types.js';
	import { getAvatar } from '#lib/utils.js';

	export let user: Pick<User, 'username' | 'name' | 'avatar'>;
	export let size: number;
	export let clickable: boolean = true;

	// preflight's max-width and height: auto would otherwise let avatars shrink or lose their ratio
	const imgClass = 'aspect-square max-w-none self-start rounded-full object-cover';
</script>

<div class="flex">
	{#if clickable}
		<a class="flex" href={'/@' + user.username}>
			<img
				class={imgClass}
				src={getAvatar(user, size)}
				alt={user.name + "'s avatar"}
				width={size}
				height={size}
			/>
		</a>
	{:else}
		<img
			class={imgClass}
			src={getAvatar(user, size)}
			alt={user.name + "'s avatar"}
			width={size}
			height={size}
		/>
	{/if}
</div>
