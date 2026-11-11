// Password requirements, shown as a live checklist on the register form. The server
// enforces the same rules (utils/validation.js); keep the two in sync.
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_RULES = [
    { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
    { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
    { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
    { id: 'symbol', label: 'A symbol (e.g. !@#)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function passwordMeetsRules(password) {
    return PASSWORD_RULES.every((rule) => rule.test(password));
}
