import { writable } from 'svelte/store';
import type { User } from './types';

export const user = writable<User | null>(null);
export const notisCount = writable<number>(0);
export const isMobile = writable(false);
