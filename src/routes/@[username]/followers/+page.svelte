<script lang="ts">
	import FollowList from '#lib/components/FollowList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<FollowList {data} />
