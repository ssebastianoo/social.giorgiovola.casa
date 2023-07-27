import { randomBytes, pbkdf2 } from 'crypto';

function hashPasswordPromise(
	password: string,
	salt: string
): Promise<{ salt: string; hash: string }> {
	return new Promise((resolve, reject) => {
		pbkdf2(password, salt, 1000, 64, `sha512`, (err, hash) => {
			if (err) return reject(err);
			else return resolve({ salt, hash: hash.toString('hex') });
		});
	});
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex');
	return await hashPasswordPromise(password, salt);
}

export async function verifyPassword(password: string, salt: string, hash: string) {
	const res = await hashPasswordPromise(password, salt);
	return hash === res.hash;
}
