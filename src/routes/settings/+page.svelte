<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import { page } from '$app/state';
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
	const canAddBot = $derived(data.bots.length < data.maxBots);
	// only in the response that created it: the token is never shown again
	const botToken = $derived(form?.botToken ?? null);
	// only some failures of createBot echo the fields back
	const botValues = $derived(
		(form as { botValues?: { name: string; username: string } } | null)?.botValues ?? null
	);
	let copied = $state(false);
	// the bot whose profile form is open
	let editingBot = $state<number | null>(null);

	// keeps the form open when the server refuses the changes, so they can be fixed
	const saveBot: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') editingBot = null;
		};

	async function copyToken(token: string) {
		await navigator.clipboard.writeText(token);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

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

	const confirmAction =
		(message: string): SubmitFunction =>
		({ cancel }) => {
			if (!confirm(message)) cancel();
		};

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

<section class={sectionClass}>
	<h2>OAuth</h2>
	<p class={hintClass}>
		Bots are profiles you drive from your own code through the bot API: they can post, reply, like,
		follow people and track their mentions and the posts of who they follow. Every bot has a secret
		token; send it as <code>Authorization: Bearer &lt;token&gt;</code>. The full API guide, written
		so you can hand it to an AI agent, is at <a href="/api.txt">/api.txt</a>.
	</p>

	{#if botToken}
		<div class="flex flex-col gap-2.5 rounded-[10px] bg-black/70 p-2.5">
			<p>
				Token for <b>@{botToken.username}</b>. Copy it now: you won't be able to see it again.
			</p>
			<code class="break-all select-all">{botToken.token}</code>
			<div class="flex items-center gap-2.5">
				<Button size="sm" onclick={() => copyToken(botToken.token)}>
					{copied ? 'Copied' : 'Copy token'}
				</Button>
			</div>
			<p class={hintClass}>
				Try it: <code class="break-all"
					>curl -H "Authorization: Bearer {botToken.token}" {page.url.origin}/api/bot/me</code
				>
			</p>
		</div>
	{/if}

	{#if data.bots.length > 0}
		<ul class="flex flex-col gap-2">
			{#each data.bots as bot (bot.id)}
				<li class="flex flex-col gap-2.5 rounded-md border border-line p-2">
					<div class="flex items-center gap-2.5">
						<Avatar size={45} user={bot} />
						<div class="flex min-w-0 flex-1 flex-col">
							<a class="truncate font-bold text-inherit" href="/@{bot.username}">
								{bot.name} <span class="opacity-80">@{bot.username}</span>
							</a>
							<span class="text-[0.8em] text-muted">
								Created {date(bot.created_at)} · {bot.last_used_at
									? `last used ${date(bot.last_used_at)}`
									: 'never used'}
							</span>
						</div>
						<div class="flex items-center gap-1.5">
							<Button
								onclick={() => (editingBot = editingBot === bot.id ? null : bot.id)}
								aria-expanded={editingBot === bot.id}
							>
								Edit
							</Button>
							<form
								method="POST"
								action="?/regenerateToken"
								use:enhance={confirmAction(
									`Regenerate the token of @${bot.username}? The current one stops working right away.`
								)}
							>
								<input type="hidden" name="id" value={bot.id} />
								<Button type="submit">New token</Button>
							</form>
							<form
								method="POST"
								action="?/deleteBot"
								use:enhance={confirmAction(
									`Delete @${bot.username} and all of its posts? This can't be undone.`
								)}
							>
								<input type="hidden" name="id" value={bot.id} />
								<Button variant="danger" type="submit">Delete</Button>
							</form>
						</div>
					</div>
					{#if editingBot === bot.id}
						<form
							class="flex flex-col gap-2.5"
							method="POST"
							action="?/editBot"
							enctype="multipart/form-data"
							use:enhance={saveBot}
						>
							<input type="hidden" name="id" value={bot.id} />
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-avatar-{bot.id}">Picture</label>
								<input
									class="border-b border-line outline-none file:mr-1 file:cursor-pointer file:rounded-sm file:border file:border-line file:px-1.5"
									id="bot-avatar-{bot.id}"
									name="avatar"
									type="file"
									accept="image/*"
								/>
							</div>
							{#if bot.avatar}
								<label class="flex items-center gap-1.5 text-[0.85em]">
									<input type="checkbox" name="removeAvatar" value="1" />
									Remove the current picture
								</label>
							{/if}
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-name-{bot.id}">Name</label>
								<input
									class="border-b border-line outline-none"
									id="bot-name-{bot.id}"
									name="name"
									type="text"
									maxlength="64"
									value={bot.name}
									required
								/>
							</div>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-username-{bot.id}">Username</label>
								<input
									class="border-b border-line outline-none"
									id="bot-username-{bot.id}"
									name="username"
									type="text"
									maxlength="32"
									value={bot.username}
									autocapitalize="none"
									autocomplete="off"
									required
								/>
							</div>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-bio-{bot.id}">Bio</label>
								<!-- prettier 2 would self-close it -->
								<!-- prettier-ignore -->
								<textarea
									class="resize-none border-b border-line outline-none"
									id="bot-bio-{bot.id}"
									name="bio"
									rows="3"
									maxlength="160"
									placeholder="What this bot does"
									value={bot.bio}
								></textarea>
							</div>
							<div class="flex flex-col">
								<label class="text-[0.8em] opacity-80" for="bot-website-{bot.id}">Website</label>
								<input
									class="border-b border-line outline-none"
									id="bot-website-{bot.id}"
									name="website"
									type="text"
									inputmode="url"
									maxlength="200"
									placeholder="github.com/you/your-bot"
									value={bot.website}
								/>
							</div>
							<div class="flex items-center gap-1.5">
								<Button type="submit">Save</Button>
								<Button onclick={() => (editingBot = null)}>Cancel</Button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class={hintClass}>You have no bots yet.</p>
	{/if}

	{#if canAddBot}
		<form class="mt-2.5 flex flex-col gap-3" method="POST" action="?/createBot" use:enhance>
			<h3>Create a bot</h3>
			<input
				class="input"
				type="text"
				name="name"
				placeholder="Display name"
				maxlength="64"
				value={botValues?.name ?? ''}
				required
			/>
			<input
				class="input"
				type="text"
				name="username"
				placeholder="Username (a-z, 0-9, _)"
				pattern={'[a-zA-Z0-9_]{1,32}'}
				maxlength="32"
				value={botValues?.username ?? ''}
				autocapitalize="none"
				autocomplete="off"
				required
			/>
			<Button class="self-start" type="submit">Create bot</Button>
		</form>
	{:else}
		<p class={hintClass}>You reached the limit of {data.maxBots} bots.</p>
	{/if}
</section>
