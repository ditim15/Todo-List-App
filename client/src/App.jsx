import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import { ThemeProvider } from './theme/ThemeContext';
import ThemeToggle from './components/ThemeToggle';
import Splash from './pages/Splash';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

// Wraps pages that have no top bar, giving them a floating light/dark toggle.
// The landing page and dashboard render their own toggle in their top bars.
function PublicLayout() {
    return (
        <>
            <ThemeToggle floating />
            <Outlet />
        </>
    );
}

// Top-level route table for the app.
function App() {
    return (
        // ThemeProvider is outermost so every page, including loading states, is themed.
        <ThemeProvider>
            {/* AuthProvider must wrap the router so every route (including ProtectedRoute) can read auth state. */}
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* The landing page has its own nav with a theme toggle. */}
                        <Route path="/" element={<Splash />} />
                        <Route element={<PublicLayout />}>
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<Register />} />
                            {/* Catch-all for unmatched routes. */}
                            <Route path="*" element={<NotFound />} />
                        </Route>
                        {/* Dashboard requires an authenticated session; ProtectedRoute redirects to /login otherwise. */}
                        <Route path="/dashboard" element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        }/>
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
