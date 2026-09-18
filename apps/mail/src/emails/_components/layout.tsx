import type { CSSProperties, ReactNode } from 'react';
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'react-email';

import { color, font, site } from '../../theme';

type LayoutProps = {
  preview: string;
  children: ReactNode;
  /** Why the recipient got this email; shown in the footer. */
  reason: string;
};

export function Layout({ preview, children, reason }: LayoutProps) {
  return (
    <Html lang="ro">
      <Head />
      <Body style={body}>
        <Preview>{preview}</Preview>
        <Container style={container}>
          {/* The wordmark is dark, so it always sits on the white card. */}
          <Section style={header}>
            <Link href={site.url}>
              <Img src={site.logoUrl} alt={site.name} width="150" height="50" />
            </Link>
          </Section>
          <Section style={content}>{children}</Section>
          <Section style={footer}>
            <Hr style={rule} />
            <Text style={footnote}>{reason}</Text>
            <Text style={footnote}>
              {site.name} ·{' '}
              <Link href={site.url} style={footerLink}>
                ssmusor.ro
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: CSSProperties = {
  margin: 0,
  padding: '32px 12px',
  backgroundColor: color.cream,
  fontFamily: font.sans,
  color: color.forest,
};

const container: CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: color.paper,
  border: `1px solid ${color.border}`,
  borderRadius: '12px',
};

const header: CSSProperties = { padding: '28px 32px 0' };
const content: CSSProperties = { padding: '20px 32px 8px' };
const rule: CSSProperties = { margin: '0 0 16px', borderTop: `1px solid ${color.border}` };
const footer: CSSProperties = { padding: '16px 32px 24px' };

const footnote: CSSProperties = {
  margin: '8px 0 0',
  fontSize: '13px',
  lineHeight: '20px',
  color: color.muted,
};

const footerLink: CSSProperties = { color: color.muted, textDecoration: 'underline' };
