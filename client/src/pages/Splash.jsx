import { Link } from 'react-router-dom';
import "./Splash.css";

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