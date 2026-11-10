import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import { ThemeProvider } from './theme/ThemeContext';
import Splash from './pages/Splash';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

// Top-level route table for the app.
function App() {
    return (
        // ThemeProvider is outermost so every page, including loading states, is themed.
        <ThemeProvider>
            {/* AuthProvider must wrap the router so every route (including ProtectedRoute) can read auth state. */}
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        {/* Every page renders its own top bar with a theme toggle; Login, Register
                            and Not Found share theirs via components/auth/AuthLayout. */}
                        <Route path="/" element={<Splash />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        {/* Catch-all for unmatched routes. */}
                        <Route path="*" element={<NotFound />} />
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
