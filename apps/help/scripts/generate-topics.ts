import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

import { ArticleError, collectTopics, readArticles, renderTopicsModule } from './lib/articles';
import { docsDirectory, repositoryRoot, topicsModule } from './lib/paths';
import { unmatchedSources } from './lib/sources';

try {
  const articles = readArticles(docsDirectory);
  const tracked = execFileSync('git', ['ls-files'], { cwd: repositoryRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const unmatched = unmatchedSources(
    articles.map((article) => ({
      file: relative(repositoryRoot, join(docsDirectory, article.file)).split(sep).join('/'),
      sources: article.sources,
    })),
    tracked
  );
  if (unmatched.length) {
    throw new ArticleError(
      unmatched.map(
        ({ file, source }) => `${file}: the source ${source} matches no file in the repository.`
      )
    );
  }
  const topics = collectTopics(articles);
  writeFileSync(topicsModule, renderTopicsModule(topics));
  console.log(
    `Wrote the help topics (${Object.keys(topics).length}) to ${relative(repositoryRoot, topicsModule)}.`
  );
} catch (error) {
  if (!(error instanceof ArticleError)) throw error;
  console.error(`The help articles' topics are not valid:\n${error.message}`);
  process.exitCode = 1;
}
