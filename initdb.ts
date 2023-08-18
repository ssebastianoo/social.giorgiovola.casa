import postgres from 'postgres';

const url = process.env.DATABASE_URL || '';

const sql = postgres(url);

async function initDB() {
	await sql.file('src/schema.sql');
}

initDB().then(() => {
	console.log('Database initialized');
	process.exit(0);
});
