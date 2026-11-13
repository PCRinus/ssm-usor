import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { citationIndex, legalActs } from '@ssm-usor/document-engine/citations';
import {
  assessImpact,
  fetchActForm,
  fetchPublishedForm,
  portalOptionsFromEnv,
  portalPauseMs,
} from '@ssm-usor/legislation-check';

// What a new form of an act means for the templates, the law compared with itself:
//   pnpm legislation:compare-forms --act oug-195-2002 --verified 2026-08-25 [--current 2026-11-06]
// --verified published compares with the act as published.

const { values } = parseArgs({
  options: {
    act: { type: 'string' },
    verified: { type: 'string' },
    current: { type: 'string' },
  },
});
const act = legalActs().find((each) => each.id === values.act);
if (!act?.portalId || !values.verified) {
  console.error('Give --act, a watched act with a portal id, and --verified, a date.');
  process.exit(1);
}
const portal = portalOptionsFromEnv(process.env);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

const verified =
  values.verified === 'published'
    ? await fetchPublishedForm(act.portalId, portal)
    : await fetchActForm(act.portalId, values.verified, portal);
await setTimeout(portalPauseMs);
const current = await fetchActForm(act.portalId, values.current ?? null, portal);
const describe = (form: typeof verified) =>
  `${form.consolidatedOn ?? 'as published'} (${form.url}${form.annexUrls.length > 0 ? `, annexes ${form.annexUrls.join(', ')}` : ''})`;
console.log(`${act.name}: verified form ${describe(verified)}`);
console.log(`${act.name}: new form ${describe(current)}`);

const impact = assessImpact({ actId: act.id, citations: citationIndex(), verified, current });
console.log(`Outcome: ${impact.outcome}`);
console.log(
  `Amending acts: ${impact.amendingActs.map((each) => each.name).join(', ') || 'none named'}`
);
console.log(
  `Amended units: ${impact.amendedUnits.map((note) => `${note.subject} (${note.operation}, ${note.date})`).join('; ') || 'none'}`
);
for (const reason of impact.review) console.log(`Review: ${reason}`);
console.log(
  `Cited units: ${impact.units.length}, ${impact.units.filter((unit) => unit.status === 'unchanged').length} unchanged`
);
for (const unit of impact.units) {
  if (unit.status === 'unchanged') continue;
  console.log(`  ${unit.unit.label}: ${unit.status}`);
  if (unit.status !== 'changed') continue;
  for (const hunk of unit.hunks) {
    console.log(`    «${oneLine(hunk.old) || '∅'}» → «${oneLine(hunk.new) || '∅'}»`);
  }
}
for (const result of impact.citations) {
  if (result.status === 'unaffected') continue;
  console.log(
    `  ${result.status}: ${result.citation.locator ?? `art. ${result.citation.article}`} [${result.citation.file}]`
  );
}
