import { apiRequest } from "./client";

// Contact form (server: controllers/contact.controller.js). Works signed in or out.
// `website` is the hidden honeypot field; real visitors leave it empty.
export function sendContactMessage({ name, email, topic, message, website }) {
    return apiRequest('/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, topic, message, website }),
    });
}
