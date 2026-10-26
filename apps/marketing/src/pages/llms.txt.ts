import type { APIRoute } from 'astro';

import { faq, footer, hero, links, nav, navHref, page, steps } from '../components/site/copy';
import {
  addOns,
  calculator,
  enterprise,
  eur,
  pricedPlans,
  pricingLinks,
  pricingPage,
} from '../components/site/pricing';

function llmsTxt(site: URL): string {
  const url = (path: string) => new URL(path, site).href;

  const stepLines = steps.items.map((step, index) => `${index + 1}. ${step.title} ${step.text}`);
  const pageLinks = [
    `- [${page.siteName}](${url('/')}): ${hero.title}`,
    ...nav.map((item) => `- [${item.label}](${url(navHref(item.href))})`),
    `- [${calculator.heading}](${url(pricingLinks.calculator)})`,
    ...footer.legal.map((item) => `- [${item.label}](${url(item.href)})`),
  ];
  const questions = faq.items.map((item) => `### ${item.q}\n\n${item.a}`);
  const planBlock = (heading: string, lead: string | undefined, lines: { text: string }[]) =>
    [heading, ...(lead ? [`  ${lead}`] : []), ...lines.map((line) => `  - ${line.text}`)].join(
      '\n'
    );
  const plans = [
    ...pricedPlans.map((plan) =>
      planBlock(
        `- ${plan.name}: ${eur(plan.monthly)} + TVA pe lună sau ${eur(plan.annual)} + TVA pe an. ${plan.who}`,
        plan.lead,
        plan.lines
      )
    ),
    planBlock(
      `- ${enterprise.name}: ${enterprise.ask.toLowerCase()}. ${enterprise.who}`,
      enterprise.lead,
      enterprise.lines
    ),
    ...addOns.items.map((item) => `- ${item.label}: ${item.price}`),
  ];

  return (
    [
      `# ${page.siteName}`,
      `> ${page.description}`,
      hero.lede,
      `${steps.title}\n\n${stepLines.join('\n')}`,
      `## Prețuri\n\n${pricingPage.intro} ${pricingPage.footnote}\n\n${plans.join('\n')}`,
      `Contact: ${links.email}`,
      `## Pagini\n\n${pageLinks.join('\n')}`,
      `## ${faq.title}\n\n${questions.join('\n\n')}`,
    ].join('\n\n') + '\n'
  );
}

export const GET: APIRoute = ({ site, url }) =>
  new Response(llmsTxt(site ?? url), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
