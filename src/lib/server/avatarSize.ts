const SIZES = [32, 64, 128, 256, 512, 1024];

/** Snaps a requested size to a small fixed set, so caches stay small and junk input is harmless. */
export function avatarSize(raw: string | null, fallback: number) {
	const n = Number(raw);
	const requested = Number.isFinite(n) && n > 0 ? n : fallback;
	return SIZES.find((s) => s >= requested) ?? SIZES[SIZES.length - 1];
}
