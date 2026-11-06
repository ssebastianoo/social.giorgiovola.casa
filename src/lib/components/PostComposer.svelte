<script lang="ts">
	import { onMount } from 'svelte';
	import type { Post, QuotedPost } from '#lib/types.js';
	import MentionInput from './MentionInput.svelte';
	import QuoteCard from './QuoteCard.svelte';

	type Props = {
		/** Set to reply to a post instead of creating a top level one. */
		replyTo?: number | null;
		/** Set to quote a post (a quote regiorg): it is shown under the input. */
		quoteOf?: QuotedPost | null;
		placeholder?: string;
		oncreated?: (post: Post) => void;
	};

	let {
		replyTo = null,
		quoteOf = null,
		placeholder = 'twitter sucks',
		oncreated
	}: Props = $props();

	const MAX_IMAGES = 5;
	const MAX_BYTES = 10 * 1024 * 1024;
	const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;

	type Attachment = { file: File; url: string };

	let content = $state('');
	let attachments: Attachment[] = $state([]);
	let error: string | null = $state(null);
	let sending = $state(false);
	let dragging = $state(false);
	let dragDepth = 0;
	let fileInput: HTMLInputElement | undefined = $state();
	let errorTimeout: ReturnType<typeof setTimeout>;

	function showError(message: string) {
		error = message;
		clearTimeout(errorTimeout);
		errorTimeout = setTimeout(() => (error = null), 4000);
	}

	function isImage(file: File) {
		return file.type.startsWith('image/') || (!file.type && IMAGE_EXT_RE.test(file.name));
	}

	function addFiles(files: Iterable<File>) {
		const added: Attachment[] = [];
		for (const file of files) {
			if (!isImage(file)) {
				showError(`${file.name || 'That file'} is not an image.`);
				continue;
			}
			if (file.size > MAX_BYTES) {
				showError(`${file.name || 'Image'} is too big, max size is 10mb.`);
				continue;
			}
			if (attachments.length + added.length >= MAX_IMAGES) {
				showError(`You can attach at most ${MAX_IMAGES} images.`);
				break;
			}
			added.push({ file, url: URL.createObjectURL(file) });
		}
		if (added.length) attachments = [...attachments, ...added];
	}

	function removeAttachment(attachment: Attachment) {
		URL.revokeObjectURL(attachment.url);
		attachments = attachments.filter((a) => a !== attachment);
	}

	function clearAttachments() {
		for (const a of attachments) URL.revokeObjectURL(a.url);
		attachments = [];
	}

	function onFilesSelected() {
		if (!fileInput) return;
		addFiles(Array.from(fileInput.files ?? []));
		// lets the same file be picked again after removing it
		fileInput.value = '';
	}

	function onPaste(e: ClipboardEvent) {
		const files = Array.from(e.clipboardData?.files ?? []);
		if (files.length === 0) return;
		e.preventDefault();
		addFiles(files);
	}

	// dropping works anywhere on the page: otherwise a slightly missed drop would make the
	// browser navigate away to the image
	const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

	onMount(() => {
		const onDragEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth++;
			dragging = true;
		};
		const onDragOver = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		};
		const onDragLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			dragDepth = Math.max(0, dragDepth - 1);
			if (dragDepth === 0) dragging = false;
		};
		const onDrop = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth = 0;
			dragging = false;
			addFiles(Array.from(e.dataTransfer?.files ?? []));
		};
		window.addEventListener('dragenter', onDragEnter);
		window.addEventListener('dragover', onDragOver);
		window.addEventListener('dragleave', onDragLeave);
		window.addEventListener('drop', onDrop);
		return () => {
			window.removeEventListener('dragenter', onDragEnter);
			window.removeEventListener('dragover', onDragOver);
			window.removeEventListener('dragleave', onDragLeave);
			window.removeEventListener('drop', onDrop);
			clearTimeout(errorTimeout);
			clearAttachments();
		};
	});

	async function submit() {
		if (sending || (!content.trim() && attachments.length === 0)) return;
		sending = true;
		try {
			const body = new FormData();
			body.set('content', content);
			if (replyTo !== null) body.set('reply_to', String(replyTo));
			if (quoteOf) body.set('quote_of', String(quoteOf.id));
			for (const { file } of attachments) body.append('images', file);

			const res = await fetch('/api/posts', { method: 'POST', body });
			if (res.ok) {
				const post: Post = await res.json();
				content = '';
				clearAttachments();
				oncreated?.(post);
			} else if (res.status === 400 || res.status === 403) {
				showError(await res.text());
			} else if (res.status === 413) {
				showError('Images are too big.');
			} else {
				showError('Something went wrong.');
			}
		} catch {
			showError('Something went wrong.');
		} finally {
			sending = false;
		}
	}
</script>

{#if dragging}
	<div
		class="pointer-events-none fixed inset-0 z-999 flex items-center justify-center bg-background/70 p-5 backdrop-blur-[2px]"
	>
		<div
			class="w-full max-w-[442px] rounded-md border-2 border-dashed border-accent p-10 text-center"
		>
			Drop images to attach
		</div>
	</div>
{/if}

{#if error}
	<div class="mb-5 rounded-[5px] bg-danger p-2.5">
		<p>{error}</p>
	</div>
{/if}

<form
	class="mb-5 flex flex-col gap-2.5"
	onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}
	onpaste={onPaste}
>
	<div class="flex">
		<MentionInput bind:value={content} required={attachments.length === 0} {placeholder} />
		<input
			bind:this={fileInput}
			onchange={onFilesSelected}
			type="file"
			accept="image/*"
			multiple
			hidden
		/>
		<button
			type="button"
			title="Attach images"
			aria-label="Attach images"
			disabled={attachments.length >= MAX_IMAGES}
			onclick={() => fileInput?.click()}
			class="flex cursor-pointer items-end border-b border-foreground p-2.5 outline-none disabled:cursor-default disabled:opacity-40"
			><svg
				xmlns="http://www.w3.org/2000/svg"
				height="20px"
				viewBox="0 0 24 24"
				fill="none"
				stroke="#d9d9d9"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path
					d="M21 15l-5-5L5 21"
				/></svg
			></button
		>
		<button
			type="submit"
			disabled={sending}
			aria-label="Post"
			class="flex cursor-pointer items-end border-b border-foreground p-2.5 outline-none disabled:cursor-default disabled:opacity-40"
			><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 512 512"
				><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
					d="M16.1 260.2c-22.6 12.9-20.5 47.3 3.6 57.3L160 376V479.3c0 18.1 14.6 32.7 32.7 32.7c9.7 0 18.9-4.3 25.1-11.8l62-74.3 123.9 51.6c18.9 7.9 40.8-4.5 43.9-24.7l64-416c1.9-12.1-3.4-24.3-13.5-31.2s-23.3-7.5-34-1.4l-448 256zm52.1 25.5L409.7 90.6 190.1 336l1.2 1L68.2 285.7zM403.3 425.4L236.7 355.9 450.8 116.6 403.3 425.4z"
				/></svg
			></button
		>
	</div>
	{#if attachments.length > 0}
		<div class="flex flex-wrap gap-2.5">
			{#each attachments as attachment (attachment.url)}
				<div class="relative size-20 overflow-hidden rounded-[5px] border border-line">
					<img class="size-full object-cover" src={attachment.url} alt="" />
					<button
						type="button"
						title="Remove"
						aria-label="Remove image"
						onclick={() => removeAttachment(attachment)}
						class="absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/80 text-[0.8rem] leading-none outline-none hover:bg-danger"
						>×</button
					>
				</div>
			{/each}
		</div>
	{/if}
	{#if quoteOf}
		<QuoteCard quote={quoteOf} link={false} />
	{/if}
</form>
