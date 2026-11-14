import type { APIRoute } from 'astro';

import { faq, footer, hero, links, nav, navHref, page, steps } from '../components/site/copy';
import {
  aiCredits,
  calculator,
  count,
  enterprise,
  eur,
  monthlyAt,
  paidYearly,
  perMonth,
  pricingLinks,
  pricingPage,
  smsCodes,
  steppedPlans,
  welcomeCredits,
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
  const planBlock = (heading: string, lines: { text: string }[]) =>
    [heading, ...lines.map((line) => `  - ${line.text}`)].join('\n');
  const stepLine = (plan: (typeof steppedPlans)[number], step: number) => {
    const monthly = monthlyAt(plan, step);
    return {
      text: `Până la ${count(step, 'lucrători')}: ${eur(monthly)} + TVA pe lună, sau ${eur(perMonth(monthly, 'annual'))} pe lună plătit anual (${eur(paidYearly(monthly))} + TVA pe an); ${count(smsCodes(step), 'coduri SMS')} și ${count(aiCredits(step), 'credite AI')} pe lună, ${count(welcomeCredits(step), 'credite AI')} de bun venit.`,
    };
  };
  const plans = [
    ...steppedPlans.map((plan) =>
      planBlock(`- ${plan.name}: ${plan.who}`, [
        ...plan.steps.map((step) => stepLine(plan, step)),
        ...plan.lines,
      ])
    ),
    planBlock(
      `- ${enterprise.name}: ${calculator.enterpriseAsk.toLowerCase()}. ${enterprise.who}`,
      enterprise.lines
    ),
  ];
  const questions = faq.items.map((item) => `### ${item.q}\n\n${item.a}`);
  const pricingQuestions = pricingPage.faq.map((item) => `### ${item.q}\n\n${item.a}`);

  return (
    [
      `# ${page.siteName}`,
      `> ${page.description}`,
      hero.lede,
      `${steps.title}\n\n${stepLines.join('\n')}`,
      `## Prețuri\n\n${pricingPage.intro} ${pricingPage.footnote}\n\n${plans.join('\n')}\n\n${pricingQuestions.join('\n\n')}`,
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
