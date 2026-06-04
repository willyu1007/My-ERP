---
name: ui-bettercodex-mr
description: Prevents generic AI/Codex UI patterns when generating frontend code using Morethan-aligned color rules and calmer, human-designed UI decisions.
---

# UI BetterCodex MR

The guide exists to teach an agent how to avoid Codex-default behavior when building UI.

Codex UI is the default AI aesthetic: soft gradients, floating panels, eyebrow labels, decorative copy, hero sections in dashboards, oversized rounded corners, transform animations, dramatic shadows, and layouts that try too hard to look premium. The visual language screams "an AI made the interface" because the layout follows the path of least resistance.

The next section breaks that pattern. Everything in the rule set is what Codex UI does by default. The job is to recognize those patterns, avoid the patterns completely, and build interfaces that feel human-designed, functional, and honest.

When you read the guide, you are learning what NOT to do. The banned patterns are red flags. The normal implementations are the blueprint. Follow the rules strictly, and the resulting UI will feel like Linear, Raycast, Stripe, or GitHub rather than another generic AI dashboard.

The following workflow is the Uncodixify path.
## Keep It Normal (Uncodexy-UI Standard)

- Sidebars: normal (240-260px fixed width, solid background, simple border-right, no floating shells, no rounded outer corners)
- Headers: normal (simple text, no eyebrows, no uppercase labels, no gradient text, just h1/h2 with proper hierarchy)
- Sections: normal (standard padding 20-30px, no hero blocks inside dashboards, no decorative copy)
- Navigation: normal (simple links, subtle hover states, no transform animations, no badges unless functional)
- Buttons: normal (solid fills or simple borders, 8-10px radius max, no pill shapes, no gradient backgrounds)
- Cards: normal (simple containers, 8-12px radius max, subtle borders, no shadows over 8px blur, no floating effect)
- Forms: normal (standard inputs, clear labels above fields, no fancy floating labels, simple focus states)
- Inputs: normal (solid borders, simple focus ring, no animated underlines, no morphing shapes)
- Modals: normal (centered overlay, simple backdrop, no slide-in animations, straightforward close button)
- Dropdowns: normal (simple list, subtle shadow, no fancy animations, clear selected state)
- Tables: normal (clean rows, simple borders, subtle hover, no zebra stripes unless needed, left-aligned text)
- Lists: normal (simple items, consistent spacing, no decorative bullets, clear hierarchy)
- Tabs: normal (simple underline or border indicator, no pill backgrounds, no sliding animations)
- Badges: normal (small text, simple border or background, 6-8px radius, no glows, only when needed)
- Avatars: normal (simple circle or rounded square, no decorative borders, no status rings unless functional)
- Icons: normal (simple shapes, consistent size 16-20px, no decorative icon backgrounds, monochrome or subtle color)
- Typography: normal (system fonts or simple sans-serif, clear hierarchy, no mixed serif/sans combos, readable sizes 14-16px body)
- Spacing: normal (consistent scale 4/8/12/16/24/32px, no random gaps, no excessive padding)
- Borders: normal (1px solid, subtle colors, no thick decorative borders, no gradient borders)
- Shadows: normal (subtle 0 2px 8px rgba(0,0,0,0.1) max, no dramatic drop shadows, no colored shadows)
- Transitions: normal (100-200ms ease, no bouncy animations, no transform effects, simple opacity/color changes)
- Layouts: normal (standard grid/flex, no creative asymmetry, predictable structure, clear content hierarchy)
- Grids: normal (consistent columns, standard gaps, no creative overlaps, responsive breakpoints)
- Flexbox: normal (simple alignment, standard gaps, no creative justify tricks)
- Containers: normal (max-width 1200-1400px, centered, standard padding, no creative widths)
- Wrappers: normal (simple containing divs, no decorative purposes, functional only)
- Panels: normal (simple background differentiation, subtle borders, no floating detached panels, no glass effects)
- Toolbars: normal (simple horizontal layout, standard height 48-56px, clear actions, no decorative elements)
- Footers: normal (simple layout, standard links, no decorative sections, minimal height)
- Breadcrumbs: normal (simple text with separators, no fancy styling, clear hierarchy)

Think Linear. Think Raycast. Think Stripe. Think GitHub. They don't try to grab attention. They just work. Stop playing hard to get. Make normal UI.

- A landing page needs its sections. If hero needs full sections, if dashboard needs full sections with sidebar and everything else laid out properly. DO NOT invent a new layout.
- In internal reasoning, act as if the banned-pattern list is invisible, note the default moves you would normally make, and then do not ship those moves.
- Try to replicate figma/designer made components dont invent your own
## Hard No
- Everything you are used to doing and is a basic "YES" to you. 
- No oversized rounded corners.
- No pill overload.
- No floating glassmorphism shells as the default visual language.
- No soft corporate gradients used to fake taste.
- No generic dark SaaS UI composition.
- No decorative sidebar blobs.
- No "control room" cosplay unless explicitly requested.
- No serif headline + system sans fallback combo as a shortcut to "premium."
- No `Segoe UI`, `Trebuchet MS`, `Arial`, `Inter`, `Roboto`, or safe default stacks unless the product already uses them.
- No sticky left rail unless the information architecture genuinely needs the sticky rail.
- No metric-card grid as the first instinct.
- No fake charts that exist only to fill space.
- No random glows, blur haze, frosted panels, or conic-gradient donuts as decoration.
- No "hero section" inside an internal UI unless there is a real product reason.
- No alignment that creates dead space just to look expensive.
- No overpadded layouts.
- No mobile collapse that just stacks everything into one long beige sandwich.
- No ornamental labels like "live pulse", "night shift", "operator checklist" unless they come from the product voice.
- No generic startup copy.
- No style decisions made because they are easy to generate.

- No Headlines of any sort

```html
<div class="headline">
  <small>Team Command</small>
  <h2>One place to track what matters today.</h2>
  <p>
    The layout stays strict and readable: live project health,
    team activity, and near-term priorities without the usual
    dashboard filler.
  </p>
</div>
```

This is not allowed.

- `<small>` headers are NOT allowed
- Big no to rounded `span`s
- Muted brand navy and mist-blue structure are allowed. Neon cyan, bright SaaS blue, blue-black gradients, and glowing accents are not.

- Any layout that follows the structure of the example card in the next snippet is a **BIG no**.

```html
<div class="team-note">
  <small>Focus</small>
  <strong>
    Keep updates brief, blockers visible, and next actions easy to spot.
  </strong>
</div>
```

This one is **THE BIGGEST NO**.


## Specifically Banned (Based on  Mistakes)

- Border radii in the 20px to 32px range across everything ( uses 12px everywhere - too much)
- Repeating the same rounded rectangle on sidebar, cards, buttons, and panels
- Sidebar width around 280px with a brand block on top and nav links underneath (: 248px with brand block)
- Floating detached sidebar with rounded outer shell
- Canvas chart placed in a glass card with no product-specific reason
- Donut chart paired with hand-wavy percentages
- UI cards using glows instead of hierarchy
- Mixed alignment logic where some content hugs the left edge and some content floats in center-ish blocks
- Overuse of washed-out gray-blue text that weakens contrast and clarity
- "Premium dark mode" that really means navy-black gradients, cyan accents, and radial glow backgrounds
- UI typography that feels like a template instead of a brand
- Eyebrow labels (: "MARCH SNAPSHOT" uppercase with letter-spacing)
- Hero sections inside dashboards ( has full hero-strip with decorative copy)
- Decorative copy like "Operational clarity without the clutter" as page headers
- Section notes and mini-notes everywhere explaining what the UI does
- Transform animations on hover (: translateX(2px) on nav links)
- Dramatic box shadows (: 0 24px 60px rgba(0,0,0,0.35))
- Status indicators with ::before pseudo-elements creating colored dots
- Muted labels with uppercase + letter-spacing (`ui-bettercodex-mr` overuses the pattern in its anti-examples)
- Pipeline bars with gradient fills (: linear-gradient(90deg, var(--primary), #4fe0c0))
- Bright SaaS-blue call-to-action buttons in otherwise calm UI
- Cyan/teal accent stacks used as a shortcut for "technical" or "smart"
- KPI cards in a grid as the default dashboard layout ( has 3-column kpi-grid)
- "Team focus" or "Recent activity" panels with decorative internal copy
- Tables with tag badges for every status ( overuses .tag class)
- Workspace blocks in sidebar with call-to-action buttons
- Brand marks with gradient backgrounds (: linear-gradient(135deg, #2a2a2a, #171717))
- Nav badges showing counts or "Live" status ( has nav-badge class)
- Quota/usage panels with progress bars ( has three quota sections)
- Footer lines with meta information (: "Northstar dashboard • dark mode • single-file HTML")
- Trend indicators with colored text (: trend-up, trend-flat classes)
- Rail panels on the right side with "Today" schedule ( has full right rail)
- Multiple nested panel types (panel, panel-2, rail-panel, table-panel)



## Rule

If a UI choice feels like a default AI UI move, ban the choice and pick the harder, cleaner option.
- Colors should stay calm, not fight.

- For `ui-bettercodex-mr`, assume the approved Morethan brand kit is the default palette unless the user explicitly gives a different approved system.
- Use the exact Morethan token family first: `navy #283E68`, `orange #E1703C`, `ink #111827`, `gray600 #4B5563`, `gray200 #E5E7EB`, `white #FFFFFF`.
- Derive surfaces from those tokens with calm, flat, low-saturation values. Do not jump to neon, cyan, violet, or generic SaaS blue.
- Do **not** invent random color combinations unless the user explicitly requests a new palette.
---

# MR Light

Light theme should feel like cool paper plus quiet product chrome, not bright startup blue. The sidebar may lean mist-blue. The main canvas should stay close to white. Navy leads interaction. Orange is restrained.

| Role | Value | Usage |
|--------|--------|--------|
| Canvas | `#F4F6F8` | Main background, cool paper-like and flat |
| Surface | `#FFFFFF` | Cards, panels, forms, tables |
| Sidebar | `#DCE6F1` | Left rail, secondary structural blocks, subtle tint only |
| Border | `#E5E7EB` | Dividers, input borders, table lines |
| Primary | `#283E68` | Buttons, tabs, active nav, links, selected controls |
| Accent | `#E1703C` | Alerts, highlights, limited emphasis only |
| Text | `#111827` | Primary reading color |
| Secondary Text | `#4B5563` | Labels, helper text, secondary metadata |

Light-theme rules:
- Keep the content area white or near-white. Do not flood the whole UI with tinted panels.
- Mist-blue belongs to the sidebar and quiet structure, not to every card.
- Primary actions should be navy-led, not bright blue.
- Orange should appear rarely and intentionally. It is not the default button color.
- Borders should be thin and low-contrast. Let layout and typography do the hierarchy.

---

# MR Dark

Dark theme should feel like navy-charcoal workspace UI, not cyberpunk, not glossy SaaS, not gradient-heavy. Structure comes from flat surfaces and quiet borders. Orange carries emphasis over the dark field.

| Role | Value | Usage |
|--------|--------|--------|
| Canvas | `#141B24` | Main background, flat navy-charcoal |
| Surface | `#1B2430` | Panels, tables, modals, forms |
| Sidebar | `#18212C` | Left rail, denser structural layer |
| Border | `#2A3542` | Dividers and subtle outlines |
| Primary Structure | `#283E68` | Tabs, selected rails, restrained structural brand usage |
| Accent | `#E1703C` | CTA, active state, important status, selected emphasis |
| Accent Hover | `#F08A57` | Hover and pressed variants only |
| Text | `#E8EDF2` | Primary reading color |
| Secondary Text | `#9AA6B2` | Metadata, descriptions, tertiary information |

Dark-theme rules:
- Keep the background flat. No blue-black gradients, no cyan glow, no fake atmosphere haze.
- Use navy-charcoal for the system and orange for emphasis. Do not stack orange everywhere.
- Cyan, teal, violet, and pink are not valid fallback accents here.
- Borders should stay quiet. If the UI needs drama, fix the layout instead of adding effects.
- Primary buttons in dark mode may use orange. Structural selection can still use navy when navy reads better.

---

## Verification

- Confirm the generated UI uses `Morethan Light` or `Morethan Dark` as the default color system unless the user explicitly provides a different approved palette.
- Confirm light layouts keep a white or near-white content area, mist-blue structural chrome, navy-led primary actions, and restrained orange accents.
- Confirm dark layouts keep flat navy-charcoal surfaces, quiet borders, orange-led emphasis, and no cyan, teal, violet, or glow-driven accents.
- Confirm the output avoids blue-black gradients, glossy SaaS dark mode styling, and random palette invention.

## Boundaries

- Do not override an explicitly user-provided approved palette.
- Do not invent extra theme families beyond `Morethan Light` and `Morethan Dark` unless the user asks for them.
- Do not use orange as a default surface color or flood the whole interface with mist-blue tint.
- Do not edit provider stubs directly. Update the SSOT skill under `.ai/skills/` and re-sync wrappers.
