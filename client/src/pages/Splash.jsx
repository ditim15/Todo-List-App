import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import NudgeLogo from '../components/brand/NudgeLogo';
import SiteFooter from '../components/SiteFooter';
import { FiltersMock, ListsMock, PlannerMock, Strike, TodayMock } from '../components/landing/AppMocks';
import { CheckIcon } from '../components/landing/FeatureIcons';
import './static/Splash.css';

// Design direction: "Highlighted Handout" (see .impeccable/surfaces). Ruled handout
// sections on one page ground, and two hand marks: the biro strike for what is done
// and the highlighter swipe for what is next (both used once in the headline).

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

// Public landing page, pitched at students.
function Splash() {
    const { isAuthenticated } = useAuth();

    const primaryCta = isAuthenticated
        ? { to: '/dashboard', label: 'Open your dashboard' }
        : { to: '/register', label: 'Get started free' };

    return (
        <div className="landing">
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
                            <h1>
                                Every assignment this semester,{' '}
                                <span className="hero-strike">
                                    crossed off
                                    <Strike className="strike--headline" />
                                </span>{' '}
                                <span className="hl">before it&apos;s due.</span>
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
                                <li><CheckIcon />Free to use</li>
                                <li><CheckIcon />Phone and laptop</li>
                                <li><CheckIcon />Light and dark mode</li>
                            </ul>
                        </div>
                        <div className="hero-visual">
                            <PlannerMock />
                        </div>
                    </div>
                </section>

                <section id="features" className="section section--features">
                    <div className="section-inner features">
                        <div className="features-heading">
                            <h2>Built for how a student week actually goes</h2>
                            <p>
                                Lectures, labs, group projects and a job on the side. Each gets a place, without
                                you having to run a productivity system.
                            </p>
                        </div>
                        <ol className="feature-list">
                            {FEATURES.map(({ title, text }) => (
                                <li
                                    key={title}
                                    className="feature"
                                >
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section className="section section--band">
                    <div className="section-inner band">
                        <div className="band-copy">
                            <h2>A gentle nudge toward what's next</h2>
                            <p>
                                Your dashboard opens on today: how many things are due, then your tasks sorted
                                into Today, Coming up and No due date. No digging through syllabi the night before.
                            </p>
                            <ul className="check-list">
                                <Bullet>Overdue work stays at the top of Today, so it can't slip by</Bullet>
                                <Bullet>The next thing to work on is highlighted for you</Bullet>
                                <Bullet>"Coming up" lines up your next deadlines across every class</Bullet>
                            </ul>
                        </div>
                        <div className="band-visual">
                            <TodayMock />
                        </div>
                    </div>
                </section>

                <section className="section">
                    <div className="section-inner lanes">
                        <figure className="lane lane--wide">
                            <ListsMock />
                            <figcaption>
                                <h3>Every class in its own lane</h3>
                                <p>
                                    Group tasks by course, club or job. Click a list to focus on just that class,
                                    and rename lists as the semester changes.
                                </p>
                            </figcaption>
                        </figure>
                        <figure className="lane lane--narrow">
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
                        <div className="steps-heading">
                            <h2>Set up in minutes, not a weekend</h2>
                        </div>
                        <ol className="steps">
                            {STEPS.map((step, i) => (
                                <li
                                    key={step.title}
                                    className="step"
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
                    <div className="section-inner cta">
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
