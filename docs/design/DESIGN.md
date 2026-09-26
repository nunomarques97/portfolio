# Design: signal field

This document is the visual and interaction contract for the portfolio. Production code implements it; theme values
live in `src/styles/theme.css`, and `tests/unit/theme.test.ts` enforces their contrast, motion and font rules.

## Audience and organizing rule

**Audience question.** A recruiter or hiring manager has a minute and asks: *who is this, what does he build, is he
senior enough, and how do I reach him?* The page answers in that order: name and role, a short account of his work,
six projects, the stack, the career timeline, then contact.

**Organizing rule.** Every section is a state of one system. A single particle field starts as a *core coming
online*, spreads into a *constellation* with one cluster per project, settles into a *lattice* for the stack, flows
as a *stream* along the career timeline and converges into a *beacon* at contact. The field echoes what he builds,
autonomous and local-first systems that plan, act and report, and it ties six sections into one continuous story
instead of six unrelated banners.

**Hierarchy.** HTML content is dominant: a readable column that works without JavaScript or WebGL. The scene is
secondary, a fixed `aria-hidden` backdrop beside the column. HUD chrome is quiet: small monospace readouts at the
edges that never carry information the content lacks.

**Direction and rejected alternatives.** The chosen direction is the "signal field" described above. Two alternatives
were rejected. A *tunnel fly-through with section gates* makes the motion compete with reading, carries a
motion-sickness risk. A *single morphing monolith mesh* is cheaper, but it
cannot map the projects to distinct nodes, so the scene stops meaning anything in the most important section.

## Palette

Dark "void" background, cool signal accents, and one warm accent reserved for the beacon/contact moment.

| Variable | Hex | Role |
| --- | --- | --- |
| `--color-bg` | `#04060d` | Page background, scrim colour, label on accent fills |
| `--text-primary` | `#e8f1ff` | Headings, chip labels, contact values |
| `--text-body` | `#c7d4ea` | Paragraphs, lede, card and timeline text |
| `--text-muted` | `#8fa3bf` | Meta lines, dates, tags, labels, nav, HUD |
| `--text-signal` | `#22d3ee` | Eyebrows, project links, HUD emphasis |
| `--text-accent` | `#a78bfa` | Card index numbers, skill group titles, eyebrow `//` prefix |
| `--text-on-accent` | `#04060d` | Label on the primary button gradient |
| `--accent-cyan` / `--accent-violet` | `#22d3ee` / `#a78bfa` | Particle base colours, primary button gradient, progress bar |
| `--accent-magenta` | `#f472b6` | Progress bar end, lattice particles; never text |
| `--accent-amber` | `#fbbf24` | Beacon, contact-link hover glow; never text |
| `--display-start/mid/end` | `#ffffff` / `#22d3ee` / `#a78bfa` | Hero name gradient |
| `--border-control` | `#64789a` | Boundary of every interactive control and of placeholders |
| `--border-active` | `rgba(34, 211, 238, 0.6)` | Border of the project card being read |
| `--line-hairline` | `rgba(143, 163, 191, 0.18)` | Decorative lines only: panel and card edges, timeline rail, stats grid, backdrop grid |
| `--surface-panel` | `rgba(6, 10, 22, 0.55)` | Panels, cards, secondary buttons (desktop, with backdrop blur) |
| `--surface-panel-mobile` | `rgba(4, 6, 13, 0.72)` | The same surfaces at 820 px and below (no blur) |
| `--chip-fill` / `--chip-line` | violet at 0.08 / 0.2 | Skill chips |
| `--focus-ring` | `#22d3ee` | Keyboard focus |

The hairline alone would bound secondary buttons and contact links at about 1.3:1, so it stays decorative and
interactive controls use `--border-control`, which reaches 3:1 even over the scrim.

### Contrast

Every pair is declared as an `@pair` annotation in `theme.css` and checked by the unit test. Translucent layers are
composited in sRGB, as the browser blends them. The scene uses additive blending, so a dense area can saturate to pure
white; `--color-particle-peak: #ffffff` is therefore the worst case for every section colour, including the beacon.

| Foreground | On page `#04060d` | On desktop scrim (0.85) over white particle | On mobile text backing (0.85) over white particle | Minimum |
| --- | --- | --- | --- | --- |
| `--text-primary` | 17.80 | 12.37 | 12.37 | 4.5 |
| `--text-body` | 13.53 | 9.40 | 9.40 | 4.5 |
| `--text-muted` | 7.87 | 5.47 | 5.47 | 4.5 |
| `--text-signal` | 11.21 | 7.79 | 7.79 | 4.5 |
| `--text-accent` | 7.44 | 5.17 | 5.17 | 4.5 |
| Display gradient `#ffffff` / `#22d3ee` / `#a78bfa` | — | 14.07 / 7.79 / 5.17 | – / – / 5.17 | 3 |
| `--border-control` | 4.53 | 3.15 | 3.15 | 3 |
| `--border-active` | — | 3.75 | — | 3 |
| `--focus-ring` | 11.21 | 7.79 | 8.27 | 3 |

Other pairs: `--text-on-accent` on the button gradient ends, 11.21 (cyan) and 7.44 (violet); `--text-primary` on a
skill chip over the scrim, 10.89. Panels and cards only darken what lies beneath them, so the scrim values are
their lower bound. A uniform light scrim (0.35) over a bright particle fails: muted text drops below 4.5:1. That is why mobile
text carries its own backing instead. The test keeps that case as a regression check.

## Typography

Both families are self-hosted from `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` (SIL Open Font
License 1.1; the npm packages are free). Only the Latin subset is bundled, with `font-display: swap`. No request
leaves the site origin. Glyphs outside the Latin subset (`→`, `↗`) fall back to the system font, which is acceptable
for these symbols.

- **Space Grotesk** 400 (body), 500 (reserved for emphasis), 700 (headings and stats): the voice of the content.
- **JetBrains Mono** 400 (labels, tags, dates, HUD) and 600 (buttons, HUD emphasis): the voice of the system. It is
  always uppercase with wide tracking, except for tags and dates.

| Variable | Size | Use |
| --- | --- | --- |
| `--text-display` | clamp(52px, 7.4vw, 112px), leading 0.92, tracking −0.04em, 700 | Hero name (the page's single h1) |
| `--text-contact` | clamp(44px, 6vw, 88px) | Contact heading |
| `--text-h2` | clamp(34px, 4.2vw, 60px), leading 1, tracking −0.03em | Section headings |
| `--text-h3` | 26px | Project titles |
| `--text-h3-small` | 20px | Timeline roles |
| `--text-lede` | clamp(18px, 1.6vw, 22px), max 34ch on desktop | Hero and contact lede |
| `--text-base` | 17px (16px at 820 px and below), leading 1.6 | Body |
| `--text-small` | 15px | Timeline details |
| `--text-chip` | 14px | Skill chips |
| `--text-button` | 13px mono, tracking 0.1em | Buttons |
| `--text-label` | 12px mono, tracking 0.22em for eyebrows | Eyebrows, dates, meta, project links |
| `--text-micro` | 11px mono, tracking 0.14em | Nav, HUD, tags, card index, stat labels |

11 px is allowed only for uppercase or monospace labels, never for sentences.

## Layout grid

Breakpoint: **820 px**. Above it the desktop composition applies; at or below it the mobile composition applies.

**1440 × 900.** Gutter `clamp(16px, 5vw, 72px)` = 72 px. The content column is `min(560px, 44vw)` = 560 px, spanning
x 72–632. The scrim is `--color-bg` at 0.92 at the left edge, 0.85 at the column's right edge (x 632), then fades to
transparent 12vw further (x ≈ 805). The scene group is offset +2 world units on x, so each formation sits in the
right half of the viewport (centre around x ≈ 1040). Sections are at least 100vh tall with 18vh top and 12vh bottom
padding, and content is vertically centred. The nav sits top-right at the gutter; the HUD sits top-left and
bottom-right.

**390 × 844.** Gutter 19.5 px (5vw), so content spans the full width (351 px). The scene is centred horizontally and raised
1.1 units so its formations fill the upper part of the screen, drawn at full opacity under a light 0.2 scrim.
Each text block (section content and footer) carries its own feathered 0.85 backing, so text keeps the desktop
contrast while particles shine in the gaps; the hero introduction sits at the bottom of the first screen. Section top padding is 14vh.
Multi-column blocks stack: skills become one column, contact rows put the label above the value. The bottom-right
HUD is hidden. Nothing scales the desktop poster down: the composition changes from "column beside scene" to
"content over atmosphere".

## Components

- **Nav.** Desktop: a row of mono 11 px uppercase links (About, Projects, Stack, Experience, Contact), pill-shaped,
  `--text-muted`. Hover and the current section (`aria-current="location"`) get `--text-primary`, a
  `--border-control` pill and `--surface-panel`. The top fade behind it is solid `--color-bg` down to 56 px, then
  fades out by 88 px, so the nav never sits on raw particles. Mobile: a "Menu" pill button (`aria-expanded`,
  `aria-controls`) opens a full-width list panel on `--surface-panel-mobile`. Escape or choosing a link closes it
  and focus returns to the button.
- **HUD** (`aria-hidden`, decorative). Top-left: pulsing 8 px cyan status dot, "NM / Signal field". Bottom-right
  (desktop only): "Section 03 / 06" with the number in `--text-signal` 600, and below it the state name (Core online,
  Signal acquired, Constellation, Lattice, Signal stream, Beacon). The readouts sit on a `--color-bg` plate at
  `--scrim-column-alpha`. A 2 px progress bar across the top, cyan → violet → magenta, scales with page scroll.
- **Backdrop layers**, bottom to top: fallback glow, perspective grid (64 px `--line-hairline` squares tilted 58°,
  masked to the bottom, 0.35 opacity), scene canvas, scrim, scanline overlay (1 px white lines every 3 px, 0.07
  opacity, overlay blend), top fade, progress bar, HUD, content.
- **Eyebrow.** Mono 12 px uppercase, `--text-signal`, prefixed with a `// ` in `--text-accent` (CSS generated content,
  so it is not read aloud).
- **Panel.** `--surface-panel`, 1 px `--line-hairline`, radius 18 px, padding 26 px, `backdrop-filter: blur(10px)`
  (desktop only).
- **Stats.** A three-column grid with 1 px hairline separators and radius 14 px. Value: Space Grotesk 700, 30 px
  (24 px on mobile). Label: micro mono uppercase, muted.
- **Project card.** A panel with padding 24/24/20. Index "01" in micro mono, `--text-accent`; title `--text-h3`;
  one-line pitch `--text-body`; a two- or three-sentence description of what the project does, `--text-muted` at `--text-small`; tags; then the link "View <name> on GitHub ↗" (label mono, `--text-signal`, underlined
  on hover and focus). External links open in a new tab with `rel="noopener noreferrer"` and visually hidden
  "(opens in a new tab)" text. The card being read (desktop) gets `--border-active`, a soft cyan glow, and moves 8 px
  right over `--duration-emphasis`. The scrim contrast pairs assume this shift; a larger one needs a matching `@pair`.
  Only the six featured projects are rendered, in order: FORJA, Crypto Radar, Jarvis, Velora Poker, SeekAI, Sextant.
- **Stack tags (in cards).** Mono 11 px pills, hairline border, muted text. They are not interactive, so the hairline
  is decoration.
- **Skill chips.** Four groups (Frontend, Backend, Applied AI, Quality & delivery) in a 2 × 2 grid of panels (one
  column on mobile). Group title: mono 12 px uppercase, `--text-accent`. Chips: 14 px `--text-primary` on
  `--chip-fill` with a `--chip-line` border, radius 8 px.
- **Timeline.** An ordered list on a 1 px hairline rail. Each node is a 9 px circle with a cyan border; the current
  role is filled cyan with a glow. Date: mono 12 px, muted. Role: 20 px. Details: 15 px `--text-body`.
- **Links and buttons.** Primary: pill, cyan → violet gradient fill, `--text-on-accent` mono 13 px uppercase, padding
  14 × 20 px (at least 44 px tall), cyan glow. Secondary: pill, `--surface-panel`, `--border-control`,
  `--text-primary`. Hover: 2 px lift and a violet glow over `--duration-base`. Contact rows: full-width rows with a
  `--border-control` border, radius 14 px, value left and mono label right (stacked on mobile); hover turns the
  border amber and adds an amber glow.
- **Placeholder styling.** Anything not supplied yet (the CV file, the portrait) renders as non-interactive text or
  a decorative box. It has a dashed `--border-control` border, `--text-muted` text and a
  "Coming soon" label, no hover state, no link and no image request. It carries `data-placeholder` so tests can find
  it.
- **Focus ring.** `:focus-visible` outline: 2 px solid `--focus-ring`, offset 4 px, radius following the element. It
  is never removed or clipped by `overflow: hidden`. Nothing inside the canvas or the HUD is focusable.

### Portrait photo slot (About)

- **Position at 1440.** At the top of the About column, a header row: the portrait on the left (176 × 220 px), and on
  the right, bottom-aligned, the eyebrow and the h2, with a 24 px gap. The panel and stats follow below at full column
  width.
- **Position at 390.** Stacked at the top of About, left-aligned, 144 × 180 px, followed by the eyebrow and the
  heading.
- **Aspect ratio.** Fixed 4:5 (`aspect-ratio: 4 / 5`, `object-fit: cover`, focal point centred on the face), with
  explicit width and height so the slot never shifts layout.
- **Frame.** Radius 14 px, 1 px `--line-hairline` border, `--surface-panel` backing. Four 14 px L-shaped corner
  brackets in `--accent-cyan` sit 6 px outside the frame, like a HUD target lock. The scanline pattern overlays the
  image at 0.07 opacity, and a mono micro caption "ID / NM-01" in `--text-muted` sits under the frame. The photo's
  colours are not filtered.
- **Placeholder state** (until the photo arrives). The same frame, with the corner brackets in `--text-muted`, a dashed
  `--border-control` border, the initials "NM" centred in JetBrains Mono 600 at 40 px (`--text-muted`) and the
  caption "Portrait coming soon". It is marked `data-placeholder` and `aria-hidden="true"` (it adds no information),
  and it makes no image request.
- **File path.** The portrait photo goes in `src/assets/portrait/nuno-marques.jpg`, at least 704 × 880 px, and is
  referenced from `src/content/portfolio.ts`. Astro's built-in `astro:assets` (sharp) generates AVIF/WebP at 1× and 2×.
- **Alt text rule.** When the real photo is shown, alt is "Portrait of Nuno Marques": it names the person and does
  not start with "image of". It lives in the content file next to the image. Never use empty alt for the real photo;
  the placeholder is hidden from assistive technology instead of given alt text.

## Motion principles

Motion shows that the system is alive and where the reader is. It never gates reading.

| Motion | Communicates | Duration / easing |
| --- | --- | --- |
| Formation morph on scroll | Moving to the next part of the story | Held for the first 60% of a section, then smoothstep over the last 40%; damped at `1 − e^(−3.2·dt)` |
| Camera glide between keyframes | Changing viewpoint on the same system | Same damping |
| Core spin (0.08 rad/s), shimmer | The system is online | Continuous |
| Pointer parallax (±0.8 / 0.6 units, desktop fine pointer only) | Depth | Same damping |
| Active-cluster highlight | "This project is that node" | Damped fade; card `--duration-emphasis` |
| Content reveal (fade, 28 px rise, 6 px blur) | New content arriving | `--duration-reveal` 900 ms, `--ease-out` |
| Heading decode (glyph scramble resolving left to right) | Signal being decoded | `--duration-decode` 900 ms, once per heading |
| Hover lift and glow | Affordance | `--duration-base` 300 ms |
| HUD dot pulse | Live status | `--duration-pulse` 2 s |

Rules: content is visible without JavaScript. The reveal's hidden state only applies once a script marks the document
as enhanced. The decode animates an `aria-hidden` overlay over the real heading text, which
stays in the DOM (hidden only visually while decoding), so the accessible name never changes and the final text
reserves its space without layout shift. Nothing flashes more than three times per second. Native scroll only: no
smooth-scroll library, no pinning, no scroll hijacking. `scroll-behavior: smooth` applies to anchor jumps.

## 3D scene concept

One `THREE.Points` draw call. Each particle stores its position in all four formations (core, constellation, lattice,
stream/beacon) as vertex attributes, plus a random seed, a cluster index (0–5) and a beacon flag. The vertex shader
blends between formations from a single `uMorph` uniform (0–3), with a per-particle stagger from its seed and an
outward turbulence mid-morph. Soft round sprites use additive blending and no depth writes. The size attenuates with
depth and scales with the capped device pixel ratio. Two uniform colours per section are blended per particle by its
seed. The beacon particles turn warm (`#ffc74d`, ≈ `vec3(1.0, 0.78, 0.3)`) and 2.5× larger as the stream completes.

Formations (world units):

- **Core**: 72% on a sphere shell of radius 1.8, 12% in a dense inner core (radius ≤ 0.55), 16% on a ring of radius
  2.7 flattened to 0.22 and tilted 0.45 rad.
- **Constellation**: six clusters on a descending helix, with centre k at (sin(1.15k)·1.5, 2.6 − 1.05k,
  cos(1.15k)·1.1) and Gaussian spread 0.32 (20% of particles at 0.57). 15% of each cluster's particles form a faint
  link to the next cluster.
- **Lattice**: three parallel planes at z = −1.1, 0 and 1.1, each a grid of lines at 0.5 spacing over ±2.5.
- **Stream + beacon**: a three-strand spiral running from x = −5 toward x = 2.6, narrowing from radius 1.7. 14% of
  the particles form the beacon, a tight sphere (σ 0.16) at (2.6, 0, 0).

## Scroll choreography

Scroll progress is `section index + smoothstep(max(0, (fraction − 0.6) / 0.4))`, measured at the viewport's vertical
centre. On desktop the scene group is offset +2 on x (scene to the right of the column); on mobile it is centred.

| Section | HUD state | Formation (`uMorph`) | Camera position → target | Particle colours a / b | Content placement |
| --- | --- | --- | --- | --- | --- |
| Hero | Core online | Core (0), spinning | (0, 0, 7.2) → (0, 0, 0) | `#22d3ee` / `#a78bfa` | Eyebrow, gradient name, lede, two CTAs, availability line; column left, core right |
| About | Signal acquired | Core (0), closer | (3.2, 1.4, 5.4) → (0, 0, 0) | `#38bdf8` / `#818cf8` | Portrait + heading row, three-paragraph panel, stats |
| Projects | Constellation | Constellation (1) | (3.6, 0.6, 7.4) → (0, 0.2, 0); on desktop the target moves 80% toward the active cluster and the camera's y follows it | `#22d3ee` / `#e0f2fe` | Six cards stacked in the column. The card crossing the viewport centre (a ±5% band) is active: its cluster is 1.5× larger and 30% whiter, the others dim by 45% |
| Skills | Lattice | Lattice (2) | (−3.6, 3.2, 5.6) → (0, 0, 0) | `#a78bfa` / `#f472b6` | 2 × 2 skill panels |
| Experience | Signal stream | Stream (3) | (−4.6, 1.2, 4.8) → (−1, 0, 0) | `#22d3ee` / `#a78bfa` | Timeline: current role, three earlier roles, then the degree |
| Contact | Beacon | Stream + lit beacon (3) | (4.4, 0.5, 2.6) → (2.6, 0, 0), flying to the beacon | `#22d3ee` / `#fbbf24` | Large heading, lede, email / LinkedIn / GitHub rows, CV placeholder |

Colours come from the `--scene-*` variables in `theme.css`, so the scene and the documentation share one source.

## Mobile variant (≤ 820 px)

Layout, scrim and scene opacity switch by viewport width only. The particle tier is chosen separately (see
Performance budget), so a wide coarse-pointer device keeps the desktop layout with the lite particle count.

- 9,000 particles (desktop 26,000), DPR capped at 1.5, base sprite size 34 (desktop 30) to keep density readable.
- The scene is raised 1.1 units, at full canvas opacity under a 0.2 scrim; text blocks carry a feathered 0.85
  backing, and panels use `--surface-panel-mobile`
  without backdrop blur.
- Simplified choreography: the same formations, colours and keyframes, but no active-cluster camera retargeting (the
  card highlight remains), no pointer parallax, and the scanline overlay and perspective grid are dropped.
- Nav collapses to the Menu button; the bottom-right HUD is hidden; content is full width.

## Reduced motion

Motion always plays. The site deliberately does not follow `prefers-reduced-motion`: the audience is
recruiters, and the motion is the point of the page. Visitors with that preference get the same animated scene,
reveals, decode, pulse and hover lifts as everyone else. Content stays readable without JavaScript and without WebGL.

## No-WebGL fallback

When WebGL is unavailable, context creation fails, three.js fails to load, or the context is lost, the canvas is
removed and `html[data-scene="unavailable"]` is set. The fallback background remains: `--color-bg` with two radial
glows, cyan (`--scene-fallback-glow-a`, 60vw at 72% / 45%) and violet (`--scene-fallback-glow-b`, 50vw at 85% / 80%),
plus the perspective grid. Content, nav and HUD work unchanged. Without JavaScript, the fallback and all content are
shown and the HUD shows its initial state.

## Performance budget

- **Frame rate.** Target 60 fps at 1440 × 900 on a mid-range laptop with a hardware GPU (measured: average ≥ 55 fps,
  p95 frame ≤ 25 ms). Mobile tier: ≥ 30 fps under 4× CPU throttling. A software renderer invalidates the measurement.
- **Tiers.** Full: 26,000 particles, DPR ≤ 2. Lite (≤ 820 px, coarse pointer, `hardwareConcurrency` ≤ 4 or
  `deviceMemory` ≤ 4): 9,000 particles, DPR ≤ 1.5.
- **Frame work.** One draw call and no per-frame allocation. The loop pauses when the tab is hidden. Resize is
  debounced (120 ms).
- **Size budgets (gzip).** Initial page JS (enhancement, nav, HUD, scene loader) ≤ 12 KB. The scene chunk (tree-shaken
  three.js plus the scene) ≤ 170 KB, loaded by dynamic import only after the page is interactive and WebGL is
  confirmed. CSS ≤ 20 KB. Fonts (five Latin WOFF2 files) ≤ 120 KB. No request leaves the site origin.

## Accessibility

- Semantic landmarks: a skip link (the first focusable element) to `main`, a header nav, `main` with one `section`
  per part, and a footer. One `h1` (the name), `h2` per section, `h3` for cards, skill groups and roles.
- Everything is reachable and operable by keyboard in visual order, with the visible focus ring. The canvas, HUD,
  backdrop layers and placeholder portrait are `aria-hidden` and never focusable.
- Every text/background pair meets the contrast table above; controls and the focus ring meet 3:1. New colours need an
  `@pair` entry in `theme.css`.
- Text never lives in the canvas. The decode keeps accessible names stable. Content is complete without JavaScript
  or WebGL.
- Reflows without horizontal scroll at 320 CSS px and at 200% zoom; touch targets are at least 44 px where possible
  (never under 24 px).
- External links are marked visually (↗) and for screen readers ("opens in a new tab"). Placeholders are never links.
- `html lang="en"`; motion plays for every visitor (see Reduced motion); nothing flashes.

## Open visual points

- The mobile scene runs at full brightness; contrast comes from the per-block text backing. Any change must keep
  `theme.test.ts` passing.
- The portrait frame and placeholder are specified here but not yet drawn. Verify them in the About screenshots at
  1440 and 390 when the section is built.
