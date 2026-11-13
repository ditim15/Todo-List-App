// Caps on what the assistant can cost, so nobody can run up the Anthropic bill.
//
//   - Per user: at most AI_USER_DAILY_MESSAGES messages a day (default 50). This sits
//     on top of the short-term limit in routes/ai.js (20 per 10 minutes).
//   - App-wide: once the day's estimated spend reaches AI_DAILY_BUDGET_USD (default
//     $5), the assistant switches off until the next day. This bounds the total cost
//     however many accounts someone creates.
//
// Days are UTC. Spend is metered from the token counts the API reports on every call,
// so it also counts calls in turns that later fail.
import pool from '../db/pool.js';

// Claude Haiku 5.5 list prices in USD per million tokens, for prompts up to 100K tokens
// (this app's prompts are far smaller). Checked 2026-11; update them if pricing
// changes or services/ai.js switches model.
const PRICE_PER_MILLION_TOKENS = { input: 0.10, output: 0.50 };

const DEFAULT_USER_DAILY_MESSAGES = 50;
const DEFAULT_DAILY_BUDGET_USD = 5;

function positiveNumberFromEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function userDailyMessageLimit() {
    return Math.floor(positiveNumberFromEnv('AI_USER_DAILY_MESSAGES', DEFAULT_USER_DAILY_MESSAGES));
}

export function dailyBudgetUsd() {
    return positiveNumberFromEnv('AI_DAILY_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD);
}

export function estimateCostUsd({ inputTokens, outputTokens }) {
    return (Number(inputTokens) * PRICE_PER_MILLION_TOKENS.input
        + Number(outputTokens) * PRICE_PER_MILLION_TOKENS.output) / 1_000_000;
}

const TODAY_UTC = "(NOW() AT TIME ZONE 'UTC')::date";

// Today's estimated app-wide spend in USD.
export async function spentTodayUsd() {
    const result = await pool.query(
        `SELECT input_tokens, output_tokens FROM ai_spend_daily WHERE day = ${TODAY_UTC}`
    );
    const row = result.rows[0];
    return row ? estimateCostUsd({ inputTokens: row.input_tokens, outputTokens: row.output_tokens }) : 0;
}

// Reserves one of the user's messages for today. Returns false if they've used them
// all. The check and the increment are one statement, so parallel requests can't
// slip past the limit.
export async function claimUserMessage(userId) {
    const result = await pool.query(
        `INSERT INTO ai_usage (user_id, day, messages) VALUES ($1, ${TODAY_UTC}, 1)`
        + ' ON CONFLICT (user_id, day) DO UPDATE SET messages = ai_usage.messages + 1'
        + ' WHERE ai_usage.messages < $2'
        + ' RETURNING messages',
        [userId, userDailyMessageLimit()]
    );
    return result.rows.length > 0;
}

// Gives back a claimed message when the turn failed and the user got no reply.
export async function releaseUserMessage(userId) {
    await pool.query(
        `UPDATE ai_usage SET messages = GREATEST(messages - 1, 0) WHERE user_id = $1 AND day = ${TODAY_UTC}`,
        [userId]
    );
}

// Adds one API call's usage (the response's `usage` object) to today's spend. Cache
// reads and writes are counted as full-price input, which can only overestimate.
export async function recordUsage(usage) {
    const inputTokens = (usage?.input_tokens ?? 0)
        + (usage?.cache_creation_input_tokens ?? 0)
        + (usage?.cache_read_input_tokens ?? 0);
    const outputTokens = usage?.output_tokens ?? 0;
    await pool.query(
        `INSERT INTO ai_spend_daily (day, input_tokens, output_tokens) VALUES (${TODAY_UTC}, $1, $2)`
        + ' ON CONFLICT (day) DO UPDATE SET'
        + ' input_tokens = ai_spend_daily.input_tokens + $1, output_tokens = ai_spend_daily.output_tokens + $2',
        [inputTokens, outputTokens]
    );
}
