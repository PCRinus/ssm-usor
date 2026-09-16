# Shared UI and styling

The dashboard uses Tailwind CSS v4 through `@tailwindcss/vite` and the shared shadcn
primitives in `packages/ui`. The marketing site uses neither: it is a static Astro site with
scoped component styles, and it shares only the design tokens. React, shadcn and Lucide are
deliberately absent from `apps/marketing`; add the React integration back only when a page
needs a genuinely interactive island.

## Package boundaries

- `packages/design-tokens/src/tokens.css` owns framework-neutral CSS variables for brand colors,
  semantic colors, typography, and radii. Both apps import it: the dashboard through the UI
  package, the marketing site directly in `apps/marketing/src/styles/global.css`, where
  `src/styles/flux.css` derives its page roles (`--ink`, `--lime`, `--line`, and so on) from the
  brand variables. Inter is the token font with system fallbacks; this package does not download
  a font. The marketing site loads Newsreader and Source Sans 3 from Google Fonts on top.
- `packages/design-tokens/src/theme.css` maps those variables to Tailwind utilities such as
  `bg-primary`, `text-muted-foreground`, `bg-brand-lime`, and `rounded-lg`.
- `packages/ui/src/styles/globals.css` imports Tailwind, the theme, animation utilities, and
  shared base styles. It registers the UI source directory for Tailwind scanning.
- `packages/ui/src/components` contains the editable shadcn components: Button, Input, Label,
  Card, Badge, Avatar, Breadcrumb, Dropdown Menu, Separator, Sidebar, Sheet, Skeleton,
  Table, and Tooltip. The registry's `cn` utility merges conditional classes and Tailwind overrides;
  it is also available through `@ssm-usor/ui/lib/utils`.

The UI package exports TypeScript source, so Vite and Astro compile only the components they use.
Its build command checks types; no separate JavaScript bundle is needed. React remains a peer
dependency supplied by each application.

## App styles

The dashboard imports `@ssm-usor/ui/globals.css` once in its CSS entry point and adds its own
`@source` directory, relative to that CSS file:

```css
/* apps/app/src/styles.css */
@import '@ssm-usor/ui/globals.css';
@source './';
```

Shared Tailwind imports disable automatic scanning with `source(none)` so builds do not pull
utility classes from unrelated apps. Use complete class names in source; Tailwind cannot
discover interpolated class fragments. App-wide resets belong in `@layer base` so component
utilities can override them.

The marketing site's `global.css` imports the tokens and a small base reset of its own; every
section is styled in the `<style>` block of its Astro component.

## React usage

```tsx
import { Button } from '@ssm-usor/ui/components/button';

<Button variant="outline">Continuă</Button>;
```

## Adding components

From the repository root:

```bash
pnpm ui:add separator
```

The pinned shadcn CLI runs against the dashboard's `components.json` and routes shared
primitives and their dependencies into `packages/ui`. App-specific blocks stay in the dashboard.
The dashboard and the UI package use the same `new-york` registry style, neutral base color,
Lucide icon setting, and CSS variables. The brand palette comes from our tokens rather than
neutral registry defaults. Sidebar colors are also mapped through the shared design tokens.
Responsive and sidebar context hooks live in `packages/ui/src/hooks`; import `useSidebar`
from `@ssm-usor/ui/hooks/use-sidebar`.

Review any generated CSS additions: keep brand token definitions in `packages/design-tokens`.
Run formatting, linting, type checks, and builds after adding components:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm build
```
