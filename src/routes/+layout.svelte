<script lang="ts">
	import '@fontsource-variable/manrope';
	import '../app.css';
	import { onMount } from 'svelte';
	import Header from '#lib/components/Header.svelte';
	import type { LayoutData } from './$types';
	import { user, isMobile, notisCount, messagesCount } from '#lib/store.js';
	import { navigating, page } from '$app/state';
	import Loading from '#lib/components/Loading.svelte';
	import ImageViewer from '#lib/components/ImageViewer.svelte';
	import ProfileCard from '#lib/components/ProfileCard.svelte';
	import { PUBLIC_URL } from '$app/env/public';
	import { getAvatar } from '#lib/utils.js';
	import { connectRealtime, disconnectRealtime, onRealtime } from '#lib/realtime.js';
	import { syncPush } from '#lib/push.js';

	export let data: LayoutData;
	$user = data.user;
	$notisCount = data.notisCount;
	$messagesCount = data.messagesCount;

	// social cards can't show SVGs: use the first other image of a post, else the generated card
	const postCard = (post: { images?: string[] }) => {
		const image = post.images?.find((i) => !i.endsWith('.svg'));
		return image ? (PUBLIC_URL || page.url.origin) + image : publicUrl() + '/image.png';
	};
	// image-only posts have no text to quote
	const postText = (post: { content: string; images?: string[] }) =>
		post.content || (post.images?.length ? '[image]' : '');

	// adapter-node no longer rewrites the request URL to the public origin (SvelteKit 3 dropped
	// ORIGIN), so build absolute share URLs from PUBLIC_URL like the canonical link does
	const publicUrl = () => `${PUBLIC_URL || page.url.origin}${page.url.pathname}${page.url.search}`;

	// the stream is tied to the active profile (unread count), so reconnect when it changes
	let mounted = false;
	$: userId = data.user?.id ?? null;
	$: if (mounted) {
		userId;
		connectRealtime();
	}

	// push subscriptions belong to a session: bind this browser's one to the profile now in use
	$: if (mounted && userId !== null) syncPush().catch(() => {});

	// unread count on the installed app's icon
	$: if (mounted && 'setAppBadge' in navigator) {
		if ($notisCount + $messagesCount > 0)
			navigator.setAppBadge($notisCount + $messagesCount).catch(() => {});
		else navigator.clearAppBadge().catch(() => {});
	}

	onMount(() => {
		mounted = true;
		const offNotifications = onRealtime('notifications', ({ count }) => ($notisCount = count));
		const offMessages = onRealtime('messages_unread', ({ count }) => ($messagesCount = count));
		return () => {
			offNotifications();
			offMessages();
			disconnectRealtime();
		};
	});

	onMount(async () => {
		if ('ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0) {
			$isMobile = true;
		}

		document.documentElement.style.setProperty('--fh', `${window.innerHeight}px`);
		window.addEventListener('resize', () => {
			document.documentElement.style.setProperty('--fh', `${window.innerHeight}px`);
		});
	});
</script>

<Header />
<ImageViewer />
<ProfileCard />
<svelte:head>
	{#if page.route.id === '/@[username]/[post]' && !page.error}
		<!-- Primary Meta Tags -->
		<title>{`${page.data.post.user.name} : "${postText(page.data.post)}"`}</title>
		<meta name="title" content={`${page.data.post.user.name} on social.giorgiovola.casa`} />
		<meta name="description" content={postText(page.data.post)} />

		<!-- Open Graph / Facebook -->
		<meta property="og:type" content="article" />
		<meta property="og:url" content={publicUrl()} />
		<meta
			property="og:title"
			content={`${page.data.post.user.name} : "${postText(page.data.post)}"`}
		/>
		<meta property="og:description" content={postText(page.data.post)} />
		<meta property="og:image" content={postCard(page.data.post)} />
		<meta property="og:profile:username" content={page.data.post.user.username} />
		<meta property="og:article:published_time" content={page.data.post.created_at.toISOString()} />

		<!-- Twitter -->
		<meta property="twitter:card" content="summary_large_image" />
		<meta property="twitter:url" content={publicUrl()} />
		<meta
			property="twitter:title"
			content={`${page.data.post.user.name} on social.giorgiovola.casa`}
		/>
		<meta property="twitter:description" content={postText(page.data.post)} />
		<meta property="twitter:image" content={postCard(page.data.post)} />
	{:else if page.route.id === '/@[username]' && !page.error}
		<!-- Primary Meta Tags -->
		<title>{page.data.user.name} (@{page.data.user.username}) / social.giorgiovola.casa</title>
		<meta
			name="title"
			content={`${page.data.user.name} (@${page.data.user.username}) / social.giorgiovola.casa`}
		/>
		<meta
			name="description"
			content={page.data.bio || `Follow @${page.data.user.username} on social.giorgiovola.casa`}
		/>

		<!-- Open Graph / Facebook -->
		<meta property="og:type" content="profile" />
		<meta property="og:url" content={publicUrl()} />
		<meta
			property="og:title"
			content={`${page.data.user.name} (@${page.data.user.username}) / social.giorgiovola.casa}`}
		/>
		<meta
			property="og:description"
			content={page.data.bio || `Follow @${page.data.user.username} on social.giorgiovola.casa`}
		/>
		<meta property="og:image" content={getAvatar(page.data.user, 500, true)} />
		<meta property="og:profile:username" content={page.data.user.username} />
		<meta property="og:profile:first_name" content={page.data.user.name} />
		<!-- Twitter -->
		<meta property="twitter:card" content="summary_large_image" />
		<meta property="twitter:url" content={publicUrl()} />
		<meta
			property="twitter:title"
			content={`${page.data.user.name} (@${page.data.user.username}) / social.giorgiovola.casa`}
		/>
		<meta
			property="twitter:description"
			content={page.data.bio || `Follow @${page.data.user.username} on social.giorgiovola.casa`}
		/>
		<meta property="twitter:image" content={`${getAvatar(page.data.user, 500, true)}`} />
	{:else}
		<!-- Primary Meta Tags -->
		<title>Social Giorgiovola Casa</title>
		<meta name="title" content="Social Giorgiovola Casa" />
		<meta
			name="description"
			content="Imagine a new way of thinking the social networking world. u got it? this isn't it, bye."
		/>
		<!-- Open Graph / Facebook -->
		<meta property="og:type" content="website" />
		<meta property="og:url" content="https://social.giorgiovola.casa/" />
		<meta property="og:title" content="Social Giorgiovola Casa" />
		<meta
			property="og:description"
			content="Imagine a new way of thinking the social networking world. u got it? this isn't it, bye."
		/>
		<meta property="og:image" content="/OpenGraph.png" />

		<!-- Twitter -->
		<meta property="twitter:url" content="https://social.giorgiovola.casa/" />
		<meta property="twitter:title" content="Social Giorgiovola Casa" />
		<meta
			property="twitter:description"
			content="Imagine a new way of thinking the social networking world. u got it? this isn't it, bye."
		/>
		<meta property="twitter:image" content={`${PUBLIC_URL}/OpenGraph.png`} />
	{/if}
	<link rel="canonical" href={`${PUBLIC_URL}${page.url.pathname}`} />
</svelte:head>
<main class="relative mt-20 flex justify-center">
	<div class="w-full max-w-160 p-5">
		<slot />
	</div>
	{#if navigating.to}
		<div class="fixed right-0 bottom-0"><Loading /></div>
	{/if}
</main>
