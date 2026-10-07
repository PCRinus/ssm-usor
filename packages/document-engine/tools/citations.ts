import { readFileSync, writeFileSync } from 'node:fs';

import { buildCitationIndex, serializeIndex, templatesUrl } from './template-sources';

const index = buildCitationIndex();
writeFileSync(new URL('citations.json', templatesUrl), serializeIndex(index));

const { acts } = JSON.parse(readFileSync(new URL('legal-acts.json', templatesUrl), 'utf8')) as {
  acts: { id: string }[];
};
const known = new Set(acts.map((act) => act.id));
const unknown = [...new Set(index.citations.map((citation) => citation.act))].filter(
  (id) => !known.has(id)
);

console.log(
  `${index.citations.length} citations of ${new Set(index.citations.map((c) => c.act)).size} acts`
);
if (unknown.length) {
  console.error(`Not in legal-acts.json, add them: ${unknown.join(', ')}`);
  process.exitCode = 1;
}
