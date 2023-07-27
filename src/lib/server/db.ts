import postgres from 'postgres';

const sql = postgres({
	host: '127.0.0.1',
	port: 4050,
	database: 'postgres',
	username: 'postgres',
	password: 'giorgiovola'
});

export { sql };
