import nodemailer from 'nodemailer';

// Email channel. The transport is picked from env vars (read on first send, after
// dotenv has loaded):
//
//   EMAIL_TRANSPORT=console   (default) print each email to the server log, send nothing
//   EMAIL_TRANSPORT=ethereal  send to a throwaway Ethereal inbox and log a preview URL;
//                             nothing reaches real inboxes (https://ethereal.email)
//   EMAIL_TRANSPORT=smtp      real delivery via SMTP_HOST, SMTP_PORT, SMTP_USER,
//                             SMTP_PASS, SMTP_SECURE ('true' for port 465)
//
// EMAIL_FROM sets the sender (default "Nudge <reminders@nudge.local>").
//
// Until sign-up verifies email addresses, keep this on console or ethereal: with smtp,
// anyone could register someone else's address and have reminders sent to it.

let transporterPromise = null;

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

// Sends one message: { to, subject, text, html }.
export async function sendEmail({ to, subject, text, html }) {
    const { mode, transporter } = await getTransporter();
    const from = process.env.EMAIL_FROM || 'Nudge <reminders@nudge.local>';
    const info = await transporter.sendMail({ from, to, subject, text, html });

    if (mode === 'console') {
        console.log(`[email] (console mode, not sent)\n  To: ${to}\n  Subject: ${subject}\n\n${text}\n`);
    } else if (mode === 'ethereal') {
        console.log(`[email] Sent to ${to}. Preview: ${nodemailer.getTestMessageUrl(info)}`);
    }
}
