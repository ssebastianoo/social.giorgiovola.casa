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

/** Asks for permission, subscribes this browser and registers it for the signed in account. */
export async function enablePush(): Promise<PushState> {
	if (!pushSupported()) return 'unsupported';
	if ((await Notification.requestPermission()) !== 'granted') return getPushState();

	const res = await fetch('/api/push');
	if (!res.ok) throw new Error('could not get the push key');
	const { publicKey } = await res.json();

	const reg = await registration();
	const subscription =
		(await reg.pushManager.getSubscription()) ??
		(await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: keyBytes(publicKey)
		}));
	const saved = await fetch('/api/push', { method: 'POST', ...json(subscription.toJSON()) });
	if (!saved.ok) throw new Error('could not save the subscription');
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
