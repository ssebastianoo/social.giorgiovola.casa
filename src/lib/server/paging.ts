import { error } from '@sveltejs/kit';

export const PAGE_SIZE = 10;
const MAX_PAGE = 10_000;

/** Reads the `currentPage` field sent by the Posts component's infinite scroll. */
export async function pageOffset(request: Request) {
	const formData = await request.formData();
	const raw = formData.get('currentPage');
	if (typeof raw !== 'string' || !/^\d{1,5}$/.test(raw) || Number(raw) > MAX_PAGE) {
		error(400, 'Invalid currentPage');
	}
	return Number(raw) * PAGE_SIZE;
}
