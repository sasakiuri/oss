# UI text layout notation specification v1.2

## 1. Purpose

This specification defines a consistent notation for representing UI screens, components, states, and assets as text without screenshots, making design, review, change tracking, and implementation mapping easier.

---

## 2. Design principles

- Assume a monospace font.
- Distinguish screen structure, reusable components, simple elements, assets, and states.
- Name things by meaning rather than appearance.
- Aim to express the main concepts in MUI / Ant Design / Chakra UI / Bootstrap / Radix without depending on a framework.
- Do not embed raw SVG / JSX / HTML / CSS in the document body.

---

## 3. Layers

| Layer     | Purpose                | Example notation                    |
| --------- | ---------------------- | ----------------------------------- |
| Layout    | Screen structure       | `+---- HEADER ----+`                |
| Component | Reusable components    | `<Component: SearchBar>`            |
| Element   | Simple UI elements     | `[Save]`, `<Input: Search>`         |
| Asset     | Icons, images, and SVG | `:search:`, `<SVG: logo>`           |
| State     | UI states              | `<Loading...>`, `{success: Active}` |

---

## 4. Naming conventions

| Target          | Rule       | Example                             |
| --------------- | ---------- | ----------------------------------- |
| Icons           | kebab-case | `:chevron-down:`                    |
| SVG/image IDs   | kebab-case | `<SVG: app-logo>`                   |
| Component names | PascalCase | `<Component: UserTable>`            |
| Instance IDs    | kebab-case | `<Component#user-table: UserTable>` |
| Slot names      | kebab-case | `<Slot: footer>`                    |

Prohibited:

- Do not substitute emoji for icons.
- Do not use names with little meaning, such as `Box1` or `AreaA`.
- Do not mix multiple notations for the same meaning.

---

## 5. Layout notation

### 5.1 Screen

```text
+---- SCREEN: User management -------------------------+
|                                                      |
+------------------------------------------------------+
```

### 5.2 Standard regions

```text
+---- HEADER ------------------------------------------+
|                                                      |
+---- BODY --------------------------------------------+
|                                                      |
+---- FOOTER ------------------------------------------+
|                                                      |
+------------------------------------------------------+
```

### 5.3 Split layout

```text
+---- BODY --------------------------------------------+
| +---- SIDEBAR -----+ +---- MAIN -------------------+ |
| |                  | |                             | |
| +------------------+ +-----------------------------+ |
+------------------------------------------------------+
```

### 5.4 Group

```text
+---- FILTER ------------------------------------------+
| <Input: Keyword> [Search]                            |
| <Select: Status>                                     |
+------------------------------------------------------+
```

---

## 6. Basic UI elements

### 6.1 Text

```text
"Label"
```

### 6.2 Button

```text
[Save]
[Delete!]
[Button disabled]
```

### 6.3 Icon button

```text
[icon: :menu:]
[icon!: :trash:]
```

### 6.4 Input

```text
<Input>
<Input: Username>
<Input disabled>
```

### 6.5 Text area

```text
<Textarea: Notes>
```

### 6.6 Select

```text
<Select: Status>
<Select: Active | Inactive>
```

### 6.7 Autocomplete / combobox

```text
<Combobox: Assignee>
<Autocomplete: Customer search>
```

### 6.8 Checkbox

```text
[ ] Agree to the terms of service
[x] Receive email notifications
[-] Partially selected
```

### 6.9 Radio button

```text
(o) Active
( ) Inactive
```

### 6.10 Switch / toggle

```text
<Toggle: ON>
<Toggle: OFF>
Notifications <Toggle: ON>
```

### 6.11 Slider

```text
<Slider: 0..100 value=40>
<RangeSlider: 10..80>
```

### 6.12 Rating

```text
<Rating: 4/5>
```

### 6.13 Tabs

```text
[Tab active: List] [Tab: Details] [Tab: Settings]
```

### 6.14 Breadcrumbs

```text
<Breadcrumb> [Home] / [Administration] / "User list" </Breadcrumb>
```

### 6.15 Pagination

```text
<< < 1 2 3 4 > >>
```

### 6.16 Stepper

```text
<Stepper: 1.Basic information -> 2.Review -> 3.Complete>
```

### 6.17 Badge / chip / tag

```text
{success: Active}
<Chip: In development>
<Tag: Tokyo>
```

### 6.18 Avatar

```text
<Avatar: Taro Yamada>
<Avatar img="user01.png">
```

### 6.19 Tooltip

```text
<Tooltip: Save to confirm>
```

---

## 7. Data display

### 7.1 Table

```text
|Table|
| ID | Name   | Status | Actions |
|----|--------|--------|---------|
| 1  | Yamada | Active | [Edit]  |
```

### 7.2 Data grid

```text
<DataGrid>
 columns: ID | Name | Status | Updated
 features: sort, filter, paginate, resize, pin
</DataGrid>
```

### 7.3 List

```text
<List>
 - :user: Taro Yamada
 - :user: Hanako Sato
</List>
```

### 7.4 Description list

```text
<DescriptionList>
 Name: Taro Yamada
 Status: Active
</DescriptionList>
```

### 7.5 Card

```text
<Card>
 Title
 Description
 [Details]
</Card>
```

### 7.6 Accordion

```text
<Accordion>
 [Section: Advanced filters]
</Accordion>
```

### 7.7 Tree

```text
<Tree>
 - Parent
   - Child A
   - Child B
</Tree>
```

### 7.8 Timeline

```text
<Timeline>
 - 2026-03-01 Created
 - 2026-03-05 Approved
</Timeline>
```

### 7.9 Carousel

```text
<Carousel>
 slide-1 | slide-2 | slide-3
</Carousel>
```

### 7.10 Chart

```text
<Chart: line>
<Chart: bar>
<Chart: pie>
```

---

## 8. Feedback / overlays

### 8.1 Alert

```text
<Alert: success> Saved
<Alert: warning> Some fields are empty
<Alert: error> An error occurred
<Alert: info> Additional information
```

### 8.2 Toast / snackbar

```text
<Toast: success> Saved
<Snackbar: error> Connection failed
```

### 8.3 Dialog / modal

```text
*Modal: Confirm deletion*
--------------------------------
Are you sure you want to delete?
[Cancel] [Delete!]
--------------------------------
```

### 8.4 Drawer / sheet

```text
<Drawer: right>
  [Settings]
</Drawer>

<Sheet: bottom>
  "Mobile actions"
</Sheet>
```

### 8.5 Popover

```text
<Popover>
  "Additional actions"
</Popover>
```

### 8.6 Menu

```text
<Menu>
 - Edit
 - Duplicate
 - Delete
</Menu>
```

### 8.7 Context menu

```text
<ContextMenu>
 - Open
 - Rename
 - Delete
</ContextMenu>
```

---

## 9. Navigation

```text
[Nav: :home: Dashboard]
[Nav active: :users: Users]
[Nav: :settings: Settings]
```

```text
<AppBar>
  <SVG: app-logo 120x32>
  [icon: :search:]
  [icon: :bell:]
</AppBar>
```

---

## 10. Date, time, and selection controls

```text
<DatePicker: Start date>
<TimePicker: Start time>
<DateTimePicker: Reservation date and time>
<DateRangePicker: Date range>
<Calendar>
```

```text
<FileUpload>
  [Choose file]
</FileUpload>
```

```text
<PinInput: 6 digits>
```

```text
<ColorPicker>
```

---

## 11. Asset notation

### 11.1 Icons

```text
:search:
:user:
:settings:
:close:
:warning:
```

### 11.2 SVG / images

```text
<SVG: logo>
<SVG: illustration-login 640x240>
<Image: hero-banner 1280x320>
```

With states:

```text
<SVG muted: logo>
<SVG decorative: background-wave>
<SVG interactive: node-graph>
```

Prohibited:

```text
<svg> ... </svg>
```

---

## 12. Component notation

### 12.1 Basics

```text
<Component: SearchBar>
<Component: UserTable>
```

### 12.2 Props

```text
<Component: Button variant=primary size=md>
<Component: Badge status=success>
<Component: Modal title="Confirm deletion">
```

### 12.3 Instances

```text
<Component#user-search: SearchBar>
<Component#main-table: DataTable>
```

### 12.4 Slots

```text
<Component: Modal>
  <Slot: header> "Confirm deletion" </Slot>
  <Slot: body> "Are you sure you want to delete?" </Slot>
  <Slot: footer> [Cancel] [Delete!] </Slot>
</Component>
```

---

## 13. State notation

```text
<Loading...>
<Skeleton>
<Empty: No data available>
<Disabled>
<Readonly>
<Selected>
<Focused>
<Hovered>
<Expanded>
<Collapsed>
<Checked>
<Invalid>
<Required>
```

Asynchronous states:

```text
<Idle>
<Submitting>
<Success>
<Error>
```

---

## 14. Responsive notation

```text
<Breakpoint: mobile>
<Breakpoint: tablet>
<Breakpoint: desktop>
```

Example:

```text
<Responsive>
 mobile: <Drawer: left>
 desktop: +---- SIDEBAR ----+
</Responsive>
```

---

## 15. Accessibility annotations

```text
<A11y>
 label: "Search users"
 role: searchbox
 describedby: "Enter search criteria"
 keyboard: tab/enter/esc
</A11y>
```

Include these only when needed.

---

## 16. Practical example

```text
+---- SCREEN: User management ------------------------------------------------------+

+---- HEADER -----------------------------------------------------------------------+
| <SVG: app-logo 120x32>                                             [icon: :bell:] |
| "User management"                                                  [icon: :menu:] |
+-----------------------------------------------------------------------------------+

+---- BODY -------------------------------------------------------------------------+
| +---- SIDEBAR -----------------+ +---- MAIN ------------------------------------+ |
| | [Nav: :home: Dashboard]      | | <Component#user-search: SearchBar>           | |
| | [Nav active: :users: Users]  | |   <Input: Keyword>                           | |
| | [Nav: :settings: Settings]   | |   <Select: Status>                           | |
| |                              | |   [icon: :search:]                           | |
| |                              | | </Component>                                 | |
| |                              | |                                              | |
| |                              | | <DataGrid>                                   | |
| |                              | |  columns: Name | Status | Actions            | |
| |                              | |  features: sort, filter, paginate            | |
| |                              | | </DataGrid>                                  | |
| |                              | |                                              | |
| |                              | | <Toast: success> Saved                       | |
| +------------------------------+ +----------------------------------------------+ |
+-----------------------------------------------------------------------------------+

+---- FOOTER -----------------------------------------------------------------------+
| "© 2026 Company"                                                                  |
+-----------------------------------------------------------------------------------+
```

---

## 17. Usage rules

- Use the same notation in specifications, PRs, and review comments.
- Prioritize structure, roles, states, and actions over exact visual reproduction.
- Annotate framework-specific names only when necessary, keeping the body notation neutral.
- Describe complex screens in this order: overall layout, main component details, then state differences.
- When adopting a design system, maintain a separate mapping to internal component names.

---

## 18. Coverage notes

This specification covers the following categories commonly found in UI libraries:

- layout
- navigation
- form controls
- data display
- feedback
- overlays
- pickers
- icons/assets
- reusable components
- state / responsive / accessibility

---

## 19. Out of scope

- Pixel-perfect reproduction
- Detailed animation timelines
- Complete representation of raw SVG or CSS
- Replacing implementation code itself

---

## 20. Version history

- v1.2: Added notation for data grids, pickers, toasts, drawers, popovers, responsiveness, and accessibility, based on the main patterns in MUI / Ant Design / Chakra UI / Bootstrap / Radix.
