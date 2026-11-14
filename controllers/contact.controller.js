import { describeEmailError, sendEmail } from '../notifications/channels/email.js';
import { isValidEmailFormat, normalizeEmail } from '../utils/validation.js';

// Contact form: emails the message to the support inbox, with Reply-To set to the
// sender so support can answer from their mail app. Nothing is stored.
//
// Anyone can call this (signed in or not), so it is rate limited per IP in
// routes/contact.js, never emails the address the visitor typed (that would let
// strangers use us to send mail to anyone), and drops submissions that fill the hidden
// "website" field, which only bots see.

export const CONTACT_TOPICS = ['Question', 'Bug report', 'Feature idea', 'Account help', 'Other'];
export const NAME_MAX = 100;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;

const SUCCESS = { message: 'Thanks! Your message is on its way.' };

function supportAddress() {
    return process.env.SUPPORT_EMAIL || 'support@doneyet.app';
}

// Contact messages come from the support address rather than EMAIL_FROM (reminders@),
// so they're easy to tell apart from reminders and account emails in the inbox.
function contactSender() {
    return process.env.CONTACT_FROM || `DoneYet? Contact form <${supportAddress()}>`;
}

// Collapses whitespace (including line breaks) so a value can't add lines to the
// email subject or headers.
function singleLine(value) {
    return String(value).replace(/\s+/g, ' ').trim();
}

const submitContact = async (req, res, next) => {
    try {
        const body = req.body ?? {};

        // Honeypot filled in: answer as if it worked so bots don't learn to skip it.
        if (typeof body.website === 'string' && body.website.trim() !== '') {
            return res.status(200).json(SUCCESS);
        }

        const name = typeof body.name === 'string' ? singleLine(body.name) : '';
        const email = normalizeEmail(body.email);
        const topic = CONTACT_TOPICS.includes(body.topic) ? body.topic : 'Other';
        const message = typeof body.message === 'string' ? body.message.trim() : '';

        if (!name) {
            return res.status(400).json({ message: 'Please tell us your name' });
        }
        if (name.length > NAME_MAX) {
            return res.status(400).json({ message: `Name must be ${NAME_MAX} characters or fewer` });
        }
        if (!isValidEmailFormat(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address so we can reply' });
        }
        if (message.length < MESSAGE_MIN) {
            return res.status(400).json({ message: `Please write at least ${MESSAGE_MIN} characters` });
        }
        if (message.length > MESSAGE_MAX) {
            return res.status(400).json({ message: `Message must be ${MESSAGE_MAX} characters or fewer` });
        }

        const preview = singleLine(message).slice(0, 60);
        try {
            await sendEmail({
                from: contactSender(),
                to: supportAddress(),
                replyTo: `${name.replace(/["<>]/g, '')} <${email}>`,
                subject: `[Contact] ${topic}: ${preview}${message.length > 60 ? '…' : ''}`,
                // Plain text only: the visitor's words are never rendered as HTML.
                text: [
                    `From: ${name} <${email}>`,
                    `Topic: ${topic}`,
                    `Sent: ${new Date().toISOString()}`,
                    '',
                    message,
                    '',
                    '-- ',
                    'Sent from the DoneYet? contact form. Reply to this email to answer them.',
                ].join('\n'),
            });
        } catch (err) {
            console.error('[contact] Failed to send contact message:', describeEmailError(err));
            return res.status(502).json({
                message: `We couldn't send your message right now. Please try again, or email ${supportAddress()}.`,
            });
        }

        res.status(200).json(SUCCESS);
    } catch (err) {
        next(err);
    }
};

export { submitContact };
