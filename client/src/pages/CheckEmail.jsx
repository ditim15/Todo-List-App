import { Link, useLocation } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import ResendVerification from '../components/auth/ResendVerification';
import { MailIcon } from '../components/auth/AuthIcons';

// Shown after registering: tells the user to click the link we emailed them.
// The address comes from Register via router state; if the page is opened directly,
// the resend form asks for it instead.
function CheckEmail() {
    const { state } = useLocation();
    const email = state?.email;
    const emailSent = state?.emailSent !== false;

    return (
        <AuthLayout>
            <div className="auth-card auth-card--centered">
                <span className="auth-icon"><MailIcon /></span>
                <h1>Check your email</h1>
                {email ? (
                    <p className="auth-subtitle">
                        {emailSent ? 'We sent a confirmation link to ' : "We couldn't send the confirmation email to "}
                        <strong className="auth-email">{email}</strong>
                        {emailSent ? '. Click it to finish creating your account.' : '. Try sending it again below.'}
                    </p>
                ) : (
                    <p className="auth-subtitle">
                        We sent you a confirmation link. Click it to finish creating your account.
                    </p>
                )}
                <p className="auth-hint">
                    The link expires in 24 hours. Can't find it? Check your spam folder, or send a new one.
                </p>
                <ResendVerification email={email} />
                <p className="auth-footer">
                    Wrong address? <Link to="/register">Sign up again</Link>
                </p>
            </div>
        </AuthLayout>
    );
}

export default CheckEmail;
