import nodemailer from 'nodemailer';

// Email channel. The transport is picked from env vars (read on first send, after
// dotenv has loaded):
//
//   EMAIL_TRANSPORT=console   (default) print each email to the server log, send nothing
//   EMAIL_TRANSPORT=ethereal  send to a throwaway Ethereal inbox and log a preview URL;
//                             nothing reaches real inboxes (https://ethereal.email)
//   EMAIL_TRANSPORT=memory    keep each email in `sentEmails` and print nothing (tests)
//   EMAIL_TRANSPORT=smtp      real delivery via SMTP_HOST, SMTP_PORT, SMTP_USER,
//                             SMTP_PASS, SMTP_SECURE ('true' for port 465)
//
// EMAIL_FROM sets the sender (default "DoneYet? <reminders@doneyet.local>").
//
// Reminders only go to verified addresses; verification emails go to whatever address
// someone signs up with (that's how ownership gets proven).

// Emails "sent" in memory mode, oldest first. The tests read links out of them.
export const sentEmails = [];

let transporterPromise = null;

const SMTP_TIMEOUT_MS = 10_000;

// A one-line description of a failed send for the server log. Connection failures
// often have an empty `message` (e.g. Node's AggregateError when every address of the
// host timed out), so this adds the error code, the SMTP command that failed and the
// server's reply. Never includes credentials.
export function describeEmailError(err) {
    const parts = [err?.message || err?.name || 'Unknown error'];
    if (err?.code) parts.push(`code=${err.code}`);
    if (err?.command) parts.push(`command=${err.command}`);
    if (err?.responseCode) parts.push(`responseCode=${err.responseCode}`);
    if (err?.response) parts.push(`response=${JSON.stringify(err.response)}`);
    if (Array.isArray(err?.errors)) {
        parts.push(`causes=[${err.errors.map((e) => `${e.code || ''} ${e.message || ''}`.trim()).join('; ')}]`);
    }
    if ((err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED' || err?.code === 'ESOCKET' || err?.code === 'ECONNECTION')
        && process.env.SMTP_HOST) {
        parts.push(`(could not reach ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}; check SMTP_HOST/SMTP_PORT, or whether your network blocks that port)`);
    }
    return parts.join(' ');
}

async function createTransporter() {
    const mode = (process.env.EMAIL_TRANSPORT || 'console').toLowerCase();

    if (mode === 'smtp') {
        return {
            mode,
            transporter: nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: process.env.SMTP_USER
                    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                    : undefined,
                // Fail within seconds if the server can't be reached, instead of
                // nodemailer's multi-minute defaults (sign-up waits on the send).
                connectionTimeout: SMTP_TIMEOUT_MS,
                greetingTimeout: SMTP_TIMEOUT_MS,
                socketTimeout: SMTP_TIMEOUT_MS,
            }),
        };
    }

    if (mode === 'ethereal') {
        const account = await nodemailer.createTestAccount();
        console.log(`[email] Using Ethereal test inbox ${account.user}`);
        return {
            mode,
            transporter: nodemailer.createTransport({
                host: account.smtp.host,
                port: account.smtp.port,
                secure: account.smtp.secure,
                auth: { user: account.user, pass: account.pass },
            }),
        };
    }

    if (mode === 'memory') {
        return { mode, transporter: nodemailer.createTransport({ jsonTransport: true }) };
    }

    // console: build the message but don't send it anywhere.
    return { mode: 'console', transporter: nodemailer.createTransport({ jsonTransport: true }) };
}

function getTransporter() {
    if (!transporterPromise) {
        transporterPromise = createTransporter().catch((err) => {
            transporterPromise = null; // let the next send try again
            throw err;
        });
    }
    return transporterPromise;
}

// Sends one message: { to, subject, text, html, replyTo? }. `replyTo` makes the
// recipient's Reply button answer someone other than EMAIL_FROM (the contact form uses
// it so support can reply straight to the person who wrote in).
export async function sendEmail({ to, subject, text, html, replyTo }) {
    const { mode, transporter } = await getTransporter();
    const from = process.env.EMAIL_FROM || 'DoneYet? <reminders@doneyet.local>';
    const info = await transporter.sendMail({ from, to, subject, text, html, replyTo });

    if (mode === 'memory') {
        sentEmails.push({ to, subject, text, html, replyTo });
    } else if (mode === 'console') {
        console.log(`[email] (console mode, not sent)\n  To: ${to}\n  Subject: ${subject}\n\n${text}\n`);
    } else if (mode === 'ethereal') {
        console.log(`[email] Sent to ${to}. Preview: ${nodemailer.getTestMessageUrl(info)}`);
    }
}
