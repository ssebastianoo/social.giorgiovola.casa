<script lang="ts">
	import Post from '$lib/components/Post.svelte';
    import type { PageData } from './$types';
    
    export let data: PageData;
</script>

<main>
    <Post post={data.post} />
</main>
