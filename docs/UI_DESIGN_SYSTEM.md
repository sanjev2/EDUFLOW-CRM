# EduFlow UI Design System

## Reference adaptation

The supplied DashStack Figma community file was used only as visual inspiration for familiar dashboard conventions: a controlled sidebar, compact top bar, light application canvas, white cards, restrained shadows, metric summaries and responsive data regions. EduFlow uses original navigation, education content, dimensions and source code. The future public landing page can reuse these tokens without being redesigned in this stage.

## Tokens

| Token | Value | Use |
|---|---:|---|
| Deep navy | `#043873` | Navigation and strong text |
| Primary blue | `#4F9CF9` | Primary actions |
| Primary hover | `#2E7FDB` | Interactive hover |
| Light blue | `#C4DEFD` | Selected and informational surfaces |
| App background | `#F5F6FA` | Authenticated canvas |
| Surface | `#FFFFFF` | Cards, top bar and forms |
| Primary text | `#202224` | Body and headings |
| Muted text | `#6B7280` | Supporting copy |
| Border | `#E5E7EB` | Subtle separation |
| Success | `#22C55E` | Successful status |
| Warning | `#F59E0B` | Attention/overdue status |
| Danger | `#EF4444` | Destructive/error status |

Tokens live as CSS custom properties in `frontend/src/app/globals.css` and are consumed by Tailwind arbitrary-value utilities and reusable components.

## Typography and spacing

DM Sans is preferred, followed by Inter and the system sans-serif stack. Page headings are 24–30px, panel headings 18–20px and body text 14–16px. The interface follows an 8-point spacing rhythm with practical 4px exceptions for tight label relationships.

## Radius and shadows

Controls use 10px radii and cards use 12px. Shadows are deliberately subtle and paired with borders. There is no glassmorphism, decorative gradient or unnecessary motion.

## Components

- Primary buttons are solid blue, have a minimum 44px target and are reserved for the main page action.
- Secondary and destructive actions use borders or text emphasis.
- Forms use persistent labels, descriptions/errors, visible focus and grouped sections.
- Tables use semantic elements inside controlled horizontal regions; essential actions remain text-labelled.
- Status badges always include text and never communicate by colour alone.
- Cards use white surfaces and meaningful headings, not equal emphasis for every action.

## Navigation and breakpoints

Desktop navigation is 248px and can collapse to 80px. The top bar is sticky. Below the `md` breakpoint the sidebar becomes a labelled modal drawer with overlay, close control and Escape handling. Dashboard grids reduce progressively at `sm`, `md`, `lg` and `xl`; page-level containers use `min-width: 0` and avoid horizontal overflow.

Student navigation: Dashboard, My Profile, My Application, Documents, Security and Logout.

Counsellor navigation: Dashboard, Assigned Students, Tasks, Security and Logout.

Administrator navigation: Dashboard, Users, Assignments, Audit Logs, Security Alerts, Security and Logout.

Navigation visibility improves usability but the API remains the authority.

## Accessibility

- One visible H1 is provided by the application shell.
- Semantic header, nav, main, sections, tables, lists and form labels are used.
- Icon-only controls have accessible labels and at least 44px practical targets.
- Focus uses a three-pixel visible outline.
- Drawer dismissal supports Escape and returns focus to the menu trigger.
- Status changes use `role="status"`; errors use `role="alert"`.
- Colours were selected for WCAG AA use; success/warning/danger foregrounds use darker accessible variants.
- `prefers-reduced-motion` disables non-essential animation.
- Layouts were designed for 320, 375, 768, 1024 and 1440px widths and 200% zoom.
