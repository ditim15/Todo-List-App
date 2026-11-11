import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { NudgeLoader } from '../components/brand/NudgeLogo';

// Route guard: renders children only when authenticated, otherwise redirects to /login.
// While the initial session-restore check (AuthContext) is still running, shows a loading
// state instead of redirecting, to avoid bouncing a logged-in user to /login on refresh.
function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <NudgeLoader />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

export default ProtectedRoute;
