// Email clients ignore CSS variables, so the brand palette from
// packages/design-tokens/src/tokens.css is repeated here as plain values.
export const color = {
  forest: '#18342e',
  lime: '#b6d86f',
  cream: '#f8f7f1',
  paper: '#ffffff',
  onForest: '#eef6f2',
  muted: '#65736d',
  border: '#d4ddd5',
} as const;

export const font = {
  sans: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Newsreader, Georgia, 'Times New Roman', serif",
} as const;

export const site = {
  name: 'SSM Ușor',
  url: 'https://ssmusor.ro',
  // Served by apps/marketing from public/brand. A PNG, because email clients do not render SVG.
  logoUrl: 'https://ssmusor.ro/brand/logo-email.png',
} as const;
