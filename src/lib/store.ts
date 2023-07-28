import { writable } from 'svelte/store';
import type { User, Post } from './types';

export const user = writable<User | null>(null);
export const posts = writable<Post[]>([]);
