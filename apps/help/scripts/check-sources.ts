import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { appendFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

import { readArticles } from './lib/articles';
import { docsDirectory, repositoryRoot } from './lib/paths';
import { staleArticles, stepSummary, warningAnnotation } from './lib/sources';

// Only ever a warning: most changes to a source do not change what a member sees (ADR 028).
try {
  const base = process.argv[2];
  if (!base) throw new Error('Pass the commit to compare with, such as HEAD^1.');
  const changed = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const articles = readArticles(docsDirectory).map((article) => ({
    file: relative(repositoryRoot, join(docsDirectory, article.file)).split(sep).join('/'),
    sources: article.sources,
  }));
  const stale = staleArticles(articles, changed);
  for (const article of stale) console.log(warningAnnotation(article));
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary && stale.length) appendFileSync(summary, stepSummary(stale));
  if (!stale.length) console.log('No help article describes a file this change touches.');
} catch (error) {
  console.log(
    `::warning title=Help article check did not run::${error instanceof Error ? error.message : String(error)}`
  );
}
