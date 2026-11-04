/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { self } from '$app/service-worker';
import { version } from '$app/env';
import { immutable } from '$app/manifest';

// The pages are server rendered and personal (session cookies, realtime stream), so they are never
// cached. The worker only makes the app installable, keeps the build assets close, and shows an
// offline page when a navigation cannot reach the server.

const CACHE = `cache-${version}`;
const OFFLINE = '/offline.html';
// build paths come without the leading slash
const abs = (path: string) => (path.startsWith('/') ? path : `/${path}`);
const IMMUTABLE = new Set(immutable.map((f) => abs(f.path)));
const PRECACHE = [OFFLINE, '/Logo.png', '/icons/icon-192.png', '/icons/icon-512.png', ...IMMUTABLE];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// API calls and the SSE stream always go to the network
	if (url.pathname.startsWith('/api/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error())
		);
		return;
	}

	// build assets are content hashed, so a cached copy is always valid
	if (IMMUTABLE.has(url.pathname) || PRECACHE.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
	}
});

type PushPayload = { title: string; body: string; url: string; tag?: string };

self.addEventListener('push', (event) => {
	let data: PushPayload;
	try {
		data = event.data!.json();
	} catch {
		return;
	}

	event.waitUntil(
		(async () => {
			// the open page already shows the new notification (realtime stream and badge)
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;

			await self.registration.showNotification(data.title, {
				body: data.body,
				icon: '/icons/icon-192.png',
				tag: data.tag,
				// `renotify` is missing from the bundled lib types
				...({ renotify: !!data.tag } as object),
				data: { url: data.url }
			});
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	// only ever open pages of this app
	let target = new URL('/notifications', self.location.origin);
	try {
		const url = new URL(event.notification.data?.url ?? '', self.location.origin);
		if (url.origin === self.location.origin) target = url;
	} catch {
		// keep the notifications page
	}

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
			if (open) {
				await open.focus();
				await open.navigate(target.href).catch(() => {});
			} else {
				await self.clients.openWindow(target.href);
			}
		})()
	);
});
