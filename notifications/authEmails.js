import { sendEmail } from './channels/email.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function appUrl() {
    return (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
}

// Sends the "confirm your email" message with a one-time link to /verify-email.
export async function sendVerificationEmail({ name, email, token }) {
    const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    const firstName = (name || '').split(' ')[0] || 'there';

    const subject = 'Confirm your email for Nudge';
    const text = [
        `Hi ${firstName},`,
        '',
        'Thanks for signing up for Nudge. Confirm your email address to finish creating your account:',
        '',
        link,
        '',
        "This link expires in 24 hours. If you didn't sign up for Nudge, you can ignore this email.",
    ].join('\n');

    const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#14161b">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>Thanks for signing up for Nudge. Confirm your email address to finish creating your account.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Confirm email</a></p>
  <p style="color:#545b69;font-size:14px">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="color:#545b69;font-size:14px">This link expires in 24 hours. If you didn't sign up for Nudge, you can ignore this email.</p>
</div>`.trim();

    await sendEmail({ to: email, subject, text, html });
}

// Sends the "reset your password" message with a one-time link to /reset-password.
export async function sendPasswordResetEmail({ name, email, token }) {
    const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const firstName = (name || '').split(' ')[0] || 'there';

    const subject = 'Reset your Nudge password';
    const text = [
        `Hi ${firstName},`,
        '',
        'Someone (hopefully you) asked to reset the password for your Nudge account. Choose a new one here:',
        '',
        link,
        '',
        "This link expires in 1 hour and works once. If you didn't ask for this, you can ignore this email: your password won't change.",
    ].join('\n');

    const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#14161b">
  <p>Hi ${escapeHtml(firstName)},</p>
  <p>Someone (hopefully you) asked to reset the password for your Nudge account.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
  <p style="color:#545b69;font-size:14px">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="color:#545b69;font-size:14px">This link expires in 1 hour and works once. If you didn't ask for this, you can ignore this email: your password won't change.</p>
</div>`.trim();

    await sendEmail({ to: email, subject, text, html });
}
