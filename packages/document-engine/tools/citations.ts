import { writeFileSync } from 'node:fs';

import { buildCitationIndex, serializeIndex, templatesUrl } from './template-sources';

const index = buildCitationIndex();
writeFileSync(new URL('citations.json', templatesUrl), serializeIndex(index));

console.log(
  `${index.citations.length} citations of ${new Set(index.citations.map((c) => c.act)).size} acts`
);
