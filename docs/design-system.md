# Design system

Lauva aims to look like a native **iOS 26** app while still working as a normal desktop website. Everything below lives in `src/app/globals.css` and `src/components/ui/`.

![Lauva brand palette](palette.svg)

---

## Colour

- **Tokens only.** Style with `var(--…)`, never hex literals
- `--brand-*` is the true Lauva palette (logo, large fills)
- The other tokens are deepened versions tuned for readable text and charts
- `--ui-accent` is the default interactive tint; each Log domain has its own `--series-*` colour
- `--text-muted` is held at about 4.5:1 contrast. Don't lighten it

### Themes

| | |
|---|---|
| Modes | Light / Dark / System, in Settings → Appearance (`src/lib/theme.ts`) |
| Palettes | Light: L1, L3 (default), L4, L5 · Dark: D1 (default), D2, D4 |
| Dark mode | A token-only override under `:root[data-theme="dark"]`; muted, never neon |
| First paint | A script in `layout.tsx` sets `data-theme` before render; `ThemeManager` follows the OS live |

---

## Type

One sans-serif family: SF Pro on Apple devices, Inter elsewhere (`--font-app`).

| Size | Use |
|---|---|
| 12px | Captions, section headers (uppercase, semibold) |
| 14px | Body, rows, chips, controls |
| 16px semibold | Sheet and form titles, alert buttons |
| 24px semibold | Page titles |

- Weights: 400, 500, 600 only. Never 700
- Inputs are 16px on phones so iOS doesn't zoom in

---

## Shape and surfaces

| Element | Radius | Surface |
|---|---|---|
| Toolbar controls, buttons, chips | 10px | `.control-surface`: white, hairline edge, soft shadow |
| Cards, grouped lists | 16px (`rounded-xl`) | White with a hairline border |
| Popover menus | 12px | `.menu-surface`: white, hairline edge, deeper shadow |
| Sheets | 20px | Grey plane; floats 8px in from the edges on phones |
| Alerts | 20px | `.menu-surface` |

- No full "pill" buttons. Controls and buttons stay at 10px
- No grey filled boxes for search or controls

---

## Components

### Navigation and switching

| Need | Use |
|---|---|
| Page-level view switch | `SegmentedTabs`: equal segments when they fit, overflow goes into "More" |
| Section or category switch | `TabRail` (underlined text tabs) |
| Two-way mode / chart window | `Segmented` |
| Rolling date window | `DateRangeFilter` (one popover, never a row of range pills) |

### Controls

- **`CONTROL_CLS` / `CONTROL_STYLE`** (`ui/Chip.tsx`): search, menus, date stepper, Filter. 36px tall
- **Menus** show their value in the tint with an up/down chevron (`UpDownChevronIcon`)
- **`Chip`**: every selectable option. 32px, white at rest, tinted when on
- **`Button`**: `primary`, `tinted`, `outline`, `quiet`. Inline actions are plain tinted text, never a dotted underline

### Forms

- **`FormShell`** (title + Cancel) holds **`FormGroup`** cards of **`Field`** rows
- **`SwitchRow`** for toggles
- **Numbers are picked, not typed:** `NumberStepper` (−/+ steps, optional `format` for readouts like "Ongoing")
- **No boxed inputs**, never grey-filled
- **Dates and times:** `DatePicker`, `TimePicker`, `DateTimePicker`, `MonthPicker`. Never a native date input

### Dialogs

- **`Sheet`:** every modal. A bottom sheet on phones (swipe down to close), centred from `sm`
- **`DuplicateItemDialog`:** the iOS-style alert

### Lists

- **`.inset-rows`:** iOS grouped-list separators. Rows are at least 44px tall
- **`ListSection`:** the section header above a card
- **Metadata** (kind, specialty, "shared") is plain text, not a badge

---

## Accessibility floor

- Every tap target is at least **44px** (`.hit-slop`, `.tap-target`)
- Keyboard focus shows a 2px accent ring (`:focus-visible`)
- Text on a solid accent fill uses `--on-accent`
- Motion respects `prefers-reduced-motion`

---

## Assets

- `public/icons/` are PNG renders of `public/logo-mark.svg`. Regenerate them, don't hand-edit
