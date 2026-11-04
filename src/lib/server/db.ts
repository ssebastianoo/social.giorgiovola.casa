import { DATABASE_URL } from '$app/env/private';
import postgres from 'postgres';

// DATABASE_URL is required at runtime (validated in src/env.ts), empty only during `vite build`
const sql = postgres(DATABASE_URL);

export { sql };
