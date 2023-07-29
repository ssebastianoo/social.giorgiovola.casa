import { writable } from 'svelte/store';
import type { User } from './types';

export const user = writable<User | null>(null);
export const isMobile = writable(false);
