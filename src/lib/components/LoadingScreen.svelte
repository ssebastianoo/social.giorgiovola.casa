<script lang="ts">
	import { draw, fade } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';

	type Props = {
		/** width and height of the mark in px */
		size?: number;
		/** layout only */
		class?: string;
	};

	let { size = 160, class: className = '' }: Props = $props();

	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	// ms. the plan draws in (frame, main walls, small walls), holds, then undraws in reverse order.
	// `out` delays are relative to the moment the block is removed
	const seq = {
		floor: { in: [576, 720], out: [1056, 720] },
		frame: { in: [0, 960], out: [1056, 864] },
		mainV: { in: [816, 624], out: [720, 624] },
		mainH: { in: [1200, 528], out: [576, 432] },
		w1: { in: [1536, 432], out: [432, 432] },
		w2: { in: [1680, 432], out: [288, 432] },
		w3: { in: [1824, 432], out: [144, 432] },
		w4: { in: [1968, 432], out: [0, 432] }
	};
	const SHOWN = 2400 + 384; // drawing in + hold
	const HIDING = 1920 + 100; // undrawing + rest

	const timing = (key: keyof typeof seq, dir: 'in' | 'out') => {
		const [delay, duration] = seq[key][dir];
		return reducedMotion.current ? { duration: 0 } : { delay, duration };
	};

	// starts hidden so the intro also plays on first mount
	let visible = $state(false);

	$effect(() => {
		if (reducedMotion.current) {
			visible = true;
			return;
		}
		let timer: ReturnType<typeof setTimeout>;
		const show = () => {
			visible = true;
			timer = setTimeout(hide, SHOWN);
		};
		const hide = () => {
			visible = false;
			timer = setTimeout(show, HIDING);
		};
		show();
		return () => clearTimeout(timer);
	});
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 496 496"
	fill="none"
	role="img"
	aria-label="Loading"
>
	{#if visible}
		<rect
			x="12"
			y="12"
			width="472"
			height="472"
			fill="#799a74"
			in:fade={timing('floor', 'in')}
			out:fade={timing('floor', 'out')}
		/>
		<g stroke="#ffe9e9" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
			<rect
				x="6"
				y="6"
				width="484"
				height="484"
				rx="4"
				in:draw={timing('frame', 'in')}
				out:draw={timing('frame', 'out')}
			/>
			<path
				d="M248 12V484"
				stroke-linecap="butt"
				in:draw={timing('mainV', 'in')}
				out:draw={timing('mainV', 'out')}
			/>
			<path
				d="M248 248H484"
				stroke-linecap="butt"
				in:draw={timing('mainH', 'in')}
				out:draw={timing('mainH', 'out')}
			/>
			<path d="M484 130H372V158" in:draw={timing('w1', 'in')} out:draw={timing('w1', 'out')} />
			<path d="M248 189H124" in:draw={timing('w2', 'in')} out:draw={timing('w2', 'out')} />
			<path d="M12 305H123" in:draw={timing('w3', 'in')} out:draw={timing('w3', 'out')} />
			<path d="M484 366H403" in:draw={timing('w4', 'in')} out:draw={timing('w4', 'out')} />
		</g>
	{/if}
</svg>
