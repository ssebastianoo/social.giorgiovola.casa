<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { ActionData } from './$types';
	import { onMount } from 'svelte';
	import {
		WebAuthnAbortService,
		browserSupportsWebAuthn,
		browserSupportsWebAuthnAutofill,
		sendSignal,
		startAuthentication
	} from '@simplewebauthn/browser';

	let { form }: { form: ActionData } = $props();

	let passkeys = $state(false);
	let passkeyBusy = $state(false);
	let passkeyError = $state('');

	onMount(() => {
		if (form?.user) {
			location.href = '/';
			return;
		}
		passkeys = browserSupportsWebAuthn();
		// offer saved passkeys in the username field's autofill, without a click
		browserSupportsWebAuthnAutofill().then((ok) => {
			if (ok) signInWithPasskey(true);
		});
		return () => WebAuthnAbortService.cancelCeremony();
	});

	async function post(url: string, body?: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		return { ok: res.ok, json: await res.json().catch(() => ({})) };
	}

	async function signInWithPasskey(autofill = false) {
		if (!autofill) {
			passkeyBusy = true;
			passkeyError = '';
		}
		try {
			const options = await post('/api/passkeys/login/options');
			if (!options.ok) throw new Error(options.json.error);

			let response;
			try {
				response = await startAuthentication({
					optionsJSON: options.json,
					useBrowserAutofill: autofill
				});
			} catch (err) {
				// cancelled, timed out, or replaced by another ceremony (the button aborts the autofill one)
				if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError'))
					return;
				throw err;
			}

			passkeyBusy = true;
			const result = await post('/api/passkeys/login', response);
			if (!result.ok) {
				if (result.json.unknown && options.json.rpId)
					sendSignal({
						signalName: 'unknownCredential',
						rpID: options.json.rpId,
						credentialID: response.id
					}).catch(() => null);
				throw new Error(result.json.error);
			}
			location.href = '/';
		} catch (err) {
			passkeyError =
				err instanceof Error && err.message ? err.message : 'Something went wrong, try again.';
			passkeyBusy = false;
		}
	}
</script>

{#if form?.user}
	<p>Logged in as {form.user.username}</p>
{:else if form?.error || passkeyError}
	<p>{form?.error || passkeyError}</p>
{/if}

<div class="mb-2.5 rounded-[5px] bg-black/70 p-2 text-[0.8rem]">
	<p>New here? <a href="/register">Register!</a></p>
</div>
<form method="POST" class="flex flex-col gap-5">
	<input
		type="text"
		class="input"
		name="username"
		placeholder="Username or Email"
		autocomplete="username webauthn"
		required
	/>
	<input
		type="password"
		class="input"
		name="password"
		placeholder="Password"
		autocomplete="current-password"
		required
	/>
	<Button class="mt-2.5" size="lg" type="submit">Login</Button>
</form>
{#if passkeys}
	<Button class="mt-5 w-full" size="lg" disabled={passkeyBusy} onclick={() => signInWithPasskey()}>
		{passkeyBusy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
	</Button>
{/if}
