import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import Splash from './pages/Splash';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

// Top-level route table for the app.
function App() {
    return (
        // AuthProvider must wrap the router so every route (including ProtectedRoute) can read auth state.
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Splash />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    {/* Dashboard requires an authenticated session; ProtectedRoute redirects to /login otherwise. */}
                    <Route path="/dashboard" element={
                        <ProtectedRoute>
                            <Dashboard />
                        </ProtectedRoute>
                    }/>
                    {/* Catch-all for unmatched routes. */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
