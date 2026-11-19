// Applies db/init.sql to DATABASE_URL. The file is idempotent, so this is safe to run on
// every deploy (Railway: Settings → Deploy → Pre-deploy command `npm run db:init`) and
// locally after pulling changes that add tables or columns.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. On Railway, add it as a reference to the Postgres service: ${{Postgres.DATABASE_URL}}.');
    process.exit(1);
}

// Where it's connecting, without the password, so a wrong reference is easy to spot.
function target(url) {
    try {
        const u = new URL(url);
        return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch {
        return '(DATABASE_URL is not a valid URL)';
    }
}

// Connection failures often have an empty message (Node's AggregateError when every
// address of the host failed), so include the codes of the underlying errors.
function describe(err) {
    const parts = [err?.message || err?.name || 'Unknown error'];
    if (err?.code) parts.push(`code=${err.code}`);
    if (Array.isArray(err?.errors)) {
        parts.push(`causes=[${err.errors.map((e) => `${e.code || ''} ${e.message || ''}`.trim()).join('; ')}]`);
    }
    return parts.join(' ');
}

const sql = await readFile(new URL('../db/init.sql', import.meta.url), 'utf8');
const where = target(process.env.DATABASE_URL);

// A database created moments ago may still be starting, so retry the connection a few
// times before giving up.
const ATTEMPTS = 5;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
    try {
        await client.connect();
    } catch (err) {
        await client.end().catch(() => {});
        console.error(`Could not connect to ${where} (attempt ${attempt}/${ATTEMPTS}): ${describe(err)}`);
        if (attempt === ATTEMPTS) process.exit(1);
        await sleep(3000);
        continue;
    }
    try {
        await client.query(sql);
        console.log(`Database schema is up to date (db/init.sql applied to ${where}).`);
    } catch (err) {
        console.error(`Applying db/init.sql to ${where} failed: ${describe(err)}`);
        process.exitCode = 1;
    } finally {
        await client.end().catch(() => {});
    }
    break;
}
