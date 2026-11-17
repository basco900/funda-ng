<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Funda Product, Design & Engineering Rules

## Core Directives

- **"Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout."**
  - Do not add explanatory paragraphs, subtitles, captions, or filler microcopy under headings or inputs.
  - Rely on visual hierarchy, spatial grouping, clear input placeholders, and intuitive affordances so the interface is self-explanatory at a glance.

- **"Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything."**
  - **UX**: Fast, tactile, iOS-grade responsiveness, zero layout shift, graceful offline/unconfigured states, and immediate visual feedback.
  - **DX**: Strict TypeScript safety, clean component boundaries, reusable primitives, and zero dead code.
  - **AX**: Predictable file organization, explicit state contracts, self-documenting code, and non-destructive changes that never regress existing flows.

- **"I never want to ever see the shining AI icon anywhere on the site. Use other icons to represent AI. Icons should feel iOS-ish, circular and cool."**
  - Ban the generic sparkle or shining-star "magic AI" icon across all customer and admin surfaces.
  - When representing intelligence, automation, or assistant features, use circular, geometric, iOS-inspired symbols such as concentric pulse rings, soundwaves, smart orbs, or clean lens and node glyphs.

- **"I don't want stats at the top of pages in boxes. Stats should be well designed creatively, not the generic boring boxes."**
  - Never render a row of boxy KPI cards at the top of dashboards or workspaces.
  - Weave metrics into the layout creatively: use typographic hero figures, inline proportional strips, segmented progress bars, contextual status pills, or unified editorial summaries.

- **"Never use lucide-react. Use Hugeicons, and use only round iOS-ish icons to make the app feel iOS-ish."**
  - Do not install, import, or use `lucide-react` anywhere in the codebase.
  - Use **Hugeicons** (or custom SVGs matching Hugeicons' rounded, circular iOS aesthetic with rounded stroke caps and joins).
  - Every icon should have soft corners, balanced stroke weight, and sit comfortably inside soft-cornered or circular containers when badged.

- **"Never use the browser's default dropdown or alert, use beautifully designed ones."**
  - Never use native `<select>`, `window.alert()`, `window.confirm()`, `window.prompt()`, or raw unstyled browser popups.
  - Always use custom-designed, accessible select menus (such as `FundaSelect` and `AdminSelect`), custom modal sheets, and inline or floating toast notifications with smooth enter and exit transitions.

- **"Please take particular and careful note of paddings and margins. Everything should look pixel perfect, not amateur, not touching the borders. Something should be there for breathing room always."**
  - Elements must never touch, crowd, or clip against container edges, card borders, or screen viewports.
  - Maintain generous, intentional whitespace and consistent inner padding on every card, modal, pill, input, and button.

- **"Use consistent soft corners all through the app."**
  - Never mix exaggerated pill/capsule corners on some controls with soft rounded corners on others.
  - Keep corner radii unified and soft across all buttons, inputs, segmented controls, cards, modals, navigation bars, and sheets so every surface belongs to the same visual family.

---

## Extended iOS-Grade UI & Craft Guidelines

- **Tactile Controls & Motion**:
  - Segmented controls and toggles must behave like native iOS `UISegmentedControl` and `UISwitch` components—using a physical sliding thumb with smooth spring motion, subtle inset track depth, concentric soft corners, and elevated thumb shadows rather than flat background swaps.
  - Interactive buttons and tabs should include subtle press feedback and smooth hover and focus transitions without harsh browser outlines.
- **Optical Alignment & Proportions**:
  - Match border radii concentrically: when a control or thumb sits inside a padded container, the inner radius and outer radius must align optically so the gap remains uniform around the curve.
  - Center icons optically inside buttons and badges, accounting for directional arrows or asymmetric glyphs.
  - Keep form controls in the same visual stack at consistent widths, heights, and corner radii so edges align cleanly along a single vertical axis.
- **Surface & Theme Discipline**:
  - Use subtle hairline borders and soft, multi-layered ambient shadows instead of heavy borders or muddy drop shadows.
  - Every component must look equally refined in both Light and Dark themes (`[data-theme="light"]` and `[data-theme="dark"]`).
- **Resilience & Stability**:
  - Reserve layout space for async states and tab switches (such as shared CSS Grid cells for multi-tab forms) so cards and modals never jump in height during user interaction.


