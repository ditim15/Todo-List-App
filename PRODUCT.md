# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Built for students juggling coursework (classes, labs, group projects, a job on the side), and open to anyone who wants gentle reminders and a place for notes. They check it on a phone between commitments and plan or write notes on a laptop.

## Product Purpose
DoneYet? ("DoneYet") keeps every task and deadline in one place, sorted by list and priority, and nudges people by email before things are due. Notes live beside the tasks, so the planning for a task and the task itself stay together. Success is someone opening it, seeing what to do next, and crossing it off without feeling nagged.

## Positioning
Gentle reminders, not alarms: emailed nudges at a time the person picks, a dashboard that leads with today and what's next, and notes folders tied to individual tasks (each task can own a folder with starter notes like "Plan the timeline").

## Operating Context
- Quick capture on a phone (type a task, pick a list and date, Add) and planning sessions on a laptop.
- Lists per class/course/club/job; priorities high/medium/low; due dates; reminder options (day of, 1/2/3 days, 1 week before) plus a time.
- Calendar month view; search and filters (priority, date range).
- Notes: folders up to five levels deep, rich-text editor (headings, lists, checklists, quotes, code, links), inline images and PDF attachments, drag and drop to move notes/folders (desktop) with "Move to" for keyboard/touch, folder colours, one-way Google Drive backup.
- Two AI assistants (Claude): one drafts tasks from plain language on the dashboard, one reads and proposes edits to notes.

## Capabilities and Constraints
- Front end: React 19 + Vite + Tiptap 3 in `client/`, deployed on Vercel (doneyet.app). API: Express 5 + Postgres on Railway (api.doneyet.app). Front-end work must not change API behaviour or routes.
- Light and dark themes; the choice is saved and applied before React loads.
- Must work from small phones (320px) to wide desktops with no horizontal scrolling and touch targets of at least 44px.
- Google Drive is the only live cloud provider; OneDrive and Dropbox are shown as "Coming soon".
- Free to use (no pricing tiers exist).

## Brand Commitments
- The name is "DoneYet?", with the question mark.
- The strike-through device stays: a hand-drawn line that crosses finished things out.
- Green stays the brand colour.
- The logo animation may be redesigned.
- Must not feel: nagging or stressful (no guilt, alarm-red urgency), gamified or childish (no streaks, confetti, mascots), corporate SaaS, or bland and personality-free.

## Evidence on Hand
- No testimonials, user counts, press, or logos exist. Do not invent any.
- Landing previews are illustrative app mocks (`client/src/components/landing/AppMocks.jsx`), not real user data.

## Product Principles
1. Nudge, don't nag: reminders and overdue states inform without alarm.
2. Next thing first: every screen makes the next action obvious.
3. Capture in seconds: adding a task or note never needs setup.
4. Finishing should feel good: crossing something off is the moment the product celebrates, quietly.
5. Same app everywhere: phone and laptop get the full product, not a reduced one.

## Accessibility & Inclusion
Body text at least 4.5:1 contrast in both themes, 44px touch targets, keyboard paths for everything drag and drop does, reduced-motion respected.
