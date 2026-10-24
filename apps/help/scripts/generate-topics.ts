import console from 'node:console';
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import process from 'node:process';

import { ArticleError, collectTopics, readArticles, renderTopicsModule } from './lib/articles';
import { docsDirectory, repositoryRoot, topicsModule } from './lib/paths';

try {
  const topics = collectTopics(readArticles(docsDirectory));
  writeFileSync(topicsModule, renderTopicsModule(topics));
  console.log(
    `Wrote the help topics (${Object.keys(topics).length}) to ${relative(repositoryRoot, topicsModule)}.`
  );
} catch (error) {
  if (!(error instanceof ArticleError)) throw error;
  console.error(`The help articles' topics are not valid:\n${error.message}`);
  process.exitCode = 1;
}
