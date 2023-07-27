import { sql } from '$lib/server/db';
import type { Post } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
    const post = await sql`
        SELECT posts.content, posts.created_at, posts.edited_at, users.name, users.username, users.avatar, users.created_at, COUNT(likes.post_id) AS likes
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
        LEFT JOIN likes ON posts.id = likes.post_id
        WHERE posts.id = ${params.post} AND users.username = ${params.username}
        GROUP BY posts.id, users.id
    `;

    return {
        post: {
            id: parseInt(params.post),
            content: post[0].content,
            created_at: post[0].created_at,
            edited_at: post[0].edited_at,
            likes: post[0].likes,
            user: {
                name: post[0].name,
                username: post[0].username,
                avatar: post[0].avatar,
                created_at: post[0].created_at
            }
        } satisfies Post
    };
}) satisfies PageServerLoad;
