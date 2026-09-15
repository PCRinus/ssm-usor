# Shared UI and styling

The dashboard and marketing apps use Tailwind CSS v4 through `@tailwindcss/vite`. Each app
builds its own stylesheet from its source files and the shared UI package.

## Package boundaries

- `packages/design-tokens/src/tokens.css` owns framework-neutral CSS variables for brand colors,
  semantic colors, typography, and radii. The initial light theme uses the marketing site's
  forest green, lime, and warm off-white palette. Inter is preferred when available, with system
  fonts as the fallback; this package does not download a font.
- `packages/design-tokens/src/theme.css` maps those variables to Tailwind utilities such as
  `bg-primary`, `text-muted-foreground`, `bg-brand-lime`, and `rounded-lg`.
- `packages/ui/src/styles/globals.css` imports Tailwind, the theme, animation utilities, and
  shared base styles. It registers the UI source directory for Tailwind scanning.
- `packages/ui/src/components` contains the editable shadcn components: Button, Input, Label,
  Card, and Badge. The registry's `cn` utility merges conditional classes and Tailwind overrides;
  it is also available through `@ssm-usor/ui/lib/utils`.

The UI package exports TypeScript source, so Vite and Astro compile only the components they use.
Its build command checks types; no separate JavaScript bundle is needed. React remains a peer
dependency supplied by each application.

## App styles

Each app imports `@ssm-usor/ui/globals.css` once in its CSS entry point and adds its own
`@source` directory, relative to that CSS file:

```css
/* apps/app/src/styles.css */
@import '@ssm-usor/ui/globals.css';
@source './';
```

Marketing uses `@source '../'` because its entry point lives in `src/styles`. Shared Tailwind
imports disable automatic scanning with `source(none)` so builds do not pull utility classes
from unrelated apps. Use complete class names in source; Tailwind cannot discover interpolated
class fragments.

App-wide resets belong in `@layer base` so component utilities can override them. Marketing's
existing scoped section styles remain in place and can be migrated incrementally. Major brand
colors in the landing page already reference shared tokens.

## React usage

```tsx
import { Button } from '@ssm-usor/ui/components/button';

<Button variant="outline">Continuă</Button>;
```

## Astro usage

Ordinary React primitives can render at build time without hydration:

```astro
---
import { Badge } from '@ssm-usor/ui/components/badge';
import { buttonVariants } from '@ssm-usor/ui/components/button';
---

<Badge variant="secondary">În dezvoltare</Badge>
<a class={buttonVariants({ variant: 'outline' })} href="#pilot">Devino partener pilot</a>
```

The native link retains Astro markup and navigation behavior while sharing Button variants.
For interactions that require React state or event handlers, build a React island and apply
an appropriate Astro `client:*` directive to that island.

## Adding components

From the repository root:

```bash
pnpm ui:add separator
```

The pinned shadcn CLI runs against the dashboard's `components.json` and routes shared
primitives and their dependencies into `packages/ui`. App-specific blocks stay in the dashboard.
Both apps and the UI package use the same `new-york` registry style, neutral base color, Lucide
icon setting, and CSS variables. The brand palette comes from our tokens rather than neutral
registry defaults.

Review any generated CSS additions: keep brand token definitions in `packages/design-tokens`.
Run formatting, linting, type checks, and builds after adding components:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm build
```
