---
name: DoneYet?
description: A crisp printed handout you mark up, with a highlighter for what's next and a biro strike for what's done.
colors:
  canvas: "#ffffff"
  surface: "#ffffff"
  surface-hover: "#f1f3ef"
  line: "#dadfd8"
  line-strong: "#a2a9a0"
  rule: "#111411"
  ink: "#111411"
  ink-2: "#394039"
  ink-3: "#5b635a"
  accent: "#1d6a45"
  accent-hover: "#145235"
  accent-soft: "#e1efe6"
  on-accent: "#ffffff"
  track: "#d5e6db"
  hl: "#3fe08c"
  on-hl: "#0b120d"
  biro: "#2746d0"
  critical: "#c42b1c"
  critical-text: "#a8251a"
  warning: "#c98a0c"
  prio-high: "#c42b1c"
  prio-medium: "#d9940f"
  prio-low: "#3567c9"
  band: "#111411"
  band-ink: "#f3f4f1"
  band-ink-2: "#b9c0b7"
  band-line: "#2b312b"
  band-accent: "#3fe08c"
  dark-canvas: "#0d0f0d"
  dark-surface: "#161916"
  dark-surface-hover: "#1f231f"
  dark-line: "#2a2f29"
  dark-line-strong: "#4f574e"
  dark-rule: "#e9ece5"
  dark-ink: "#eef1ea"
  dark-ink-2: "#c3c9bf"
  dark-ink-3: "#979f94"
  dark-accent: "#5fd394"
  dark-accent-hover: "#82e0ac"
  dark-accent-soft: "#15281c"
  dark-on-accent: "#06140b"
  dark-track: "#213a2a"
  dark-hl: "#34c97b"
  dark-on-hl: "#050a06"
  dark-biro: "#92a8ff"
  dark-critical: "#ef6b5d"
  dark-critical-text: "#f48b7f"
  dark-warning: "#f0b33c"
  dark-prio-low: "#7aa0f0"
  dark-band: "#eef1ea"
  dark-band-ink: "#0d0f0d"
  dark-band-ink-2: "#3f463e"
  dark-band-line: "#c9cfc5"
  dark-band-accent: "#1d6a45"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(42px, 6.4vw, 64px)"
    fontWeight: 850
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.2vw, 44px)"
    fontWeight: 850
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-app:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.15
  label-caps:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
  lg: "6px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
  "9": "96px"
  "10": "128px"
  tap: "44px"
  field-pointer: "40px"
  control-lg: "52px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "{spacing.tap}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.on-accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.tap}"
  button-ghost-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "{spacing.tap}"
  panel-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "16px 24px 24px"
  nav-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "{spacing.tap}"
  nav-tab-active:
    backgroundColor: "{colors.hl}"
    textColor: "{colors.on-hl}"
  highlighter-mark:
    backgroundColor: "{colors.hl}"
    textColor: "{colors.on-hl}"
    padding: "0 0.16em"
  view-toggle-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: DoneYet?

## Overview

**Creative North Star: "The Highlighted Handout"**

DoneYet? looks like a crisp printed handout that the person is marking up with two pens. Light mode is bright white stock; dark mode is a lamp-lit black sheet. Type is ink-black and set in one heavy grotesque, Archivo, from the 84px landing headline down to 12px field labels. Structure comes from rules: a 2px ink line heads every sheet and the top bar, and hairline dividers separate rows. There are no cards, no tinted panels and no resting shadows.

Two hand marks carry the personality. A fluorescent green highlighter swipe says "this next": the next task, the active section, the open list or note, the landing promise. A blue biro line crosses out finished work, drawn left to right as the task is ticked. Brand ink green is the colour of actions (buttons, links, focus). Everything else stays in ink and paper, so the marks stand out.

The world rejects the cream-paper planner it replaced, and it rejects the grey SaaS sidebar app. Density is moderate. Panels are generous on desktop and stack in task-first order on phones, and every control is at least a thumb tall on touch.

**Key Characteristics:**
- White or near-black sheets ruled in ink. No boxes, no resting shadows.
- One family, Archivo Variable, at heavy display weights (800 to 850) with tight negative tracking.
- Highlighter green (`--hl`) marks what's next; biro blue (`--biro`) crosses out what's done.
- Ink green (`--accent`) is reserved for actions and focus.
- Near-square corners (2 to 6px). Sheets themselves are square.
- 44px touch targets everywhere, with 40px fields kept only for mouse pointers.

## Colors

Paper, ink and two pens, plus one action green. Each light value has a dark counterpart (the `dark-*` tokens). Dark applies through `prefers-color-scheme` unless the user picked light, or through an explicit `data-theme="dark"`.

### Primary
- **Ledger Ink Green** (`accent`; dark `dark-accent`): the action colour for primary buttons, text links, the caret, native accent controls, focus outlines and the 3px focus ring (accent at 40% alpha). It hovers to **Deep Ledger Green** (`accent-hover`). **Pale Ledger Wash** (`accent-soft`) is the quiet tint for notices and icon discs. **Ledger Track** (`track`) is the unfilled bar behind progress.

### Secondary
- **Fluorescent Highlighter** (`hl`; dark `dark-hl`): the "this next" mark. It is never a fill for a control or a background block. Text on it is always **Highlighter Ink** (`on-hl`). `--hl-soft` (hl at 40%) is the hover wash on the task checkbox. Text selection uses the highlighter too.

### Tertiary
- **Biro Blue** (`biro`; dark `dark-biro`): only for hand marks. It draws the strike across finished tasks and ticked checklist items, and it draws the tick inside a checked task box. It is never used for text, links or controls.

### Neutral
- **Handout White** (`canvas`, `surface`): page and sheet. In light mode both are white, because sheets are separated by rules and not by tone. Dark mode lifts sheets one step (`dark-surface` on `dark-canvas`).
- **Ruled Ink** (`rule`, `ink`): heading text and the 2px rules that head sheets and bars.
- **Body Graphite** (`ink-2`) is the default body text. **Margin Grey** (`ink-3`) is for meta, counts, hints and the struck title of a done task.
- **Hairline** (`line`) for row dividers and quiet borders. **Pencil Line** (`line-strong`) for input borders, the theme toggle and the scrollbar.
- **Wash** (`surface-hover`): the hover state for rows, tabs and ghost controls.
- **Ink Band** (`band`, `band-ink`, `band-ink-2`, `band-line`, `band-accent`): one inverted section per page for rhythm. It inverts in dark mode, where the band becomes light paper and `band-accent` becomes ink green.

### Status and priority
- **Critical** (`critical`, `critical-text`): errors and the danger button. Overdue tasks use only a 6px `critical` dot beside ink text.
- **Warning** (`warning`): a marker colour for dots.
- **Priority** (`prio-high`, `prio-medium`, `prio-low`): these were validated as a set and always appear with a text label.
- **Folder colours** (Notes): eight user-pickable families (sage, sky, lavender, rose, peach, butter, clay, slate). Each has a `bg`, `line` and `ink` value in both themes, defined in the Notes stylesheet as `--fc-*`. They are tags the person chooses, not brand colours.

### Named Rules
**The Two Pens Rule.** Highlighter green marks what's next and biro blue marks what's done. Nothing else may borrow either colour. A green button is ink green (`accent`), never highlighter.

**The Fact, Not Alarm Rule.** Overdue and urgent states are stated in ink with a small red marker. Red never fills a row, a banner or a heading.

## Typography

**Display Font:** Archivo Variable (with Archivo, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** Archivo Variable (same stack)

**Character:** A single heavy grotesque does every job. Display sizes run at 850 with -0.04em tracking, like a handout's printed titles. Body text relaxes to 400 at 1.45 to 1.6 line height.

The scale is `--text-xs` through `--text-3xl`: 12 / 14 / 16 / 20 / 28 / 40 / 64px. At 1600px and wider, `--text-2xl` grows to 48px and `--text-3xl` to 84px. The root font is 17px, dropping to 16px at 1024px and below. The landing and auth pages fix their base at 16px, and the app shell uses 15px.

### Hierarchy
- **Display** (850, clamp(42px, 6.4vw, `--text-3xl`), 0.98): the landing hero headline only, max 14ch. Secondary landing headings use clamp(30px, 4vw, `--text-2xl`).
- **Headline** (850, clamp(28px, 3.2vw, 44px), 1.02, -0.04em): the dashboard greeting, which carries the highlighted count. Auth and legal page titles use 800 at `--text-2xl` (`--text-xl` under 480px).
- **Title** (800, about 1.15em in panels or `--text-lg`, 1.15, -0.02em): panel headings and account and legal section heads. h3 is 700 with -0.01em tracking.
- **Body** (400, 16px / 1.6 on landing and legal pages; 15px / 1.45 in the app): prose and task descriptions. Legal copy is capped at 720px and settings at 560px.
- **Label** (600 to 700, 13 to 15px): buttons, tabs, form labels and chips. Task titles are 650.
- **Caps label** (600, 12px or about 0.72 to 0.75em, +0.04em, uppercase): column and field labels only, such as calendar weekdays, task-edit field names and planner day columns.

### Named Rules
**The One Family Rule.** Archivo Variable is the only face. Hierarchy comes from weight (400, 600, 650, 700, 800, 850) and size jumps, never from a second family.

**The Tabular Count Rule.** Every count and stat uses `font-variant-numeric: tabular-nums`.

## Layout

The spacing scale is on a 4px grid: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128 (`--space-1` to `--space-10`). The page gutter is clamp(16px, 4vw, 64px). The landing container is 1600px and the app max width is 1760px. The landing nav is 64px tall, and the app top bar is 60px (56px at 720px and below).

**Touch sizing.** `--tap` is 44px and is the floor for anything tappable. The app defines `--field`, which is 40px with a mouse and becomes `--tap` under 720px or on `(pointer: coarse)`. Notes uses the same pattern for tree rows (`--tree-row`: 34px, becoming `--tap` under 860px or on coarse pointers). Small text actions keep a small visual size and get the full hit area through a negative margin of `(field - 1.4em) / -2`.

**Dashboard.** At 1100px and wider there is a three-column grid: clamp(220px, 18%, 320px) / fluid / clamp(240px, 20%, 360px), 24px gaps, full viewport height, with each panel scrolling internally. Between 720px and 1099px it becomes 240px plus fluid, and the side column moves to a row beneath. Under 720px it is one column ordered for the work: lists, then tasks, then the side column, then notes. The lists panel becomes a horizontally swiped strip of 150px chips with scroll-snap. The heading is date-led ("Saturday. 2 things today.") with a quiet "1 of 9 done" line under it. Open tasks are grouped into Today (overdue first), Coming up and No due date. Below 1100px the side Coming up panel is hidden because the main column already shows it. On phones the Edit button is a pencil only, and Today rows drop the redundant "Due today", so three rows fit above the fold at 375px.

**Quick add** shows only the title field and Add until the person types or focuses it. Then the list, priority, date and reminder fields unfold (`:has(:placeholder-shown):not(:focus-within)`). **Filters** fold behind a Filters toggle under 720px, so one row of search plus Filters remains.

**Notes.** Under 860px the formatting toolbar stays on one row that scrolls sideways with its scrollbar hidden, bleeding to the edge.

**Phones (under 600px).** The Tasks and Notes tabs leave the top bar and become a fixed two-up bottom tab bar, ruled by a 2px ink line on top. It is 60px tall, safe-area padded, and shows icons above the labels. Pages reserve `62px + safe-area` at the bottom, and the floating assistant button lifts above the bar. App mains add 88px of bottom room so the assistant never covers the last control.

**Landing** collapses at 960px, 720px, 640px, 420px and 360px. The auth split layout collapses at 900px and 640px.

## Elevation & Depth

The system is flat. Sheets sit on the page and are separated by a 2px ink rule along their top edge, by hairline row dividers, and in dark mode by one tonal step from canvas to surface. `--shadow` and `--shadow-paper` are both `none`. Only UI that floats above the sheet casts a shadow, and it is one soft shadow.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 18px 40px -12px rgba(17, 20, 17, 0.28), 0 2px 6px rgba(17, 20, 17, 0.08)`; dark `0 18px 40px -12px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.4)`): the account menu, the assistant button and panel, and Notes popovers and dialogs.
- **Focus ring** (`box-shadow: 0 0 0 3px` accent at 40%): focus on inputs, buttons and links. `:focus-visible` otherwise uses a 2px accent outline offset by 2px.
- **Inset selection** (`box-shadow: inset 0 0 0 2px var(--accent)`): selected calendar days, the account menu's current item, and drop targets in Notes.

### Named Rules
**The Flat Sheet Rule.** A sheet never has a shadow, a box border or a rounded frame. Use a 2px `rule` line on top. Shadow is allowed only on something that floats over the page and can be dismissed.

## Shapes

Corners are near-square, like cut paper. Controls use `--radius-md` (4px). Notices, error boxes and link focus use 2px. Floating panels and the assistant button use 6px. Sheets (panels, the auth card, the top bar) have no radius at all. Circles appear only on small markers: status dots, the password-rule ticks and the auth icon disc. Borders are 1px hairlines (`--border`) or 2px ink (`--border-thick`). Ghost buttons, the view toggle and the Filters toggle use the 2px ink border. Empty states use a 1px dashed hairline.

**The hand marks** are the only irregular shapes:
- **Highlighter swipe** (`.hl` and the matching inline gradients): a 100deg linear gradient that fades in at about 0.1 to 0.28em and out at about 0.06 to 0.3em from each end, so the band starts and ends slanted. It is `--hl-band` tall (0.76em in light, sitting low at `--hl-y` 74%; 1.2em in dark, centred at 50%). It has 0.16em of side bleed and uses `box-decoration-break: clone`, so it wraps cleanly across lines.
- **Biro strike**: one hand-drawn SVG path (`M1 7.5C18 5 34 8.5 52 6.2S84 4.8 99 6.5`, stroke 2.4, round caps, non-scaling stroke), stored per theme as the `--strike-img` token in `--biro`. It is painted as a background on inline text (`.task-title-text`, checked checklist paragraphs) with `box-decoration-break: clone`, sized `100% 0.55em` at 58%, so every wrapped line gets its own strike that ends where its text ends. The landing uses the same path as inline SVG, with a 2px stroke (4px on the headline).

## Components

### Buttons
Buttons are firm, inky and square-cornered.
- **Shape:** gently squared (4px), at least `--tap` tall (40px `--field` in the mouse-driven app). Large landing CTAs are 52px.
- **Primary:** ink green fill, white text, 700 weight, 2px border in the same green. Hover deepens to `accent-hover`. Active nudges down 1px, which is turned off under reduced motion.
- **Ghost:** transparent with a 2px ink border and ink text. On the landing, hover inverts to an ink fill with paper text. In the app, hover is the `surface-hover` wash.
- **Text link:** ink text, 700 weight, with a 2px highlighter-green underline offset by 0.3em. Hover turns it accent green with a currentColor underline. App link-buttons are accent text that underlines on hover.
- **Danger:** `critical` fill, hovering to `critical-text`. It appears only in account deletion.
- **Focus:** the 3px accent ring.

### Segmented controls
- **View toggle (List / Calendar) and Filters toggle:** a 2px ink frame. The active or expanded state inverts to an ink fill with paper text.

### Cards / Containers
- **Panel sheet:** `surface` background, 2px `rule` top border, no radius, no shadow. Padding is 16px 24px 24px (12px 16px 16px under 720px). The heading row sits on a baseline with tabular meta on the right.
- **Auth card:** the same sheet at a 400px max width with 32px padding.
- **Task sections:** Today, Coming up and No due date, each a bold 800 title with a muted count. Today is ruled off with 2px ink and the others with a 1px strong hairline. The first open Today task carries the highlighter.

### Inputs / Fields
- **Style:** `surface` fill, 1px `line-strong` border, 4px radius, `--control-height` (44px) on auth and forms and `--field` in the app, with 12px horizontal padding.
- **Hover:** the border darkens to `ink-3`.
- **Focus:** the border turns accent green and adds the 3px focus ring.
- **Error:** `critical-text` on canvas inside a 1px critical-at-45% border, at 2px radius. Success notices use `accent-soft` with an accent-at-40% border.

### Navigation
- **Top bar:** `surface`, 60px, ruled underneath by a 2px ink line, aligned to the app max width. It holds the wordmark, the Tasks and Notes tabs, the theme toggle and the account menu.
- **Tabs:** 15px, 700, `ink-2`. Hover is ink on the wash. The active tab carries the highlighter swipe behind its label in `on-hl` ink.
- **Under 600px:** a fixed bottom tab bar (see Layout). The active tab shows an ink icon and label.
- **Landing nav:** sticky, 64px, with the same 2px ink rule underneath.

### Task row (signature)
- A checkbox with a field-sized hit area, then the title (650, ink), then the description and a meta line (0.82em, `ink-3`, list and priority chips with labels).
- **Next:** the next task's title carries the highlighter.
- **Done:** the box shows a biro tick on paper with an ink border, the title drops to `ink-3`, and the biro strike draws across it left to right (450ms, `--ease`).
- **Overdue:** ink text in 700 with a 6px critical dot.
- Ticked checklist items in the note editor take the same strike, and `<mark>` in notes uses the highlighter fill.

### Wordmark
- **DoneYet? logo:** Archivo at 850 with -0.035em tracking, sized entirely in em. An arrow travels across the word, revealing a struck "done" state, and a checkbox follows it. The resting state is static, and the animation is off under reduced motion.

### Assistant
- A 52px ink-green floating button (6px radius, floating shadow) pinned bottom right, which opens a 400px floating panel. It can expand to full screen with messages centred in a 760px column.

### Motion
- Tokens: `--dur-fast` 150ms, `--dur-base` 250ms, `--dur-slow` 600ms, easing `--ease` `cubic-bezier(0.16, 1, 0.3, 1)`.
- State changes (colour, border, ring) use fast and ease.
- The highlighter sweep (`.hl--draw`) runs 700ms after a 250ms delay. Text stays ink until the band arrives. Only the landing headline strike animates (unclips over 600ms). The week sheet's strikes, ticks and highlighter rest fully drawn, and the hero highlighter is static. The theme switch cross-fades over 0.45s through View Transitions, with a 0.4s colour-fade fallback.
- Every animation has a `prefers-reduced-motion` off switch, and every mark rests fully drawn.

## Do's and Don'ts

### Do:
- **Do** head every sheet and bar with a 2px `rule` line and separate rows with 1px `line` hairlines.
- **Do** mark exactly the next thing (next task, active tab, open list or note, the landing promise) with the highlighter swipe, and set its text in `on-hl`.
- **Do** cross out finished work with the `--strike-img` biro strike, drawn left to right.
- **Do** use `accent` ink green for every action, link and focus state.
- **Do** keep every tappable target at least `--tap` (44px) on touch and use `--field` for app controls.
- **Do** use the tokenised durations and `--ease`, with a reduced-motion switch that leaves marks fully drawn.
- **Do** pair every priority colour with a text label.

### Don't:
- **Don't** put shadows, box borders or rounded frames on sheets. Shadows belong to floating UI only.
- **Don't** use highlighter green or biro blue for buttons, text or backgrounds.
- **Don't** fill rows, banners or headings with red for overdue or urgent states.
- **Don't** bring back the cream-paper planner look or a second serif display face.
- **Don't** build a grey SaaS sidebar with tinted card panels.
- **Don't** round corners past 6px, except for small circular markers.
