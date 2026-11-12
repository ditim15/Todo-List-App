import { Link } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';

// Before launch: replace with an inbox you actually read, and update LAST_UPDATED
// whenever this page changes.
const CONTACT_EMAIL = 'privacy@example.com';
const LAST_UPDATED = 'November 11, 2026';

// Plain-language privacy policy. It describes what this codebase actually does; if a
// feature changes what's collected or who it's shared with, update this page too.
function Privacy() {
    return (
        <AuthLayout>
            <article className="auth-card legal">
                <h1>Privacy Policy</h1>
                <p className="legal-updated">Last updated {LAST_UPDATED}</p>

                <p>
                    Nudge is a task and reminder app for students. This page explains what we collect,
                    why, who it's shared with, and how to delete it.
                </p>

                <h2>What we collect</h2>
                <ul>
                    <li><strong>Account details:</strong> your name, email address, and your password (stored only as a one-way hash, never in readable form).</li>
                    <li><strong>Your tasks:</strong> titles, notes, due dates, priorities, list names and reminder settings, including the timezone your reminders use.</li>
                    <li><strong>Assistant chats:</strong> if you use the assistant, your messages and its replies, so the conversation is there when you come back.</li>
                    <li><strong>Sign-in data:</strong> a login cookie (see below) and records of your active sessions so they can be ended.</li>
                </ul>
                <p>We don&apos;t use advertising, analytics or tracking tools, and we don&apos;t sell your data.</p>

                <h2>Why we use it</h2>
                <ul>
                    <li>To run your account and show you your tasks.</li>
                    <li>To send the emails you ask for: confirming your address, resetting your password, and task reminders.</li>
                    <li>To answer you in the assistant.</li>
                    <li>To keep the service secure, for example by limiting repeated login attempts.</li>
                </ul>

                <h2>Who it&apos;s shared with</h2>
                <ul>
                    <li>
                        <strong>Anthropic (AI assistant):</strong> when you message the assistant, your message, recent chat
                        history, your list names, today&apos;s date and your timezone are sent to Anthropic&apos;s API to
                        generate a reply. If the assistant looks up your tasks, the title, due date, list and
                        priority of your open tasks are sent too. Completed tasks, task notes, your name and your
                        email are never sent. If you don&apos;t use the assistant, nothing is sent to Anthropic.
                    </li>
                    <li><strong>Our email provider</strong>, to deliver the emails listed above.</li>
                    <li><strong>Our hosting and database providers</strong>, which store and run the service for us.</li>
                </ul>
                <p>We share data with these providers only so they can do these jobs, and otherwise only if the law requires it.</p>

                <h2>Cookies and local storage</h2>
                <p>
                    We use one cookie, which keeps you logged in. It can&apos;t be read by scripts on the page, is only
                    sent to our login service, and lasts up to 7 days. Your browser&apos;s local storage remembers your
                    theme, task view and assistant layout, and whether you were logged in (not your login itself).
                    None of this is used for tracking.
                </p>

                <h2>How long we keep it</h2>
                <ul>
                    <li>Your account, tasks and lists are kept until you delete them or delete your account.</li>
                    <li>The assistant keeps your latest 200 messages. You can clear the chat at any time.</li>
                    <li>Login sessions expire after 7 days. Email links expire after 1 hour (password reset) or 24 hours (email confirmation).</li>
                </ul>

                <h2>Your choices</h2>
                <ul>
                    <li>Edit or delete any task, and clear your assistant chat, at any time.</li>
                    <li>
                        Delete your account from <Link to="/account">Account settings</Link>. This permanently deletes your
                        account, tasks, reminders and chat history right away.
                    </li>
                    <li>For a copy of your data, or any other question, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</li>
                </ul>

                <h2>Children</h2>
                <p>
                    Nudge isn&apos;t intended for children under 13, and we don&apos;t knowingly collect their data. If you
                    think a child under 13 has an account, contact us and we&apos;ll delete it.
                </p>

                <h2>Changes</h2>
                <p>If this policy changes, we&apos;ll update the date at the top of this page.</p>

                <h2>Contact</h2>
                <p>Questions about your privacy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
            </article>
        </AuthLayout>
    );
}

export default Privacy;
