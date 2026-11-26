import { describe, expect, it } from 'vitest';

import { links } from './copy';
import { legalEntity } from './legal';
import { homeStructuredData } from './structuredData';

function organization() {
  const graph = homeStructuredData(new URL('https://ssmusor.ro'))['@graph'];
  return graph.find((node) => node['@type'] === 'Organization') as Record<string, unknown>;
}

describe('home structured data', () => {
  it('links the organization to the profiles the footer shows', () => {
    expect(organization().sameAs).toEqual(links.social.map((profile) => profile.href));
    expect(organization().sameAs).toContain('https://www.linkedin.com/company/ssm-u%C8%99or/');
  });

  it('names the VAT number and a support contact', () => {
    expect(organization().vatID).toBe(legalEntity.cui);
    expect(organization().contactPoint).toEqual({
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: links.email,
      availableLanguage: 'ro',
    });
  });

  it('gives the address only as far as the city', () => {
    expect(organization().address).toEqual({
      '@type': 'PostalAddress',
      addressLocality: legalEntity.city,
      addressCountry: 'RO',
    });
  });
});
