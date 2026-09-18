import type { CSSProperties, ReactNode } from 'react';
import { Button, Heading, Link, Text } from 'react-email';

import { color, font } from '../../theme';

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={title}>
      {children}
    </Heading>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={paragraph}>{children}</Text>;
}

export function Action({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button href={href} style={action}>
      {children}
    </Button>
  );
}

/** The same destination as the button, for clients that strip it. */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Text style={fallback}>
      Dacă butonul nu funcționează, copiază adresa în browser:
      <br />
      <Link href={href} style={fallbackLink}>
        {href}
      </Link>
    </Text>
  );
}

const title: CSSProperties = {
  margin: '0 0 12px',
  fontFamily: font.serif,
  fontSize: '26px',
  lineHeight: '32px',
  fontWeight: 500,
  color: color.forest,
};

const paragraph: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '16px',
  lineHeight: '26px',
  color: color.forest,
};

const action: CSSProperties = {
  boxSizing: 'border-box',
  margin: '4px 0 20px',
  padding: '13px 22px',
  borderRadius: '10px',
  backgroundColor: color.forest,
  color: color.onForest,
  fontSize: '16px',
  fontWeight: 600,
  textDecoration: 'none',
};

const fallback: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '13px',
  lineHeight: '20px',
  color: color.muted,
};

const fallbackLink: CSSProperties = { color: color.muted, wordBreak: 'break-all' };
