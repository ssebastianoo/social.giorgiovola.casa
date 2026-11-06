// Usage: bun admin.ts <username> [--revoke]
// Makes an account an admin (or, with --revoke, a regular user again). Admins can reset
// passwords, make users mods and do everything mods can. Needs DATABASE_URL.
// With docker: docker compose exec web bun admin.ts <username>
import postgres from 'postgres';

// @ts-ignore bun globals aren't typed here
const args: string[] = Bun.argv.slice(2);
const revoke = args.includes('--revoke');
const username = args
	.find((a) => !a.startsWith('--'))
	?.replace(/^@/, '')
	.toLowerCase();

if (!username || args.some((a) => a.startsWith('--') && a !== '--revoke')) {
	console.error('Usage: bun admin.ts <username> [--revoke]');
	process.exit(1);
}

// @ts-ignore bun globals aren't typed here
const url: string | undefined = Bun.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => undefined });

try {
	const [user] = await sql<{ id: number; owner_id: number | null; role: string }[]>`
		SELECT id, owner_id, role FROM users WHERE username = ${username}
	`;
	if (!user) {
		console.error(`No user named @${username}`);
		process.exit(1);
	}
	// identities have no credentials of their own, roles belong to accounts
	if (user.owner_id !== null) {
		console.error(`@${username} is an identity: pick the account that owns it`);
		process.exit(1);
	}

	const role = revoke ? 'user' : 'admin';
	if (user.role === role) {
		console.log(`@${username} is already ${revoke ? 'not an admin' : 'an admin'}`);
	} else if (revoke && user.role !== 'admin') {
		console.log(`@${username} is not an admin (they are a ${user.role})`);
	} else {
		await sql`UPDATE users SET role = ${role} WHERE id = ${user.id}`;
		console.log(revoke ? `@${username} is no longer an admin` : `@${username} is now an admin`);
	}
} finally {
	await sql.end();
}
