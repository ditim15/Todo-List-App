import { Link } from 'react-router-dom';
import "./static/Splash.css";

// Public landing page; entry point for new visitors to register or log in.
function Splash() {
    return (
        <div className="splash-container">
            <h1>Todo App</h1>
            <p>Organize your day, one task at a time.</p>
            <div className="splash-links">
                <Link to="/register">Get Started</Link>
                <Link to="/login">Log In</Link>
            </div>
        </div>
    );
}

export default Splash;
