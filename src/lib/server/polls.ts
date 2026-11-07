import { and, count, eq, sql } from 'drizzle-orm';
import { db, poll_votes, polls } from './db/index.js';
import { publishPollVotes } from './realtime.js';

export type VoteResult =
	| { ok: true; voted: number; votes: number[] }
	| { ok: false; status: number; message: string };

/** How many votes each option of a poll got, in option order. */
async function countVotes(
	tx: Pick<typeof db, 'select'>,
	postId: number,
	options: number
): Promise<number[]> {
	const rows = await tx
		.select({ option: poll_votes.option, n: count() })
		.from(poll_votes)
		.where(eq(poll_votes.post_id, postId))
		.groupBy(poll_votes.option);
	const votes = Array<number>(options).fill(0);
	for (const row of rows) if (row.option < options) votes[row.option] = row.n;
	return votes;
}

/**
 * Votes for option `option` (an index) of the poll on post `postId`. While the poll is open,
 * voting again moves the vote to the new option; once it has ended votes are frozen, and only
 * repeating the vote already cast succeeds (as a no-op).
 */
export async function vote(userId: number, postId: number, option: number): Promise<VoteResult> {
	const result = await db.transaction(async (tx): Promise<VoteResult> => {
		const [poll] = await tx
			.select({
				options: sql<number>`cardinality(${polls.options})`.mapWith(Number),
				closed: sql<boolean>`${polls.ends_at} <= NOW()`
			})
			.from(polls)
			.where(eq(polls.post_id, postId));
		if (!poll) return { ok: false, status: 404, message: 'Poll not found' };
		if (!Number.isInteger(option) || option < 0 || option >= poll.options)
			return { ok: false, status: 400, message: 'Invalid option' };

		if (poll.closed) {
			const [existing] = await tx
				.select({ option: poll_votes.option })
				.from(poll_votes)
				.where(and(eq(poll_votes.post_id, postId), eq(poll_votes.user_id, userId)));
			if (existing?.option !== option)
				return { ok: false, status: 409, message: 'This poll has ended' };
		} else {
			// the upsert waits for a concurrent vote by the same profile, then overwrites it
			await tx
				.insert(poll_votes)
				.values({ post_id: postId, user_id: userId, option })
				.onConflictDoUpdate({
					target: [poll_votes.post_id, poll_votes.user_id],
					set: { option }
				});
		}
		return { ok: true, voted: option, votes: await countVotes(tx, postId, poll.options) };
	});
	if (result.ok) publishPollVotes(postId, result.votes);
	return result;
}
