import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import NudgeLogo from '../components/brand/NudgeLogo';
import SiteFooter from '../components/SiteFooter';
import { FiltersMock, ListsMock, PlannerMock, PriorityMock, Strike } from '../components/landing/AppMocks';
import { CheckIcon } from '../components/landing/FeatureIcons';
import './static/Splash.css';

// Design direction: "warm and decisive" — a paper planner. Asymmetric editorial grid,
// one inverted ink band for rhythm, and one visual device: the hand-drawn strike line
// that crosses finished work out (also used once in the headline).

// Only features the sections below don't already show (deadlines, lists, priorities
// and filters each get their own preview further down).
const FEATURES = [
    {
        title: 'Reminders in your inbox',
        text: 'Pick the day of, a day before or a week before, and DoneYet? emails you at the time you choose.',
    },
    {
        title: 'An assistant that writes tasks for you',
        text: 'Type "chem quiz Friday, remind me the day before" and it drafts the task for you to add.',
    },
    {
        title: 'A month at a glance',
        text: 'Switch to the calendar to see how deadlines stack up before a heavy week arrives.',
    },
    {
        title: 'Quick add',
        text: 'Type it, pick a list and a date, press Add. Capture the task before the lecture ends.',
    },
];

const STEPS = [
    { title: 'Make a list for each class', text: 'Start with your courses, then add the club, the job, the rest.' },
    { title: 'Add work as it is assigned', text: 'Copy due dates straight from the syllabus and give each a priority.' },
    { title: 'Cross it off', text: 'Tick tasks as you finish them and watch each class fill up.' },
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
                            <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
                        ) : (
                            <>
                                <Link to="/login" className="text-link landing-login">Log in</Link>
                                <Link to="/register" className="btn btn-ghost btn-sm landing-signup">Sign up</Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                <section className="hero">
                    <div className="hero-inner">
                        <div className="hero-copy">
                            <p className="eyebrow">For students juggling five classes and a job</p>
                            <h1>
                                Every assignment this semester,{' '}
                                <span className="hero-strike">
                                    crossed off
                                    <Strike className="strike--headline" />
                                </span>{' '}
                                before it's due.
                            </h1>
                            <p className="hero-lead">
                                DoneYet? sorts every lab, essay and exam by class and priority, then tells you
                                what to work on next. No weekend of setup required.
                            </p>
                            <div className="hero-ctas">
                                <Link to={primaryCta.to} className="btn btn-primary btn-lg">{primaryCta.label}</Link>
                                <a href="#features" className="text-link">See what's inside</a>
                            </div>
                            <ul className="hero-points" aria-label="At a glance">
                                <li>Free to use</li>
                                <li>Phone and laptop</li>
                                <li>Light and dark mode</li>
                            </ul>
                        </div>
                        <div className="hero-visual">
                            <PlannerMock />
                        </div>
                    </div>
                </section>

                <section id="features" className="section section--features">
                    <div className="section-inner features">
                        <div className="features-heading reveal">
                            <p className="eyebrow">What's inside</p>
                            <h2>Built for how a student week actually goes</h2>
                            <p>
                                Lectures, labs, group projects and a job on the side. Each gets a place, without
                                you having to run a productivity system.
                            </p>
                        </div>
                        <ol className="feature-list">
                            {FEATURES.map(({ title, text }, i) => (
                                <li
                                    key={title}
                                    className="feature reveal"
                                    style={{ transitionDelay: `${(i % 2) * 80}ms` }}
                                >
                                    <span className="feature-number" aria-hidden="true">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section className="section section--band">
                    <div className="section-inner band reveal">
                        <div className="band-copy">
                            <p className="eyebrow">Stay ahead</p>
                            <h2>A gentle nudge toward what's next</h2>
                            <p>
                                Your dashboard leads with today and overdue, then shows how open work splits by
                                priority. No digging through syllabi the night before.
                            </p>
                            <ul className="check-list">
                                <Bullet>Overdue work is flagged in red, so it can't hide</Bullet>
                                <Bullet>"Coming up" lists your next deadlines across every class</Bullet>
                                <Bullet>The priority bar shows how much high-stakes work is left</Bullet>
                            </ul>
                        </div>
                        <div className="band-visual">
                            <PriorityMock />
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="section-inner lanes">
                        <figure className="lane lane--wide reveal">
                            <ListsMock />
                            <figcaption>
                                <h3>Every class in its own lane</h3>
                                <p>
                                    Group tasks by course, club or job. Click a list to focus on just that class,
                                    and rename lists as the semester changes.
                                </p>
                            </figcaption>
                        </figure>
                        <figure className="lane lane--narrow reveal" style={{ transitionDelay: '80ms' }}>
                            <FiltersMock />
                            <figcaption>
                                <h3>Cut through the noise in exam week</h3>
                                <p>
                                    Search, show only high priority, or pick a date range to see exactly what's
                                    due before finals.
                                </p>
                            </figcaption>
                        </figure>
                    </div>
                </section>

                <section id="how-it-works" className="section section--steps">
                    <div className="section-inner">
                        <div className="steps-heading reveal">
                            <p className="eyebrow">How it works</p>
                            <h2>Set up in minutes, not a weekend</h2>
                        </div>
                        <ol className="steps">
                            {STEPS.map((step, i) => (
                                <li
                                    key={step.title}
                                    className="step reveal"
                                    style={{ transitionDelay: `${i * 90}ms` }}
                                >
                                    <span className="step-number" aria-hidden="true">{i + 1}</span>
                                    <h3>{step.title}</h3>
                                    <p>{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section className="section section--cta">
                    <div className="section-inner cta reveal">
                        <h2>Add your first class in under a minute.</h2>
                        <div className="cta-actions">
                            <Link to={primaryCta.to} className="btn btn-primary btn-lg">{primaryCta.label}</Link>
                            {!isAuthenticated && (
                                <p>
                                    Already have an account? <Link to="/login" className="text-link">Log in</Link>
                                </p>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
}

export default Splash;
