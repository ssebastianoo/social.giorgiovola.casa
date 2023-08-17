import { sql } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({params}) => {
    const response = await sql`
    SELECT
    users.username,
    users.name,
    users.avatar
    FROM likes
    INNER JOIN users ON users.id = likes.user_id
    WHERE likes.post_id = ${params.id}
    `;
    return new Response(JSON.stringify(response));
};