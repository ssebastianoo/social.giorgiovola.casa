/** Tiny LRU cache for rendered images, so repeated requests don't re-run canvas. */
export class LRU<V> {
	private map = new Map<string, V>();
	constructor(private max: number) {}

	get(key: string) {
		const value = this.map.get(key);
		if (value !== undefined) {
			this.map.delete(key);
			this.map.set(key, value);
		}
		return value;
	}

	set(key: string, value: V) {
		this.map.delete(key);
		this.map.set(key, value);
		if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
	}
}
