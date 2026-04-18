
# ARC — Cinematic Streaming Platform

A dark, premium, award-worthy streaming UI showcase. Built as a UI/UX showcase with hardcoded content, CSS gradient placeholders (no stock images), and heavy emphasis on motion design.

## Design foundation
- **Palette**: void `#080808`, surface `#0F0F0F`, accent violet `#C084FC`, secondary rose `#F472B6`, off-white text `#E8E8E8`
- **Type**: Cabinet Grotesk (display) + Inter (body), imported from Fontshare
- **Texture**: SVG turbulence film grain overlay (3% opacity, fixed) + radial light leak from top
- **Tailwind v4** `@theme inline` tokens; all colors as CSS custom properties

## Motion engine
- **GSAP + ScrollTrigger** for scroll reveals, stagger entrances, Ken Burns hero, scroll indicator
- **Lenis** wrapping the app with `duration: 1.4` momentum easing
- **Framer Motion** for tab indicator, pill switching, list layout shifts
- **View Transitions API** for route changes (slide left/right, 400ms)
- **CSS @property** for animated hue gradients on the bottom line and theme switcher

## Global UI primitives (built from scratch)
- **Custom cursor** — 10px difference-blend dot, 40px expand on links, "▶" label on cards, 0.15 lerp via GSAP ticker
- **Magnetic button** — wraps any CTA, max 8px drift, elastic spring-back
- **Card** — portrait 2:3, gradient placeholder per item, hover overlay reveal with title/genre/play
- **Pill / Badge / Toggle / Segmented control** — all custom, no component library
- Radix primitives only for: Select, Dialog, Tooltip, Dropdown, Tabs (headless, custom styled)
- `prefers-reduced-motion` kills GSAP/Lenis, swaps in ≤200ms CSS transitions

## Routes (TanStack Start file-based)
1. **`/`** — Who's Watching (profile picker, 4 gradient avatars + Add, hero entry)
2. **`/browse`** — Home: navbar (transparent → glass on scroll), cinematic hero with character-stagger title, magnetic CTAs, scroll indicator, then 6 horizontal-drag content rows (Continue Watching with progress bars, Trending with giant outlined numbers, New, Because You Watched, Critically Acclaimed, Shorts & Docs)
3. **`/title/$id`** — Movie Detail: blurred poster background, two-column layout, animated tabs (Overview / Episodes / Cast / Trailers / More Like This), shared-element transition from card
4. **`/search`** — Auto-focused giant input with cycling placeholder, Top Searches grid, debounced results, empty state
5. **`/my-list`** — Filter pills with layout animation, grid of cards with hover-remove, illustrated empty state
6. **`/settings`** — Sidebar nav + sections (Account, Profiles, Playback, Appearance, Notifications, Subscription, Help) with custom toggles, segmented quality control, theme switcher cards

## Hardcoded data
- 1 featured hero title + ~70 content items distributed across rows
- Each item: title, year, rating, duration, genre, runtime, cert, two gradient hues for the placeholder
- 5 profiles with unique gradient avatars
- Detail page seeds episodes (8), cast (10), and "more like this" (6)

## File structure
```
src/routes/
  __root.tsx          (Lenis + cursor + grain + nav slot)
  index.tsx           (Who's Watching)
  browse.tsx
  title.$id.tsx
  search.tsx
  my-list.tsx
  settings.tsx
src/components/
  cursor/CustomCursor.tsx
  motion/MagneticButton.tsx, SplitTextReveal.tsx, RevealOnScroll.tsx
  layout/Navbar.tsx, FilmGrain.tsx, LightLeak.tsx
  cards/MovieCard.tsx, ContinueCard.tsx, TrendingCard.tsx
  rows/ContentRow.tsx (drag-to-scroll)
  ui/MagneticCTA.tsx, Pill.tsx, Toggle.tsx, Segmented.tsx, Badge.tsx
src/data/
  catalog.ts, profiles.ts, hero.ts
src/lib/
  gsap.ts (registers ScrollTrigger), lenis.tsx (provider), cursor-context.tsx, gradients.ts
src/styles.css        (theme tokens, fonts, grain, scrollbar, reduced-motion)
```

## Build order
1. Install deps: `gsap`, `lenis`, `framer-motion`, `@radix-ui/react-{select,dialog,tabs,tooltip,dropdown-menu}`
2. Theme + fonts + grain + light leak + custom cursor + Lenis provider in root
3. Motion primitives (MagneticButton, RevealOnScroll, SplitTextReveal)
4. Card system + ContentRow with drag-to-scroll
5. Pages in order: Who's Watching → Browse → Detail → Search → My List → Settings
6. Wire View Transitions on `<Link>` clicks; verify reduced-motion fallback

The result is a dark, textured, motion-rich showcase that feels closer to A24 / Apple TV+ / Linear than a typical streaming clone.
