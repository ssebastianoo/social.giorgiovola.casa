import { sql } from '$lib/server/db';
import type { Post } from '$lib/types';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type postgres from 'postgres';
import type { Row } from 'postgres';

export const load = (async ({params, locals}) => {
    let post;
    if(!locals.user) {
    post = await sql`
        SELECT posts.content, posts.created_at, posts.edited_at, users.name, users.username, users.avatar, users.created_at, COUNT(likes.post_id) AS likes
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
        LEFT JOIN likes ON posts.id = likes.post_id
        WHERE posts.id = ${params.post} AND users.username = ${params.username}
        GROUP BY posts.id, users.id
    `;
    }else{
        post = await sql`
        SELECT posts.content, posts.created_at, posts.edited_at, users.name, users.username, users.avatar, users.created_at, COUNT(likes.post_id) AS likes,
        BOOL(MAX(case when likes.user_id = ${locals.user.id} then 1 else 0 end)) as liked
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
        LEFT JOIN likes ON posts.id = likes.post_id
        WHERE posts.id = ${params.post} AND users.username = ${params.username}
        GROUP BY posts.id, users.id
        `; 
    }
    if(post.length === 0){
        throw error(404, 'Post not found');
    }
    let repliesPromise: postgres.PendingQuery<Row[]>;
    if (!locals.user) {
        repliesPromise = sql`
        SELECT posts.content, posts.id, posts.created_at, posts.edited_at, users.name, users.username, users.avatar, users.created_at, COUNT(likes.post_id) AS likes
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
        LEFT JOIN likes ON posts.id = likes.post_id
        WHERE posts.reply_to = ${params.post}
        GROUP BY posts.id, users.id
        ORDER BY posts.created_at DESC
        `;        
    }else{
        repliesPromise = sql`
        SELECT posts.content, posts.id, posts.created_at, posts.edited_at, users.name, users.username, users.avatar, users.created_at, COUNT(likes.post_id) AS likes,
        BOOL(MAX(case when likes.user_id = ${locals.user.id} then 1 else 0 end)) as liked
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
        LEFT JOIN likes ON posts.id = likes.post_id
        WHERE posts.reply_to = ${params.post}
        GROUP BY posts.id, users.id
        ORDER BY posts.created_at DESC
        `;
    }


    return {
        post: {
            id: parseInt(params.post),
            content: post[0].content,
            created_at: post[0].created_at,
            edited_at: post[0].edited_at,
            likes: post[0].likes,
            liked: post[0].liked,
            user: {
                name: post[0].name,
                username: post[0].username,
                avatar: post[0].avatar,
                created_at: post[0].created_at
            },
        },
        streamed: {
            replies: new Promise<Post[]>((resolve, reject) => {
                repliesPromise.then((replies) => {
                    resolve(replies.map((reply) => {
                        reply.user = {
                            name: reply.name,
                            username: reply.username,
                            avatar: reply.avatar,
                            created_at: reply.created_at
                        };
                        return reply;
                    }) as Post[]);
                }).catch(reject);   
            })
        }
    };
}) satisfies PageServerLoad;
