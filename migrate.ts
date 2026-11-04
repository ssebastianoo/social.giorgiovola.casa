// Applies the pending migrations in ./drizzle. Run on every start of the container
// (see the Dockerfile) and by hand with `bun migrate.ts` / `bun run db:migrate`.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationsFolder = 'drizzle';
const client = postgres(url, { max: 1, onnotice: () => undefined });
const db = drizzle(client);

/**
 * Databases created before migrations existed (with the old src/schema.sql) already have every
 * table of the first migration. Record that migration as applied so it is not run again;
 * everything after it is applied normally.
 */
async function baselineLegacyDatabase() {
	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`);
	const [{ applied }] = await db.execute<{ applied: number }>(
		sql`SELECT COUNT(*)::int AS applied FROM drizzle.__drizzle_migrations`
	);
	if (applied > 0) return;

	const [{ legacy }] = await db.execute<{ legacy: boolean }>(
		sql`SELECT to_regclass('public.users') IS NOT NULL AS legacy`
	);
	if (!legacy) return;

	const [first] = readMigrationFiles({ migrationsFolder });
	await db.execute(sql`
		INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
		VALUES (${first.hash}, ${first.folderMillis})
	`);
	console.log('Existing database detected, baselined the initial migration');
}

try {
	await baselineLegacyDatabase();
	await migrate(db, { migrationsFolder });
	console.log('Database migrated');
} finally {
	await client.end();
}
