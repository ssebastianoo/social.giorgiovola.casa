<script lang="ts">
	import type { PageData } from './$types';
	import Posts from '$lib/Posts.svelte';

	export let data: PageData;
</script>

<div class="user">
	<h2>{data.user.name}</h2>
	<p>@{data.user.username}</p>
</div>

<Posts posts={data.posts} />

<style lang="scss">
</style>
