import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import NudgeLogo from '../components/brand/NudgeLogo';
import HeroCarousel from '../components/landing/HeroCarousel';
import { FiltersMock, ListsMock, PriorityMock } from '../components/landing/AppMocks';
import {
    BoltIcon,
    CalendarIcon,
    CheckIcon,
    FlagIcon,
    ListsIcon,
    MoonIcon,
    SearchIcon,
} from '../components/landing/FeatureIcons';
import './static/Splash.css';

const FEATURES = [
    {
        Icon: CalendarIcon,
        title: 'Deadlines up front',
        text: "DoneYet? greets you with what's due today and what's overdue, so nothing sneaks up on you.",
    },
    {
        Icon: ListsIcon,
        title: 'A list per class',
        text: 'Biology, Calculus, your part-time job. Each gets its own list and progress bar.',
    },
    {
        Icon: FlagIcon,
        title: 'Priorities that mean something',
        text: 'Mark work high, medium or low and see the split at a glance.',
    },
    {
        Icon: SearchIcon,
        title: 'Search and filters',
        text: 'Narrow down by name, priority or a due-date range in a couple of clicks.',
    },
    {
        Icon: BoltIcon,
        title: 'Quick add',
        text: 'Type it, pick a list and a date, press Add. Capture tasks before you forget them.',
    },
    {
        Icon: MoonIcon,
        title: 'Easy on late nights',
        text: 'A dark mode built for 1am study sessions, and a light one for the library.',
    },
];

const STEPS = [
    { title: 'Make a list for each class', text: 'Start with your courses, then add anything else on your plate.' },
    { title: 'Add work as it is assigned', text: 'Give each task a due date and a priority straight from the syllabus.' },
    { title: 'Let DoneYet? keep you on track', text: 'Check things off, watch your progress fill up, and see what needs you next.' },
];

function Bullet({ children }) {
    return (
        <li>
            <span className="bullet-icon"><CheckIcon /></span>
            {children}
        </li>
    );
}

// Public landing page, pitched at students. Sections fade in as they scroll into view.
function Splash() {
    const { isAuthenticated } = useAuth();
    const pageRef = useRef(null);

    // Reveal-on-scroll: elements with .reveal get .is-visible once they enter the
    // viewport. Shown immediately without IntersectionObserver or with reduced motion.
    useEffect(() => {
        const elements = pageRef.current.querySelectorAll('.reveal');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (reduce || !('IntersectionObserver' in window)) {
            elements.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
        );
        elements.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const primaryCta = isAuthenticated
        ? { to: '/dashboard', label: 'Open your dashboard' }
        : { to: '/register', label: 'Get started free' };

    return (
        <div className="landing" ref={pageRef}>
            <header className="landing-nav">
                <div className="landing-nav-inner">
                    <Link to="/" className="landing-brand">
                        <NudgeLogo animate="intro" />
                    </Link>
                    <nav className="landing-links" aria-label="Page sections">
                        <a href="#features">Features</a>
                        <a href="#how-it-works">How it works</a>
                    </nav>
                    <div className="landing-actions">
                        <ThemeToggle />
                        {isAuthenticated ? (
                            <Link to="/dashboard" className="btn btn-primary btn-sm">Dashboard</Link>
                        ) : (
                            <>
                                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                                <Link to="/register" className="btn btn-primary btn-sm landing-signup">Sign up</Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                <section className="hero">
                    <div className="hero-inner">
                        <div className="hero-copy">
                            <span className="eyebrow">Built for students</span>
                            <h1>
                                Your semester, <span className="hero-highlight">finally under control.</span>
                            </h1>
                            <p className="hero-lead">
                                DoneYet? keeps every assignment, exam and deadline in one calm place, sorted by
                                class and priority, with a gentle reminder of what to work on next.
                            </p>
                            <div className="hero-ctas">
                                <Link to={primaryCta.to} className="btn btn-primary btn-lg">{primaryCta.label}</Link>
                                <a href="#features" className="btn btn-ghost btn-lg">See how it works</a>
                            </div>
                            <ul className="hero-points">
                                <Bullet>Free to use</Bullet>
                                <Bullet>Works on any device</Bullet>
                                <Bullet>Light and dark mode</Bullet>
                            </ul>
                        </div>
                        <div className="hero-visual">
                            <HeroCarousel />
                        </div>
                    </div>
                </section>

                <section id="features" className="section">
                    <div className="section-inner">
                        <div className="section-heading reveal">
                            <span className="eyebrow">Features</span>
                            <h2>Built for how students actually work</h2>
                            <p>
                                Lectures, labs, group projects and a job on the side. DoneYet? gives each its place
                                without making you manage a complicated system.
                            </p>
                        </div>
                        <div className="feature-grid">
                            {FEATURES.map(({ Icon, title, text }, i) => (
                                <article
                                    key={title}
                                    className="feature-card reveal"
                                    style={{ transitionDelay: `${(i % 3) * 70}ms` }}
                                >
                                    <span className="feature-icon"><Icon /></span>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="section section--alt">
                    <div className="section-inner showcase">
                        <div className="showcase-row reveal">
                            <div className="showcase-copy">
                                <span className="eyebrow">Stay ahead</span>
                                <h2>A gentle nudge toward what's next</h2>
                                <p>
                                    Your dashboard leads with what's due today and what's overdue, then shows
                                    how your open work splits by priority. No digging through syllabi the
                                    night before.
                                </p>
                                <ul className="check-list">
                                    <Bullet>Overdue work is flagged in red, so it can't hide</Bullet>
                                    <Bullet>A "Coming up" panel shows your next deadlines across every class</Bullet>
                                    <Bullet>The priority breakdown shows how much high-stakes work is left</Bullet>
                                </ul>
                            </div>
                            <div className="showcase-visual">
                                <PriorityMock />
                            </div>
                        </div>

                        <div className="showcase-row showcase-row--flip reveal">
                            <div className="showcase-copy">
                                <span className="eyebrow">Stay organized</span>
                                <h2>Every class in its own lane</h2>
                                <p>
                                    Group tasks into lists for each course, club or job. Progress bars show
                                    how far along you are, and you can rename lists as your semester changes.
                                </p>
                                <ul className="check-list">
                                    <Bullet>Click a list to focus on just that class</Bullet>
                                    <Bullet>Rename or merge lists anytime</Bullet>
                                    <Bullet>Edit due dates, priorities and notes inline</Bullet>
                                </ul>
                            </div>
                            <div className="showcase-visual">
                                <ListsMock />
                            </div>
                        </div>

                        <div className="showcase-row reveal">
                            <div className="showcase-copy">
                                <span className="eyebrow">Exam season</span>
                                <h2>Cut through the noise when it matters</h2>
                                <p>
                                    Search by name, show only high-priority work, or pick a date range to see
                                    exactly what's due before finals.
                                </p>
                                <ul className="check-list">
                                    <Bullet>Filters stack, and one click clears them</Bullet>
                                    <Bullet>Finished work moves to its own Completed section</Bullet>
                                </ul>
                            </div>
                            <div className="showcase-visual">
                                <FiltersMock />
                            </div>
                        </div>
                    </div>
                </section>

                <section id="how-it-works" className="section">
                    <div className="section-inner">
                        <div className="section-heading reveal">
                            <span className="eyebrow">How it works</span>
                            <h2>Set up in minutes, not a weekend</h2>
                        </div>
                        <ol className="steps">
                            {STEPS.map((step, i) => (
                                <li
                                    key={step.title}
                                    className="step reveal"
                                    style={{ transitionDelay: `${i * 90}ms` }}
                                >
                                    <span className="step-number">{i + 1}</span>
                                    <h3>{step.title}</h3>
                                    <p>{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section className="section section--cta">
                    <div className="section-inner">
                        <div className="cta-card reveal">
                            <h2>Start your semester with a nudge</h2>
                            <p>Create an account and add your first class in under a minute. We'll keep track from there.</p>
                            <div className="hero-ctas">
                                <Link to={primaryCta.to} className="btn btn-primary btn-lg">{primaryCta.label}</Link>
                                {!isAuthenticated && (
                                    <Link to="/login" className="btn btn-ghost btn-lg">I already have an account</Link>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <span>© {new Date().getFullYear()} DoneYet? · Gentle reminders for busy students</span>
                    <nav aria-label="Footer">
                        <a href="#features">Features</a>
                        <a href="#how-it-works">How it works</a>
                        <Link to="/login">Log in</Link>
                        <Link to="/register">Sign up</Link>
                        <Link to="/privacy">Privacy</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}

export default Splash;
