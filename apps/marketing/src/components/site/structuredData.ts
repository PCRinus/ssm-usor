import { type Faq, faq, links, page } from './copy';
import { legalEntity } from './legal';
import { pricedPlans, pricingLinks, pricingPage } from './pricing';

function offers(site: URL) {
  const url = new URL(pricingLinks.page, site).href;
  const price = (value: number, duration: string) => ({
    '@type': 'UnitPriceSpecification',
    price: value,
    priceCurrency: 'EUR',
    billingDuration: duration,
    valueAddedTaxIncluded: false,
  });
  return pricedPlans.map((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    description: plan.who,
    url,
    price: plan.monthly,
    priceCurrency: 'EUR',
    priceSpecification: [price(plan.monthly, 'P1M'), price(plan.annual, 'P1Y')],
  }));
}

function software(site: URL) {
  const home = new URL('/', site).href;
  return {
    '@type': 'SoftwareApplication',
    '@id': `${home}#software`,
    name: page.siteName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ro',
    url: home,
    description: page.description,
    publisher: { '@id': `${home}#organization` },
    offers: offers(site),
  };
}

function faqPage(id: string, url: string, items: Faq[]) {
  return {
    '@type': 'FAQPage',
    '@id': id,
    url,
    inLanguage: 'ro',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

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
      software(site),
      faqPage(`${home}#intrebari`, home, faq.items),
    ],
  };
}

export function pricingStructuredData(site: URL) {
  const url = new URL(pricingLinks.page, site).href;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: pricingPage.title,
        description: pricingPage.description,
        inLanguage: 'ro',
        about: { '@id': `${new URL('/', site).href}#software` },
      },
      software(site),
      faqPage(`${url}#intrebari`, url, pricingPage.faq),
    ],
  };
}

// Inside a script element "</script>" or "<!--" in the copy would end or corrupt the block.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
