// Runs the assistant against scripts/ai-parse-cases.json and prints pass/fail per field.
// Each case is a fresh one-message chat. Open tasks and lists come from the cases file,
// not the database. Calls the real API (Claude Haiku 5.5, 30 short conversations).
//
//   npm run eval:ai            # all cases
//   npm run eval:ai -- tmrw    # only cases whose id contains "tmrw"
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { isAiConfigured, runChat } from '../services/ai.js';
import { toDraft } from '../controllers/ai.controller.js';

dotenv.config({ path: './.env', quiet: true });

const DEFAULT_REMINDER_TIME = '09:00';

// Compares one expected field with the run's result. Returns [passed, actual].
function checkField(field, expected, { drafts, usedOpenTasks }) {
    const draft = drafts[0] ?? {};
    switch (field) {
        case 'no_draft':
            return [drafts.length === 0, `${drafts.length} card(s)`];
        case 'draft_count':
            return [drafts.length === expected, drafts.length];
        case 'uses_open_tasks':
            return [usedOpenTasks === expected, usedOpenTasks];
        case 'title_includes': {
            const title = draft.title ?? '';
            return [title.toLowerCase().includes(expected.toLowerCase()), title];
        }
        case 'reminder_time': {
            // The API stores 09:00 when a reminder has no time, so null and 09:00 are equal.
            const actual = draft.reminder_days_before !== null && draft.reminder_days_before !== undefined
                ? (draft.reminder_time ?? DEFAULT_REMINDER_TIME)
                : draft.reminder_time ?? null;
            return [actual === expected, actual];
        }
        default: {
            if (drafts.length === 0) return [false, 'no card'];
            const actual = draft[field] ?? null;
            return [actual === expected, actual];
        }
    }
}

async function main() {
    if (!isAiConfigured()) {
        console.error('ANTHROPIC_API_KEY is not set (add it to .env). Nothing was run.');
        process.exit(1);
    }

    const suite = JSON.parse(await readFile(new URL('./ai-parse-cases.json', import.meta.url), 'utf8'));
    const filter = process.argv[2];
    const cases = suite.cases.filter((c) => !filter || c.id.includes(filter));

    let fieldsPassed = 0;
    let fieldsTotal = 0;
    let casesPassed = 0;
    let rejectedProposals = 0;
    const failures = [];

    for (const testCase of cases) {
        let usedOpenTasks = false;
        let result;
        try {
            result = await runChat({
                history: [{ role: 'user', content: testCase.text }],
                today: suite.today,
                timezone: suite.timezone,
                lists: suite.lists,
                // Same validation the endpoint uses; count proposals it would reject.
                validateDraft: (raw) => {
                    const checked = toDraft(raw, suite.timezone);
                    if (checked.error) rejectedProposals++;
                    return checked;
                },
                listOpenTasks: async () => {
                    usedOpenTasks = true;
                    return suite.open_tasks;
                },
            });
        } catch (err) {
            console.log(`\nFAIL ${testCase.id}: "${testCase.text}"\n  error: ${err.name}: ${err.message}`);
            fieldsTotal += Object.keys(testCase.expect).length;
            failures.push(`${testCase.id} (request failed)`);
            continue;
        }

        const results = Object.entries(testCase.expect).map(([field, expected]) => {
            const [passed, actual] = checkField(field, expected, { drafts: result.drafts, usedOpenTasks });
            return { field, expected, actual, passed };
        });
        const allPassed = results.every((r) => r.passed);
        fieldsTotal += results.length;
        fieldsPassed += results.filter((r) => r.passed).length;
        if (allPassed) casesPassed++;
        else failures.push(testCase.id);

        console.log(`\n${allPassed ? 'PASS' : 'FAIL'} ${testCase.id}: "${testCase.text}"`);
        for (const r of results) {
            const detail = r.passed ? JSON.stringify(r.actual) : `expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`;
            console.log(`  ${r.passed ? 'ok  ' : 'FAIL'} ${r.field}: ${detail}`);
        }
        if (!allPassed) console.log(`  reply: ${result.text.replace(/\s+/g, ' ').slice(0, 200)}`);
    }

    const pct = (n, d) => (d === 0 ? '0' : ((100 * n) / d).toFixed(1));
    console.log('\n----------------------------------------');
    console.log(`Cases:  ${casesPassed}/${cases.length} fully correct (${pct(casesPassed, cases.length)}%)`);
    console.log(`Fields: ${fieldsPassed}/${fieldsTotal} correct (${pct(fieldsPassed, fieldsTotal)}%)`);
    console.log(`Task proposals rejected by validation (the model then retried or asked): ${rejectedProposals}`);
    if (failures.length > 0) console.log(`Failed: ${failures.join(', ')}`);
}

main();
