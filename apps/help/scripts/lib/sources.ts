import { matchesGlob } from 'node:path';

export interface ArticleSources {
  /** Relative to the repository root. */
  file: string;
  sources: string[];
}

export interface StaleArticle {
  file: string;
  changedSources: string[];
}

export function staleArticles(articles: ArticleSources[], changedFiles: string[]): StaleArticle[] {
  const changed = new Set(changedFiles);
  return articles
    .filter((article) => !changed.has(article.file))
    .map((article) => ({
      file: article.file,
      changedSources: changedFiles.filter((path) =>
        article.sources.some((source) => path === source || matchesGlob(path, source))
      ),
    }))
    .filter((article) => article.changedSources.length > 0);
}

export function warningAnnotation(article: StaleArticle): string {
  const sources = article.changedSources.join(', ');
  return `::warning file=${article.file},title=Help article may be out of date::${article.file} describes ${sources}, which this pull request changes. Update the article if what a member sees has changed.`;
}

export function stepSummary(articles: StaleArticle[]): string {
  if (!articles.length) return '';
  const lines = articles.map(
    (article) =>
      `- \`${article.file}\`: ${article.changedSources.map((path) => `\`${path}\``).join(', ')}`
  );
  return [
    '### Help articles whose sources changed',
    '',
    'These articles describe files this pull request changes, and were not changed themselves. Update each one if what a member sees has changed.',
    '',
    ...lines,
    '',
  ].join('\n');
}
