import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import ResendVerification from '../components/auth/ResendVerification';
import { NudgeLoader } from '../components/brand/NudgeLogo';

// Landing page for the emailed link (/verify-email?token=...). Confirms the address,
// which also logs the user in, then continues to the dashboard.
function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const { verifyEmail } = useAuth();
    const navigate = useNavigate();
    const [status, setStatus] = useState(token ? 'verifying' : 'error'); // 'verifying' | 'done' | 'error'
    const [error, setError] = useState(token ? '' : 'This verification link is missing its token.');
    // Tokens are single-use, so the request must not run twice (StrictMode re-runs effects).
    const started = useRef(false);

    useEffect(() => {
        if (!token || started.current) return;
        started.current = true;

        verifyEmail(token)
            .then(() => {
                setStatus('done');
                setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
            })
            .catch((err) => {
                setStatus('error');
                setError(err.message);
            });
    }, [token, verifyEmail, navigate]);

    if (status === 'verifying') {
        return <NudgeLoader label="Confirming your email" />;
    }

    return (
        <AuthLayout>
            <div className="auth-card auth-card--centered">
                {status === 'done' ? (
                    <>
                        <h1>Email confirmed</h1>
                        <p className="auth-subtitle">You're all set. Taking you to your dashboard...</p>
                        <p className="auth-footer">
                            <Link to="/dashboard" replace>Go now</Link>
                        </p>
                    </>
                ) : (
                    <>
                        <h1>Link didn't work</h1>
                        <p className="auth-subtitle">
                            {error} If you already confirmed your email, you can just log in.
                        </p>
                        <p className="auth-hint">Otherwise, enter your email to get a new link.</p>
                        <ResendVerification label="Send a new link" />
                        <p className="auth-footer">
                            <Link to="/login">Log in</Link>
                        </p>
                    </>
                )}
            </div>
        </AuthLayout>
    );
}

export default VerifyEmail;
