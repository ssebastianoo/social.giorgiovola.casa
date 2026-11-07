<script lang="ts">
	let { notifications, messages }: { notifications: number; messages: number } = $props();

	const pill = 'flex shrink-0 items-center gap-[3px] rounded-full px-[7px] text-[0.75em] font-bold';
</script>

<!-- notifications are a filled pill, messages an outlined one with the envelope of the header -->
{#if notifications > 0}
	<span class="{pill} bg-accent text-background" title="Unread notifications">{notifications}</span>
{/if}
{#if messages > 0}
	<span class="{pill} border border-accent text-accent" title="Unread messages">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			height="0.9em"
			fill="currentColor"
			viewBox="0 0 512 512"
			aria-hidden="true"
			><path
				d="M64 112c-8.8 0-16 7.2-16 16v22.1L220.5 291.7c20.7 17 50.4 17 71.1 0L464 150.1V128c0-8.8-7.2-16-16-16H64zM48 212.2V384c0 8.8 7.2 16 16 16H448c8.8 0 16-7.2 16-16V212.2L322 328.8c-38.4 31.5-93.7 31.5-132 0L48 212.2zM0 128C0 92.7 28.7 64 64 64H448c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128z"
			/></svg
		>{messages}
	</span>
{/if}
