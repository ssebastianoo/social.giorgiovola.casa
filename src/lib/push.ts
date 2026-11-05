/** Browser side of web push: subscribe, unsubscribe and keep the subscription bound to the session. */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export const pushSupported = () =>
	typeof window !== 'undefined' &&
	'serviceWorker' in navigator &&
	'PushManager' in window &&
	'Notification' in window;

const registration = () => navigator.serviceWorker.ready;

async function currentSubscription() {
	return (await registration()).pushManager.getSubscription();
}

export async function getPushState(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	return (await currentSubscription()) ? 'on' : 'off';
}

const json = (body: unknown) => ({
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
});

function keyBytes(base64url: string) {
	const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/**
 * Why turning push on failed: `unavailable` when the browser has no push service to subscribe
 * with, `server` when the key could not be fetched or the subscription could not be saved.
 */
export class PushError extends Error {
	constructor(readonly reason: 'unavailable' | 'server', options?: ErrorOptions) {
		super(
			reason === 'unavailable' ? 'no push service in this browser' : 'push server error',
			options
		);
		this.name = 'PushError';
	}
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array) {
	if (!a || a.byteLength !== b.length) return false;
	const bytes = new Uint8Array(a);
	return bytes.every((byte, i) => byte === b[i]);
}

/** Asks for permission, subscribes this browser and registers it for the signed in account. */
export async function enablePush(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';
	if ((await Notification.requestPermission()) !== 'granted') return getPushState();

	const res = await fetch('/api/push');
	if (!res.ok) throw new PushError('server');
	const { publicKey } = await res.json();
	const key = keyBytes(publicKey);

	const reg = await registration();
	let subscription = await reg.pushManager.getSubscription();
	// a subscription made with another key (e.g. the server's key pair was reset) is still saved
	// fine, but every push sent to it is rejected: replace it
	if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
		await fetch('/api/push', { method: 'DELETE', ...json({ endpoint: subscription.endpoint }) });
		await subscription.unsubscribe();
		subscription = null;
	}
	if (!subscription) {
		try {
			subscription = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: key
			});
		} catch (e) {
			// chromium builds without google services (helium, ungoogled-chromium, brave with google
			// push messaging off) have no push service and reject with "push service error"
			if (e instanceof DOMException && e.name === 'AbortError')
				throw new PushError('unavailable', { cause: e });
			throw e;
		}
	}
	const saved = await fetch('/api/push', { method: 'POST', ...json(subscription.toJSON()) });
	if (!saved.ok) throw new PushError('server');
	return 'on';
}

/** Stops the notifications for the signed in account (the browser subscription is dropped too). */
export async function disablePush(): Promise<PushState> {
	const subscription = pushSupported() ? await currentSubscription() : null;
	if (subscription) {
		await fetch('/api/push', { method: 'DELETE', ...json({ endpoint: subscription.endpoint }) });
		await subscription.unsubscribe();
	}
	return getPushState();
}

/**
 * Subscriptions belong to a session, so after logging in again (or switching to another signed in
 * account) the browser's existing subscription is registered for the session now in use.
 */
export async function syncPush() {
	if (!pushSupported() || Notification.permission !== 'granted') return;
	const subscription = await currentSubscription();
	if (subscription) await fetch('/api/push', { method: 'POST', ...json(subscription.toJSON()) });
}
