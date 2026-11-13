// The Nudge assistant: a chat that can talk a student through how to approach a task
// and propose new tasks.
//
// The model never touches the database. It has two tools:
//   - list_open_tasks: read-only lookup of the student's open tasks (via a callback).
//   - propose_task: a draft task. The caller validates it, and the student sees it as a
//     card they can edit and add through POST /todos.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-5-5';
// Room for thinking plus a few paragraphs of advice.
const MAX_TOKENS = 4096;
const EFFORT = 'medium';
// Per API call. A turn makes at most MAX_STEPS calls.
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_STEPS = 4;
// Upcoming days spelled out in the prompt, so weekday names resolve to dates without
// the model doing calendar arithmetic.
const CALENDAR_DAYS = 21;
const MAX_LISTS_IN_PROMPT = 50;

// Thrown when the AI can't be used at all (no key, network, timeout, auth, rate limit,
// outage). The controller answers 503 and the rest of the app carries on.
export class AiUnavailableError extends Error {
    constructor(message, cause) {
        super(message, { cause });
        this.name = 'AiUnavailableError';
    }
}

export function isAiConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Created on first use so the server starts (and the rest of the app works) without a key.
let client = null;
function getClient() {
    if (!isAiConfigured()) {
        throw new AiUnavailableError('ANTHROPIC_API_KEY is not set');
    }
    client ??= new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 0,
    });
    return client;
}

// ---------- Tools ----------
// Strict schemas: every field is required (nullable where optional), and strict mode
// won't take null inside an enum, so nullable enums are unions.

const PROPOSE_TASK_TOOL = {
    name: 'propose_task',
    description: 'Show the student a task card they can review, edit and add to their list. Nothing is saved until they press Add. Call once per task.',
    strict: true,
    input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'due_date', 'priority', 'category', 'reminder_days_before', 'reminder_time'],
        properties: {
            title: {
                type: 'string',
                description: 'Short task title, without the date, priority, list or reminder wording. Keep the student\'s words; fix only obvious typos and capitalise the first letter.',
            },
            description: {
                type: ['string', 'null'],
                description: 'Extra details the student gave that are not part of the title, or null. Never invent details.',
            },
            due_date: {
                type: ['string', 'null'],
                description: 'Due date as YYYY-MM-DD, or null if the student did not give one.',
            },
            priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'high for urgent/important/asap/high priority, low for whenever/someday/no rush/low priority, otherwise medium.',
            },
            category: {
                type: 'string',
                description: 'List name. Prefer one of the student\'s existing lists; use "General" when nothing fits.',
            },
            reminder_days_before: {
                anyOf: [
                    { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6, 7] },
                    { type: 'null' },
                ],
                description: 'Days before the due date to send a reminder (0 = on the due date), or null for no reminder.',
            },
            reminder_time: {
                type: ['string', 'null'],
                description: 'Reminder time of day as HH:MM in 24-hour time, or null for the default (09:00).',
            },
        },
    },
};

const LIST_OPEN_TASKS_TOOL = {
    name: 'list_open_tasks',
    description: 'Look up the student\'s open (not completed) tasks: title, due date, list and priority. Use it when they refer to a task they already have ("my history essay", "what\'s due this week").',
    strict: true,
    input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['search'],
        properties: {
            search: {
                type: ['string', 'null'],
                description: 'Words to match in task titles, or null for all open tasks.',
            },
        },
    },
};

// 'YYYY-MM-DD' -> the next CALENDAR_DAYS days as "Wednesday 2026-11-11 (today)" lines.
// Dates are calendar days, so they're computed in UTC to avoid DST shifts.
function upcomingCalendar(today) {
    const start = new Date(`${today}T00:00:00Z`);
    const lines = [];
    for (let i = 0; i < CALENDAR_DAYS; i++) {
        const day = new Date(start);
        day.setUTCDate(start.getUTCDate() + i);
        const weekday = day.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        const label = i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : '';
        lines.push(`${weekday} ${day.toISOString().slice(0, 10)}${label}`);
    }
    return lines.join('\n');
}

function buildSystemPrompt({ today, timezone, lists }) {
    const listNames = lists.slice(0, MAX_LISTS_IN_PROMPT);
    return `You are the assistant inside Nudge, a to-do app for students. You help with two things:
1. Adding tasks. When the student asks you to add or remember something, or their message simply reads like a task ("chem quiz friday"), call propose_task, once per task. The student sees each one as a card and presses Add to save it, so never say a task has been added or saved: say you've put it below for them to check. If they ask for several tasks, propose each one.
2. Talking through how to approach a task: breaking it into steps, what to do first, rough time estimates, how to fit it in before the due date. Be concrete and brief: a short intro sentence and a few bullet points is usually right. Ask one clarifying question if you really need to. You may offer to turn the steps into tasks, but only call propose_task for them if the student says yes.

If the student mentions a task they already have, call list_open_tasks to see it rather than asking them to repeat it. Stay on studying, schoolwork and planning; for anything else, say briefly that it's outside what you can help with here.

Write plain text. You may use "- " bullets, "1. " numbered steps and **bold**. No headings, tables or code blocks.

Today is ${today} in the student's timezone (${timezone}). Upcoming days:
${upcomingCalendar(today)}

Rules for propose_task:
- Dates: resolve relative dates against today using the calendar above ("today", "tonight", "tmrw", "in 3 days", "in 2 weeks" = today + 14 days). A bare weekday ("friday") means the soonest such day on or after today, so it can be today. "next <weekday>" means the soonest such day after today, never today itself. "next week" with no day means the Monday of next week. A date with no year means the next time that date occurs. If the student gave no date, due_date is null. Never invent a due date.
- Lists: the student's existing lists are ${listNames.length > 0 ? listNames.map((name) => JSON.stringify(name)).join(', ') : '(none yet)'}. If the task clearly belongs to one (same subject or a close match, ignoring case), use its exact name. If the student explicitly names a list that doesn't exist ("add to my Spanish list"), use their name. Otherwise use "General".
- Reminders: only set one if the student asked ("remind me", "ping me"); otherwise both reminder fields are null. "the day before" = 1, "on the day" = 0, "a week before" = 7. A reminder needs a due date. reminder_time is 24-hour HH:MM ("8pm" = "20:00"); null if they gave no time.
- If propose_task returns an error, fix the fields and call it again, or ask the student.`;
}

// ---------- Chat turn ----------

// Runs one assistant turn.
//   history: [{ role: 'user' | 'assistant', content: string }], oldest first, ending
//            with the student's new message.
//   validateDraft(input) -> { draft } | { error }: checks a propose_task call.
//   listOpenTasks(search) -> [{ title, due_date, category, priority }]
//   onUsage(usage): called with each API response's token usage, for metering spend
//            (services/aiBudget.js). Awaited, so spend is recorded before moving on.
// Returns { text, drafts } where drafts are the validated task cards to show.
export async function runChat({ history, today, timezone, lists = [], validateDraft, listOpenTasks, onUsage }) {
    const anthropic = getClient();
    const system = buildSystemPrompt({ today, timezone, lists });
    const messages = history.map((m) => ({ role: m.role, content: m.content }));
    const textParts = [];
    const drafts = [];

    for (let step = 0; step < MAX_STEPS; step++) {
        const response = await callModel(anthropic, { system, messages });
        if (onUsage) await onUsage(response.usage);

        if (response.stop_reason === 'refusal') {
            return { text: "Sorry, I can't help with that one.", drafts };
        }
        for (const block of response.content) {
            if (block.type === 'text' && block.text.trim()) textParts.push(block.text.trim());
        }
        if (response.stop_reason !== 'tool_use') break;

        // Within a turn the full content (thinking blocks included) goes back unchanged.
        messages.push({ role: 'assistant', content: response.content });
        const toolResults = [];
        for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            toolResults.push(await runTool(block, { validateDraft, listOpenTasks, drafts }));
        }
        messages.push({ role: 'user', content: toolResults });
    }

    const text = textParts.join('\n\n')
        || (drafts.length > 0 ? 'Here you go. Check the details and press Add.' : "Sorry, I didn't catch that. Could you rephrase?");
    return { text, drafts };
}

async function callModel(anthropic, { system, messages }) {
    try {
        return await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            output_config: { effort: EFFORT },
            system,
            tools: [PROPOSE_TASK_TOOL, LIST_OPEN_TASKS_TOOL],
            tool_choice: { type: 'auto' },
            messages,
        });
    } catch (err) {
        if (err instanceof Anthropic.APIConnectionTimeoutError) {
            throw new AiUnavailableError('The AI request timed out', err);
        }
        if (err instanceof Anthropic.APIConnectionError) {
            throw new AiUnavailableError('Could not reach the AI service', err);
        }
        // Bad key, rate limit, overload or outage: not our bug, so fall back gracefully.
        // Anything else (e.g. a 400 from a malformed request) is a bug in this file and
        // goes to the error handler as a 500, with the API's message in the log.
        if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403 || err.status === 429 || err.status >= 500)) {
            throw new AiUnavailableError(`AI service error (${err.status})`, err);
        }
        throw err;
    }
}

// Runs one tool call and returns its tool_result block.
async function runTool(block, { validateDraft, listOpenTasks, drafts }) {
    const result = (content, isError = false) => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content,
        ...(isError && { is_error: true }),
    });

    if (block.name === 'propose_task') {
        const checked = validateDraft(block.input ?? {});
        if (checked.error) return result(`Not shown: ${checked.error}`, true);
        drafts.push(checked.draft);
        return result('Shown to the student as a card. It is NOT saved until they press Add.');
    }

    if (block.name === 'list_open_tasks') {
        const search = typeof block.input?.search === 'string' ? block.input.search : null;
        const tasks = await listOpenTasks(search);
        return result(tasks.length > 0 ? JSON.stringify(tasks) : 'No matching open tasks.');
    }

    return result(`Unknown tool ${block.name}`, true);
}
