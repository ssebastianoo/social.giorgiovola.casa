<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { viewer, closeImage } from '#lib/imageViewer.svelte.js';

	const MIN_SCALE = 1;
	const MAX_SCALE = 6;
	const DOUBLE_ZOOM = 2.5;

	const open = $derived(viewer.images.length > 0);
	const multiple = $derived(viewer.images.length > 1);
	const src = $derived(viewer.images[viewer.index]);

	let stage: HTMLDivElement | undefined = $state();
	let img: HTMLImageElement | undefined = $state();

	// zoom and pan of the image, translation is relative to the centre of the stage
	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	// finger offset while swiping an unzoomed image (next/previous or dismiss)
	let sx = $state(0);
	let sy = $state(0);
	// no transition while a finger or the mouse is driving the transform
	let interacting = $state(false);

	const zoomed = $derived(scale > 1.01);

	const reset = () => {
		scale = 1;
		tx = ty = sx = sy = 0;
	};

	const step = (delta: number) => {
		const n = viewer.images.length;
		viewer.index = (viewer.index + delta + n) % n;
	};

	// every new image starts unzoomed
	$effect(() => {
		void src;
		reset();
	});

	// warm the cache for the neighbours so moving through a gallery is instant
	$effect(() => {
		if (!multiple) return;
		const n = viewer.images.length;
		for (const d of [1, -1]) new Image().src = viewer.images[(viewer.index + d + n) % n];
	});

	const clampValue = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

	// keep the zoomed image covering the stage instead of sliding off into the void
	const clampPan = () => {
		if (!stage || !img) return;
		const maxX = Math.max(0, (img.offsetWidth * scale - stage.clientWidth) / 2);
		const maxY = Math.max(0, (img.offsetHeight * scale - stage.clientHeight) / 2);
		tx = clampValue(tx, -maxX, maxX);
		ty = clampValue(ty, -maxY, maxY);
	};

	// a point on the stage, relative to its centre
	const fromCenter = (clientX: number, clientY: number) => {
		if (!stage) return { x: 0, y: 0 };
		const r = stage.getBoundingClientRect();
		return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
	};

	// zoom keeping the image point under p (relative to the centre) in place
	const zoomAt = (next: number, p = { x: 0, y: 0 }) => {
		next = clampValue(next, MIN_SCALE, MAX_SCALE);
		tx = p.x - ((p.x - tx) * next) / scale;
		ty = p.y - ((p.y - ty) * next) / scale;
		scale = next;
		if (scale <= 1) tx = ty = 0;
		clampPan();
	};

	const toggleZoom = (clientX: number, clientY: number) => {
		if (zoomed) zoomAt(1);
		else zoomAt(DOUBLE_ZOOM, fromCenter(clientX, clientY));
	};

	const onkeydown = (e: KeyboardEvent) => {
		if (!open) return;
		if (e.key === 'Escape') closeImage();
		else if (multiple && e.key === 'ArrowRight') step(1);
		else if (multiple && e.key === 'ArrowLeft') step(-1);
		else if (e.key === '+' || e.key === '=') zoomAt(scale * 1.5);
		else if (e.key === '-') zoomAt(scale / 1.5);
		else if (e.key === '0') zoomAt(1);
	};

	// wheel and trackpad pinch (ctrl+wheel); svelte's onwheel is passive, so it couldn't stop the page zooming
	$effect(() => {
		if (!stage) return;
		const el = stage;
		const onwheel = (e: WheelEvent) => {
			e.preventDefault();
			const unit = e.deltaMode === 1 ? 16 : 1;
			const speed = e.ctrlKey ? 0.01 : 0.002;
			zoomAt(scale * Math.exp(-e.deltaY * unit * speed), fromCenter(e.clientX, e.clientY));
		};
		el.addEventListener('wheel', onwheel, { passive: false });
		return () => el.removeEventListener('wheel', onwheel);
	});

	// pointer gestures: one pointer pans (or swipes when unzoomed), two pinch
	const pointers = new Map<number, { x: number; y: number }>();
	let gesture:
		| { kind: 'pan'; x: number; y: number; tx: number; ty: number; axis: 'x' | 'y' | null }
		| { kind: 'pinch'; dist: number; scale: number; ux: number; uy: number }
		| null = null;
	// a drag or pinch shouldn't also count as a click that closes the viewer
	let moved = false;
	let lastTap = { time: 0, x: 0, y: 0 };

	const startGesture = () => {
		const pts = [...pointers.values()];
		if (pts.length >= 2) {
			const [a, b] = pts;
			const mid = fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
			gesture = {
				kind: 'pinch',
				dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
				scale,
				// the image point under the fingers, in unscaled image coordinates
				ux: (mid.x - tx) / scale,
				uy: (mid.y - ty) / scale
			};
		} else if (pts.length === 1) {
			gesture = { kind: 'pan', x: pts[0].x, y: pts[0].y, tx, ty, axis: null };
		} else gesture = null;
	};

	const onpointerdown = (e: PointerEvent) => {
		if ((e.target as Element).closest('button, a')) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		if (pointers.size === 0) moved = false;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		interacting = true;
		startGesture();
	};

	const onpointermove = (e: PointerEvent) => {
		if (!pointers.has(e.pointerId) || !gesture) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (gesture.kind === 'pinch') {
			const [a, b] = [...pointers.values()];
			const mid = fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			scale = clampValue((gesture.scale * dist) / gesture.dist, MIN_SCALE, MAX_SCALE);
			tx = mid.x - gesture.ux * scale;
			ty = mid.y - gesture.uy * scale;
			clampPan();
			moved = true;
			return;
		}

		const dx = e.clientX - gesture.x;
		const dy = e.clientY - gesture.y;
		if (!moved && Math.hypot(dx, dy) < 6) return;
		moved = true;

		if (zoomed) {
			tx = gesture.tx + dx;
			ty = gesture.ty + dy;
			clampPan();
		} else if (e.pointerType !== 'mouse') {
			// lock to the first direction the finger went, like a native gallery
			gesture.axis ??= Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
			if (gesture.axis === 'x') sx = multiple ? dx : dx / 4;
			else sy = Math.max(0, dy);
		}
	};

	const onpointerup = (e: PointerEvent) => {
		if (!pointers.delete(e.pointerId)) return;
		const wasPan = gesture?.kind === 'pan';

		if (pointers.size > 0) {
			// lifting one finger of a pinch carries on as a pan with the other
			startGesture();
			return;
		}
		gesture = null;
		interacting = false;

		if (scale < 1.01) reset();

		if (wasPan && !zoomed && e.type === 'pointerup') {
			if (multiple && Math.abs(sx) > 60) step(sx < 0 ? 1 : -1);
			else if (sy > 100) closeImage();
		}
		sx = sy = 0;

		// double tap to zoom, the mouse uses dblclick
		if (e.pointerType !== 'mouse' && !moved && e.type === 'pointerup') {
			const now = Date.now();
			const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
			if (now - lastTap.time < 300 && near && e.target === img) {
				toggleZoom(e.clientX, e.clientY);
				lastTap = { time: 0, x: 0, y: 0 };
			} else lastTap = { time: now, x: e.clientX, y: e.clientY };
		}
	};

	// clicking the dark area around the image closes it, clicking the image doesn't
	const onclick = (e: MouseEvent) => {
		if (moved) return;
		if (e.target === e.currentTarget) closeImage();
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

	const control =
		'flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-foreground outline-none hover:bg-black/80 hover:no-underline focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-default disabled:opacity-40';
</script>

<svelte:window {onkeydown} />

{#if open}
	<div
		class="fixed inset-0 z-1000 overflow-hidden backdrop-blur-sm select-none"
		style:background-color="rgb(0 0 0 / {0.9 * (1 - Math.min(sy / 400, 0.6))})"
		role="dialog"
		aria-modal="true"
		aria-label="Image preview"
		tabindex="-1"
	>
		<!-- the stage takes the gestures; touch-action none keeps the browser from zooming the page -->
		<div
			bind:this={stage}
			class="absolute inset-0 flex touch-none items-center justify-center"
			role="presentation"
			{onclick}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
			onpointerleave={(e) => {
				// a mouse released outside the window never sends pointerup
				if (e.pointerType === 'mouse') onpointerup(e);
			}}
		>
			<img
				bind:this={img}
				class="max-h-full max-w-full object-contain will-change-transform {interacting
					? ''
					: 'transition-transform duration-200 ease-out'} {zoomed
					? interacting
						? 'cursor-grabbing'
						: 'cursor-grab'
					: 'cursor-zoom-in'}"
				style:transform="translate({tx + sx}px, {ty + sy}px) scale({scale})"
				{src}
				alt=""
				referrerpolicy="no-referrer"
				draggable="false"
				ondblclick={(e) => toggleZoom(e.clientX, e.clientY)}
			/>
		</div>

		<div class="absolute top-4 right-4 flex gap-2.5">
			<button
				type="button"
				class={control}
				aria-label="Zoom out"
				title="Zoom out (-)"
				disabled={!zoomed}
				onclick={() => zoomAt(scale / 1.5)}
			>
				<svg viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"
					><path d="M5 11h14v2H5z" /></svg
				>
			</button>
			<button
				type="button"
				class={control}
				aria-label="Zoom in"
				title="Zoom in (+)"
				disabled={scale >= MAX_SCALE}
				onclick={() => zoomAt(scale * 1.5)}
			>
				<svg viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"
					><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" /></svg
				>
			</button>
			<a
				class={control}
				href={src}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Open original"
				title="Open original"
			>
				<svg viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"
					><path
						d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
					/></svg
				>
			</a>
			<button
				type="button"
				class="{control} text-2xl"
				aria-label="Close preview"
				title="Close (Esc)"
				onclick={closeImage}>&times;</button
			>
		</div>

		{#if multiple}
			<button
				type="button"
				class="{control} absolute top-1/2 left-4 -translate-y-1/2 text-2xl"
				aria-label="Previous image"
				onclick={() => step(-1)}>&lsaquo;</button
			>
			<button
				type="button"
				class="{control} absolute top-1/2 right-4 -translate-y-1/2 text-2xl"
				aria-label="Next image"
				onclick={() => step(1)}>&rsaquo;</button
			>
		{/if}

		{#if multiple || zoomed}
			<p
				class="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2.5 rounded-full bg-black/60 px-3 py-1 text-sm text-foreground"
			>
				{#if multiple}<span>{viewer.index + 1} / {viewer.images.length}</span>{/if}
				{#if zoomed}<span class="text-muted">{Math.round(scale * 100)}%</span>{/if}
			</p>
		{/if}
	</div>
{/if}
