<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { ActionData, PageData } from './$types';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		WebAuthnError,
		browserSupportsWebAuthn,
		sendSignal,
		startRegistration
	} from '@simplewebauthn/browser';
	import { onMount } from 'svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const sectionClass = 'mb-10 flex flex-col gap-3';
	const hintClass = 'text-[0.85em] text-muted';

	let supported = $state(true);
	let busy = $state(false);
	let error = $state('');
	let newName = $state('');
	let renaming = $state<string | null>(null);

	const canAdd = $derived(data.passkeys.length < data.maxPasskeys);

	onMount(() => {
		supported = browserSupportsWebAuthn();
	});

	// tells the password manager which passkeys are still accepted, so deleted ones go away there too
	$effect(() => {
		if (!supported) return;
		sendSignal({
			signalName: 'allAcceptedCredentials',
			rpID: data.rpID,
			userID: data.userHandle,
			allAcceptedCredentialIDs: data.passkeys.map((p) => p.id)
		}).catch(() => null);
	});

	const date = (d: Date | string) =>
		new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

	async function post(url: string, body?: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(json.error ?? 'Something went wrong, try again.');
		return json;
	}

	async function addPasskey(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const optionsJSON = await post('/api/passkeys/register/options');
			let response;
			try {
				response = await startRegistration({ optionsJSON });
			} catch (err) {
				if (
					err instanceof WebAuthnError &&
					err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
				)
					throw new Error('This device already has a passkey for your account.');
				// cancelled by the user, or timed out: nothing to report
				if (err instanceof Error && err.name === 'NotAllowedError') return;
				throw err;
			}
			await post('/api/passkeys/register', { name: newName, response });
			newName = '';
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong, try again.';
		} finally {
			busy = false;
		}
	}

	// enhance submits even when onsubmit calls preventDefault, so the confirm goes through cancel()
	const confirmDelete =
		(name: string): SubmitFunction =>
		({ cancel }) => {
			if (!confirm(`Delete the passkey "${name}"? You won't be able to sign in with it anymore.`))
				cancel();
		};
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

{#if form?.error || error}
	<p class="mb-5 rounded-[5px] bg-danger p-[5px]">{form?.error || error}</p>
{/if}

<section class={sectionClass}>
	<h2>Passkeys</h2>
	<p class={hintClass}>
		Passkeys let you sign in to <b>@{data.account}</b> with your fingerprint, face, screen lock or a
		security key instead of typing your password. They are optional: your password keeps working either
		way.
	</p>

	{#if data.passkeys.length > 0}
		<ul class="flex flex-col gap-2">
			{#each data.passkeys as passkey (passkey.id)}
				<li class="flex items-center gap-2.5 rounded-md border border-line p-2">
					{#if renaming === passkey.id}
						<form
							method="POST"
							action="?/renamePasskey"
							class="flex flex-1 items-center gap-1.5"
							use:enhance={() =>
								async ({ update }) => {
									await update();
									renaming = null;
								}}
						>
							<input type="hidden" name="id" value={passkey.id} />
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="input flex-1"
								type="text"
								name="name"
								value={passkey.name}
								maxlength="64"
								aria-label="Passkey name"
								autofocus
							/>
							<Button type="submit">Save</Button>
							<Button type="button" onclick={() => (renaming = null)}>Cancel</Button>
						</form>
					{:else}
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-bold">{passkey.name}</span>
							<span class="text-[0.8em] text-muted">
								Added {date(passkey.created_at)} · {passkey.last_used_at
									? `last used ${date(passkey.last_used_at)}`
									: 'never used'}{passkey.backed_up ? ' · synced' : ''}
							</span>
						</div>
						<div class="flex items-center gap-1.5">
							<Button type="button" onclick={() => (renaming = passkey.id)}>Rename</Button>
							<form
								method="POST"
								action="?/deletePasskey"
								use:enhance={confirmDelete(passkey.name)}
							>
								<input type="hidden" name="id" value={passkey.id} />
								<Button variant="danger" type="submit">Delete</Button>
							</form>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class={hintClass}>You have no passkeys yet.</p>
	{/if}

	{#if !supported}
		<p class={hintClass}>This browser doesn't support passkeys.</p>
	{:else if canAdd}
		<form class="mt-2.5 flex flex-col gap-3" onsubmit={addPasskey}>
			<h3>Add a passkey</h3>
			<input
				class="input"
				type="text"
				bind:value={newName}
				placeholder="Name (e.g. My phone)"
				maxlength="64"
				aria-label="Passkey name"
			/>
			<Button class="self-start" type="submit" disabled={busy}>
				{busy ? 'Waiting for your device…' : 'Add passkey'}
			</Button>
		</form>
	{:else}
		<p class={hintClass}>You reached the limit of {data.maxPasskeys} passkeys.</p>
	{/if}
</section>
