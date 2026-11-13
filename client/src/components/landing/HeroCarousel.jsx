import { useEffect, useState } from 'react';
import { DeadlinesMock, FiltersMock, ListsMock, PriorityMock } from './AppMocks';

const SLIDES = [
    {
        title: 'Never miss a deadline',
        text: "See what's due today and what's slipped the moment you open the app.",
        Visual: DeadlinesMock,
    },
    {
        title: 'One list for every class',
        text: 'Keep each course separate and watch progress fill up as you work.',
        Visual: ListsMock,
    },
    {
        title: 'Know what to tackle first',
        text: 'Priorities and upcoming due dates tell you where your next hour should go.',
        Visual: PriorityMock,
    },
    {
        title: 'Find anything in seconds',
        text: 'Search by name and filter by priority or due date when exam week hits.',
        Visual: FiltersMock,
    },
];

const AUTOPLAY_MS = 6000;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Hero carousel. Auto-advances every few seconds, pausing while hovered or focused
// (and never auto-advancing for reduced-motion users). Arrow keys, the prev/next
// buttons and the dots all navigate.
function HeroCarousel() {
    const [index, setIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const autoplay = !reducedMotion.matches;
    const isPaused = !autoplay || isHovered || isFocused;

    useEffect(() => {
        if (isPaused) return;
        // Restarts whenever the slide changes, so a manual move gets a full interval.
        const timer = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
        return () => clearTimeout(timer);
    }, [index, isPaused]);

    const go = (i) => setIndex((i + SLIDES.length) % SLIDES.length);

    function handleKeyDown(e) {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
    }

    return (
        <section
            className="carousel"
            aria-roledescription="carousel"
            aria-label="What DoneYet? does for students"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setIsFocused(false);
            }}
            onKeyDown={handleKeyDown}
        >
            {/* Every slide sits in the same grid cell, so the carousel keeps the height
                of the tallest one and doesn't jump between slides. */}
            <div className="carousel-track" aria-live={isPaused ? 'polite' : 'off'}>
                {SLIDES.map(({ title, text, Visual }, i) => {
                    const isActive = i === index;
                    return (
                        <div
                            key={title}
                            className={`carousel-slide${isActive ? ' is-active' : ''}`}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} of ${SLIDES.length}: ${title}`}
                            aria-hidden={!isActive}
                            inert={!isActive}
                        >
                            <Visual />
                            <div className="carousel-caption">
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="carousel-controls">
                <button type="button" className="carousel-arrow" onClick={() => go(index - 1)} aria-label="Previous slide">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <div className="carousel-dots">
                    {SLIDES.map((slide, i) => (
                        <button
                            key={slide.title}
                            type="button"
                            className={`carousel-dot${i === index ? ' is-active' : ''}`}
                            onClick={() => go(i)}
                            aria-label={`Go to slide ${i + 1}: ${slide.title}`}
                            aria-current={i === index}
                        >
                            {/* Fills over the autoplay interval; keyed so it restarts each slide. */}
                            {i === index && autoplay && (
                                <span
                                    key={index}
                                    className="carousel-dot-fill"
                                    style={{
                                        animationDuration: `${AUTOPLAY_MS}ms`,
                                        animationPlayState: isPaused ? 'paused' : 'running',
                                    }}
                                />
                            )}
                        </button>
                    ))}
                </div>
                <button type="button" className="carousel-arrow" onClick={() => go(index + 1)} aria-label="Next slide">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>
        </section>
    );
}

export default HeroCarousel;
