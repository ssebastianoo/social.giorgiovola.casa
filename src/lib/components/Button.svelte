<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Common = {
		/**
		 * default: green outline, fills on hover. primary: filled, the main action of a view.
		 * danger: red outline, destructive actions. danger-on-hover: an "on" toggle that turns red
		 * on hover because clicking it undoes something (Following → Unfollow).
		 */
		variant?: 'default' | 'primary' | 'danger' | 'danger-on-hover';
		/** sm: fixed 32px height, for rows next to headings. lg: roomy, for auth forms. */
		size?: 'sm' | 'md' | 'lg';
		/** layout only (width, alignment, margins): colors, borders and radius come from variant */
		class?: string;
		children: Snippet;
	};

	// one flat type rather than a button | link union, so handlers like onclick={(e) => …} get a
	// typed event: with href it renders a link, the anchor-only attributes it needs are added
	type Props = Common &
		Omit<HTMLButtonAttributes, 'class' | 'children'> &
		Pick<HTMLAnchorAttributes, 'href' | 'target' | 'rel' | 'download'>;

	// the app builds no custom elements
	// svelte-ignore custom_element_props_identifier
	let {
		variant = 'default',
		size = 'md',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const variants = {
		default: 'border-accent bg-background text-foreground hover:bg-accent hover:text-background',
		primary: 'border-accent bg-accent text-background hover:bg-background hover:text-foreground',
		danger: 'border-danger bg-background text-foreground hover:bg-danger hover:text-background',
		'danger-on-hover':
			'border-accent bg-background text-foreground hover:border-danger hover:text-danger'
	};
	const sizes = { sm: 'h-8 px-[5px]', md: 'p-[5px]', lg: 'p-2.5' };

	const classes = $derived(
		`inline-flex cursor-pointer items-center justify-center gap-[5px] rounded-[5px] border text-center outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`
	);
</script>

{#if rest.href !== undefined}
	<a class={classes} {...rest as HTMLAnchorAttributes}>{@render children()}</a>
{:else}
	<!-- type defaults to button, so a button in a form never submits it by accident -->
	<button class={classes} type="button" {...rest as HTMLButtonAttributes}>{@render children()}</button>
{/if}
