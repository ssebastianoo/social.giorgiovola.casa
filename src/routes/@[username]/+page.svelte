<script lang="ts">
	import type { PageData } from './$types';
	import Posts from '$lib/Posts.svelte';

	export let data: PageData;
</script>

<div class="user">
	<img src={'https://source.boringavatars.com/beam/60/' + data.user.username} alt="" />
	<div class="content">
		<h2>{data.user.name}</h2>
		<p>@{data.user.username}</p>
	</div>
</div>

<Posts posts={data.posts} />

<style lang="scss">
	.user {
		display: flex;
		margin-bottom: 20px;
		gap: 10px;
	}
</style>
