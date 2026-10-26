import type { APIRoute } from 'astro';

import { faq, footer, hero, links, nav, navHref, page, steps } from '../components/site/copy';

function llmsTxt(site: URL): string {
  const url = (path: string) => new URL(path, site).href;

  const stepLines = steps.items.map((step, index) => `${index + 1}. ${step.title} ${step.text}`);
  const pageLinks = [
    `- [${page.siteName}](${url('/')}): ${hero.title}`,
    ...nav.map((item) => `- [${item.label}](${url(navHref(item.href))})`),
    ...footer.legal.map((item) => `- [${item.label}](${url(item.href)})`),
  ];
  const questions = faq.items.map((item) => `### ${item.q}\n\n${item.a}`);

  return (
    [
      `# ${page.siteName}`,
      `> ${page.description}`,
      hero.lede,
      `${steps.title}\n\n${stepLines.join('\n')}`,
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
