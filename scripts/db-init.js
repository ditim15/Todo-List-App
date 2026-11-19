// Applies db/init.sql to DATABASE_URL. The file is idempotent, so this is safe to run on
// every deploy (Railway: Settings → Deploy → Pre-deploy command `npm run db:init`) and
// locally after pulling changes that add tables or columns.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
}

const sql = await readFile(new URL('../db/init.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
    await client.connect();
    await client.query(sql);
    console.log('Database schema is up to date (db/init.sql applied).');
} catch (err) {
    console.error('Applying db/init.sql failed:', err.message);
    process.exitCode = 1;
} finally {
    await client.end().catch(() => {});
}
