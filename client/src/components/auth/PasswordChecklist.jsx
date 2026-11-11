import { PASSWORD_RULES } from '../../auth/passwordRules';

// Live list of password requirements; each turns green with a check once met.
function PasswordChecklist({ password, id }) {
    return (
        <ul className="password-rules" id={id} aria-label="Password requirements">
            {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                    <li key={rule.id} className={met ? 'is-met' : undefined}>
                        <span className="password-rule-icon" aria-hidden="true">
                            {met ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                            ) : null}
                        </span>
                        {rule.label}
                        <span className="visually-hidden">{met ? ' (met)' : ' (not met yet)'}</span>
                    </li>
                );
            })}
        </ul>
    );
}

export default PasswordChecklist;
