<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import { installState, promptInstall } from '#lib/install.svelte.js';

	// the install state only exists in the browser: render it after hydration
	let ready = $state(false);
	onMount(() => (ready = true));

	const guides = [
		{
			name: 'iPhone and iPad (Safari)',
			steps: ['Tap the share button', 'Choose "Add to Home Screen"', 'Tap "Add"']
		},
		{
			name: 'Android (Chrome, Edge, Firefox)',
			steps: [
				'Open the browser menu (⋮)',
				'Choose "Install app" or "Add to Home screen"',
				'Confirm'
			]
		},
		{
			name: 'Desktop (Chrome, Edge, Brave)',
			steps: [
				'Click the install icon at the right end of the address bar, or open the browser menu',
				'Choose "Install Social Giorgiovola Casa"',
				'Confirm'
			]
		}
	];
</script>

<h1>Install app</h1>
<p class="mt-2.5 text-muted">
	Install the app on this device for its own window or home screen icon, an unread badge and push
	notifications.
</p>

{#if ready}
	<div class="mt-5 flex items-center justify-between gap-2.5 rounded-[10px] bg-black/70 p-2.5">
		{#if installState.standalone}
			<p>The app is already installed on this device.</p>
		{:else if installState.event}
			<p>Ready to install.</p>
			<Button variant="primary" onclick={promptInstall}>Install</Button>
		{:else}
			<p>
				{installState.ios
					? 'Safari has no install button: follow the steps for iPhone and iPad below.'
					: "This browser didn't offer a one click install, follow the steps below."}
			</p>
		{/if}
	</div>
{/if}

<div class="mt-5 flex flex-col gap-2.5">
	{#each guides as guide (guide.name)}
		<section class="rounded-[10px] bg-black/70 p-2.5">
			<h2 class="mb-[5px] font-bold">{guide.name}</h2>
			<ol class="flex list-decimal flex-col gap-[5px] pl-5">
				{#each guide.steps as step (step)}
					<li>{step}</li>
				{/each}
			</ol>
		</section>
	{/each}
</div>
<p class="mt-2.5 text-[0.85em] text-muted">
	Desktop Firefox can't install web apps. Once installed, turn on push notifications from the
	<a href="/notifications">notifications</a> page.
</p>
