<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { viewer, closeImage } from '#lib/imageViewer.svelte.js';

	const open = $derived(viewer.images.length > 0);
	const multiple = $derived(viewer.images.length > 1);
	const src = $derived(viewer.images[viewer.index]);

	const step = (delta: number) => {
		const n = viewer.images.length;
		viewer.index = (viewer.index + delta + n) % n;
	};

	const onkeydown = (e: KeyboardEvent) => {
		if (!open) return;
		if (e.key === 'Escape') closeImage();
		else if (multiple && e.key === 'ArrowRight') step(1);
		else if (multiple && e.key === 'ArrowLeft') step(-1);
	};

	// swipe left/right to move through a gallery, down to dismiss
	let touchStart: { x: number; y: number } | null = null;
	const ontouchstart = (e: TouchEvent) => {
		const t = e.touches[0];
		touchStart = { x: t.clientX, y: t.clientY };
	};
	const ontouchend = (e: TouchEvent) => {
		if (!touchStart) return;
		const t = e.changedTouches[0];
		const dx = t.clientX - touchStart.x;
		const dy = t.clientY - touchStart.y;
		touchStart = null;
		if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
			if (multiple) step(dx < 0 ? 1 : -1);
		} else if (dy > 80) closeImage();
	};

	// the page behind shouldn't scroll while the preview is up
	$effect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	afterNavigate(closeImage);
</script>

<svelte:window {onkeydown} />

{#if open}
	<div
		class="fixed inset-0 z-1000 flex items-center justify-center bg-black/90 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label="Image preview"
		tabindex="-1"
		onclick={closeImage}
		onkeydown={() => {}}
		{ontouchstart}
		{ontouchend}
	>
		<img
			class="max-h-full max-w-full object-contain select-none"
			{src}
			alt=""
			referrerpolicy="no-referrer"
			draggable="false"
		/>

		<button
			type="button"
			class="absolute top-4 right-4 flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-2xl text-white outline-none hover:bg-black/80"
			aria-label="Close preview"
			onclick={closeImage}>&times;</button
		>

		{#if multiple}
			<button
				type="button"
				class="absolute left-4 flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-2xl text-white outline-none hover:bg-black/80"
				aria-label="Previous image"
				onclick={(e) => {
					e.stopPropagation();
					step(-1);
				}}>&lsaquo;</button
			>
			<button
				type="button"
				class="absolute right-4 flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-2xl text-white outline-none hover:bg-black/80"
				aria-label="Next image"
				onclick={(e) => {
					e.stopPropagation();
					step(1);
				}}>&rsaquo;</button
			>
			<p
				class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
			>
				{viewer.index + 1} / {viewer.images.length}
			</p>
		{/if}
	</div>
{/if}
