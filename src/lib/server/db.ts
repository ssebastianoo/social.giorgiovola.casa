import { env } from '$env/dynamic/private';
import postgres from 'postgres';

const sql = postgres(env.DATABASE_URL);

export { sql };
