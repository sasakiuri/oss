# Material Design 3 UI Specification

This document describes the Material Design 3 (M3) compliance for the standalone apps in `packages/nilay-about/app/(standalone)`.

## Overview

The standalone apps (home-target, game-species-test) follow Material Design 3 guidelines for:

- Color System
- Typography
- Components
- Layout & Spacing
- Motion

---

## 1. Color System

### 1.1 Color Roles

| Token                                 | Value     | Usage                            |
| ------------------------------------- | --------- | -------------------------------- |
| `--md-sys-color-primary`              | `#1a73e8` | Primary actions, active states   |
| `--md-sys-color-on-primary`           | `#ffffff` | Text/icons on primary            |
| `--md-sys-color-primary-container`    | `#d3e3fd` | Container for primary emphasis   |
| `--md-sys-color-on-primary-container` | `#041e49` | Text on primary container        |
| `--md-sys-color-secondary`            | `#5f6368` | Secondary actions                |
| `--md-sys-color-secondary-container`  | `#e8eaed` | Container for secondary emphasis |
| `--md-sys-color-tertiary`             | `#1e8e3e` | Accent color                     |
| `--md-sys-color-error`                | `#d93025` | Error states                     |
| `--md-sys-color-surface`              | `#ffffff` | Main background                  |
| `--md-sys-color-on-surface`           | `#1f1f1f` | Primary text                     |
| `--md-sys-color-outline`              | `#747775` | Borders, dividers                |
| `--md-sys-color-outline-variant`      | `#c4c7c5` | Subtle borders                   |

### 1.2 Surface Levels

M3 uses tonal surfaces for elevation hierarchy:

| Level | Token                       | Background |
| ----- | --------------------------- | ---------- |
| 0     | `surface`                   | `#ffffff`  |
| 1     | `surface-container-lowest`  | `#ffffff`  |
| 2     | `surface-container-low`     | `#f7f8f8`  |
| 3     | `surface-container`         | `#f1f3f1`  |
| 4     | `surface-container-high`    | `#ebedeb`  |
| 5     | `surface-container-highest` | `#e3e5e3`  |

### 1.3 Elevation (Box Shadows)

```css
--md-sys-elevation-level0: none;
--md-sys-elevation-level1: 0px 1px 2px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15);
--md-sys-elevation-level2: 0px 1px 2px rgba(0, 0, 0, 0.3), 0px 2px 6px 2px rgba(0, 0, 0, 0.15);
--md-sys-elevation-level3: 0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px rgba(0, 0, 0, 0.3);
--md-sys-elevation-level4: 0px 6px 10px 4px rgba(0, 0, 0, 0.15), 0px 2px 3px rgba(0, 0, 0, 0.3);
--md-sys-elevation-level5: 0px 8px 12px 6px rgba(0, 0, 0, 0.15), 0px 4px 4px rgba(0, 0, 0, 0.3);
```

---

## 2. Typography Scale

### 2.1 Type Tokens

| Scale           | Size | Line Height | Weight | Usage                    |
| --------------- | ---- | ----------- | ------ | ------------------------ |
| Display Large   | 57px | 64px        | 400    | Hero text                |
| Display Medium  | 45px | 52px        | 400    | Large headers            |
| Display Small   | 36px | 44px        | 400    | Section headers          |
| Headline Large  | 32px | 40px        | 400    | h1                       |
| Headline Medium | 28px | 36px        | 400    | h2                       |
| Headline Small  | 24px | 32px        | 400    | h3                       |
| Title Large     | 22px | 28px        | 400    | Card titles, Top App Bar |
| Title Medium    | 16px | 24px        | 500    | List item titles         |
| Title Small     | 14px | 20px        | 500    | Supporting text          |
| Body Large      | 16px | 24px        | 400    | Body text (default)      |
| Body Medium     | 14px | 20px        | 400    | Secondary body text      |
| Body Small      | 12px | 16px        | 400    | Captions                 |
| Label Large     | 14px | 20px        | 500    | Buttons, tabs            |
| Label Medium    | 12px | 16px        | 500    | Labels                   |
| Label Small     | 11px | 16px        | 500    | Small labels             |

### 2.2 Font Family

```css
--font-sans: 'Roboto', -apple-system, BlinkMacSystemFont, 'Noto Sans JP', 'Segoe UI', sans-serif;
```

---

## 3. Components

### 3.1 Button

**M3 Specifications:**

- Height: 40dp
- Corner radius: Full rounded (20dp)
- Horizontal padding: 24dp
- Typography: Label Large (14sp, 500 weight)
- Icon size: 18dp

**Variants:**

| Variant          | Background          | Text                   | Usage             |
| ---------------- | ------------------- | ---------------------- | ----------------- |
| Filled (default) | Primary             | On-primary             | Primary actions   |
| Outlined         | Transparent         | Primary                | Secondary actions |
| Text/Ghost       | Transparent         | Primary                | Tertiary actions  |
| Elevated         | Surface + shadow    | Primary                | Medium emphasis   |
| Tonal            | Secondary-container | On-secondary-container | Secondary actions |

**State Layers:**

- Hover: 8% opacity overlay
- Focus: 12% opacity overlay
- Pressed: 12% opacity overlay
- Disabled: 38% opacity

### 3.2 Card

**M3 Specifications:**

- Corner radius: 12dp (medium)
- Padding: 16dp

**Variants:**

| Variant  | Background                | Elevation         |
| -------- | ------------------------- | ----------------- |
| Elevated | Surface + 5% primary tint | Level 1           |
| Filled   | Surface-container-highest | None              |
| Outlined | Surface                   | None (1dp border) |

### 3.3 Top App Bar (AppHeader)

**M3 Specifications:**

- Height: 64dp
- Horizontal padding: 16dp (4dp for icons)
- Title: Title Large (22sp)
- Background: Surface (or Primary for colored variant)

**Layout:**

```
[Navigation icon (48dp)] [Title] [Trailing actions]
```

### 3.4 Bottom App Bar (AppFooter)

**M3 Specifications:**

- Height: 80dp
- Horizontal padding: 16dp
- Background: Surface-container
- Elevation: Level 2

### 3.5 Text Field (Input)

**M3 Specifications (Outlined variant):**

- Height: 56dp
- Corner radius: 4dp (extra-small)
- Border: 1dp (2dp on focus)
- Padding: 16dp horizontal
- Typography: Body Large (16sp)

**States:**

- Default: Outline color border
- Hover: On-surface color border
- Focus: Primary color border (2dp)
- Disabled: 38% opacity
- Error: Error color border

### 3.6 Checkbox

**M3 Specifications:**

- Container size: 18dp x 18dp
- Corner radius: 2dp
- Touch target: 48dp x 48dp
- Unchecked: Outline border
- Checked: Primary fill with checkmark

### 3.7 Progress Indicator

**M3 Specifications:**

- Track height: 4dp
- Corner radius: 2dp (rounded ends)
- Track color: Surface-container-highest
- Indicator color: Primary

### 3.8 Dialog

**M3 Specifications:**

- Corner radius: 28dp (extra-large)
- Padding: 24dp
- Background: Surface-container-high
- Elevation: Level 3
- Scrim: 32% black overlay

**Typography:**

- Headline: Headline Small (24sp)
- Body: Body Medium (14sp)

### 3.9 Menu

**M3 Specifications:**

- Corner radius: 4dp (extra-small)
- Elevation: Level 2
- Min width: 112dp
- Max width: 280dp
- Item height: 48dp
- Item padding: 12dp horizontal
- Typography: Label Large (14sp)

---

## 4. Shape Scale

| Token                | Value  | Usage                  |
| -------------------- | ------ | ---------------------- |
| `corner-none`        | 0px    | Square elements        |
| `corner-extra-small` | 4px    | Text fields, menus     |
| `corner-small`       | 8px    | Chips, small cards     |
| `corner-medium`      | 12px   | Cards, dialogs         |
| `corner-large`       | 16px   | Large cards            |
| `corner-extra-large` | 28px   | Dialogs, bottom sheets |
| `corner-full`        | 9999px | Buttons, FABs, pills   |

---

## 5. Spacing (4dp Grid)

M3 uses a 4dp baseline grid:

| Token | Value |
| ----- | ----- |
| xs    | 4px   |
| sm    | 8px   |
| md    | 12px  |
| lg    | 16px  |
| xl    | 24px  |
| 2xl   | 32px  |
| 3xl   | 48px  |
| 4xl   | 64px  |

---

## 6. Motion

**Easing curves:**

```css
/* Standard easing - most interactions */
cubic-bezier(0.2, 0, 0, 1)

/* Emphasized easing - important transitions */
cubic-bezier(0.2, 0, 0, 1)

/* Emphasized decelerate */
cubic-bezier(0.05, 0.7, 0.1, 1)

/* Emphasized accelerate */
cubic-bezier(0.3, 0, 0.8, 0.15)
```

**Duration tokens:**

- Short: 100ms (micro-interactions)
- Medium: 200ms (standard interactions)
- Long: 300ms (complex transitions)
- Extra Long: 500ms (page transitions)

---

## 7. Implementation Files

| File                            | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `standalone.css`                | M3 design tokens (colors, typography, shapes, elevation) |
| `components/ui/button.tsx`      | M3 Button component                                      |
| `components/ui/card.tsx`        | M3 Card component                                        |
| `components/ui/input.tsx`       | M3 Text Field component                                  |
| `components/ui/checkbox.tsx`    | M3 Checkbox component                                    |
| `components/ui/progress.tsx`    | M3 Progress Indicator                                    |
| `_components/app-header.tsx`    | M3 Top App Bar                                           |
| `_components/app-footer.tsx`    | M3 Bottom App Bar                                        |
| `_components/language-menu.tsx` | M3 Menu                                                  |

---

## 8. Accessibility

- **Color contrast:** All text meets WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- **Touch targets:** Minimum 48dp x 48dp for all interactive elements
- **Focus indicators:** Visible focus rings on all interactive elements
- **ARIA attributes:** Proper roles, labels, and states on all components
- **Keyboard navigation:** Full keyboard support for all interactions

---

## 9. Review Cycle Summary

### Cycle 1: Initial Analysis

- Identified M3 color system gaps
- Found typography non-compliance
- Listed component violations

### Cycle 2: Color System

- Implemented full M3 color palette
- Added surface levels and elevation
- Created Tailwind color tokens

### Cycle 3: Typography & Spacing

- Added M3 type scale tokens
- Updated heading styles
- Standardized spacing to 4dp grid

### Cycle 4: Components

- Updated Button with M3 variants and state layers
- Updated Card with M3 variants (elevated, filled, outlined)
- Updated Input with M3 text field styling
- Updated Dialog with 28dp corner radius
- Updated App Bar components

### Cycle 5: Polish & Documentation

- Added missing color tokens
- Created this specification document
- Final component refinements

---

## References

- [Material Design 3 Color System](https://m3.material.io/styles/color)
- [Material Design 3 Typography](https://m3.material.io/styles/typography)
- [Material Design 3 Components](https://m3.material.io/components)
- [Material Design 3 Motion](https://m3.material.io/styles/motion)
