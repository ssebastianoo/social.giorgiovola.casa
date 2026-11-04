import { env } from '$env/dynamic/private';

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();

setInterval(() => {
	const now = Date.now();
	for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key);
}, 60_000).unref?.();

/** True when `key` has used up its `max` hits in the current window. Does not count a hit. */
export function isLimited(key: string, max: number) {
	const bucket = buckets.get(key);
	return !!bucket && bucket.reset > Date.now() && bucket.count >= max;
}

export function hit(key: string, windowMs: number) {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.reset <= now) buckets.set(key, { count: 1, reset: now + windowMs });
	else bucket.count++;
}

export function clear(key: string) {
	buckets.delete(key);
}

/**
 * The client IP, or null when it can't be trusted. Behind a reverse proxy every request
 * comes from the proxy's address, so per-IP limits are only applied when ADDRESS_HEADER
 * tells adapter-node which header carries the real client address.
 */
export function clientIp(getClientAddress: () => string): string | null {
	if (!env.ADDRESS_HEADER) return null;
	try {
		return getClientAddress();
	} catch {
		return null;
	}
}
