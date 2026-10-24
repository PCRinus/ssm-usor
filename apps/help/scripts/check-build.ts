import console from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

import { ArticleError, collectTopics, readArticles } from './lib/articles';
import { builtTextFiles, leakedMetadata, missingAnchors, readBuiltText } from './lib/build';
import { distDirectory, docsDirectory } from './lib/paths';

try {
  const articles = readArticles(docsDirectory);
  const topics = collectTopics(articles);
  const problems = [
    ...missingAnchors(topics, (path) => {
      const file = join(distDirectory, path, 'index.html');
      return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    }),
    ...leakedMetadata(
      articles,
      builtTextFiles(distDirectory).map((file) => ({
        name: relative(distDirectory, file),
        text: readBuiltText(file),
      }))
    ),
  ];
  if (problems.length) {
    console.error(`The built help site does not match its articles:\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Checked the help topics (${Object.keys(topics).length}) against the built site.`);
  }
} catch (error) {
  if (!(error instanceof ArticleError)) throw error;
  console.error(`The help articles' topics are not valid:\n${error.message}`);
  process.exitCode = 1;
}
