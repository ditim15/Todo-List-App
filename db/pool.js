import pg from "pg";
import "dotenv/config";

const { Pool, types } = pg;

// Return DATE columns (e.g. todos.due_date) as plain 'YYYY-MM-DD' strings. By default pg
// converts them to JS Dates at server-local midnight, which can shift the day once
// serialized to UTC JSON.
types.setTypeParser(types.builtins.DATE, (value) => value);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export default pool;