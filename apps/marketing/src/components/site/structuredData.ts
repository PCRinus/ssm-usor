import { faq, links, page } from './copy';
import { legalEntity } from './legal';

export function homeStructuredData(site: URL) {
  const home = new URL('/', site).href;
  const organizationId = `${home}#organization`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: page.siteName,
        legalName: legalEntity.name,
        url: home,
        logo: new URL('/brand/logo.png', site).href,
        email: links.email,
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        name: page.siteName,
        url: home,
        inLanguage: 'ro',
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${home}#software`,
        name: page.siteName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'ro',
        url: home,
        description: page.description,
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'FAQPage',
        '@id': `${home}#intrebari`,
        url: home,
        inLanguage: 'ro',
        mainEntity: faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}

// Inside a script element "</script>" or "<!--" in the copy would end or corrupt the block.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
