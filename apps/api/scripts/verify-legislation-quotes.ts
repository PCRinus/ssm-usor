import console from 'node:console';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { citationIndex, legalActs } from '@ssm-usor/document-engine/citations';
import {
  assessImpact,
  fetchActText,
  legalActsSchema,
  portalOptionsFromEnv,
} from '@ssm-usor/legislation-check';

// Compares every quote of the built-in templates with its act's current text on the portal:
//   pnpm legislation:verify-quotes [--acts <file.json>] [--only <id,id>] [--save <dir> | --from <dir>]
// --from reads the pages kept by --save instead of asking the portal again.

const { values } = parseArgs({
  options: {
    acts: { type: 'string' },
    only: { type: 'string' },
    save: { type: 'string' },
    from: { type: 'string' },
  },
});
const cwd = process.env.INIT_CWD ?? '.';
const { acts } = legalActsSchema.parse(
  values.acts
    ? JSON.parse(readFileSync(path.resolve(cwd, values.acts), 'utf8'))
    : { acts: legalActs() }
);
const only = values.only ? new Set(values.only.split(',')) : null;
const citations = citationIndex();
const quoted = acts.filter(
  (act) =>
    (!only || only.has(act.id)) &&
    citations.some((citation) => citation.act === act.id && citation.form === 'quote')
);

const fileOf = (dir: string, url: string) =>
  path.join(path.resolve(cwd, dir), `${new URL(url).pathname.replaceAll('/', '_')}.html`);

const fetchPage: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (values.from) {
    const file = fileOf(values.from, url);
    return existsSync(file)
      ? new Response(readFileSync(file, 'utf8'), { status: 200 })
      : new Response('', { status: 404 });
  }
  const response = await fetch(input, init);
  if (!values.save || response.status !== 200) return response;
  const body = await response.text();
  mkdirSync(path.resolve(cwd, values.save), { recursive: true });
  writeFileSync(fileOf(values.save, url), body);
  return new Response(body, { status: response.status, headers: response.headers });
};

const portal = {
  ...portalOptionsFromEnv(process.env),
  fetch: fetchPage,
  pauseMs: values.from ? 0 : 2_500,
};
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
let failed = 0;
let differing = 0;
let unlocated = 0;

for (const [index, act] of quoted.entries()) {
  if (index > 0 && !values.from) await new Promise((resolve) => setTimeout(resolve, 2_500));
  const quotes = citations.filter(
    (citation) => citation.act === act.id && citation.form === 'quote'
  );
  if (act.portalId === null) {
    console.log(`${act.name}: no portal id, ${quotes.length} quotes not checked`);
    continue;
  }
  let fetched;
  try {
    fetched = await fetchActText(act.portalId, portal);
  } catch (error) {
    failed += 1;
    console.log(`${act.name}: FAILED, ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const impact = assessImpact({
    actId: act.id,
    citations: quotes,
    text: fetched.text,
    since: null,
  });
  const seen = new Map<string, (typeof impact.citations)[number] & { files: string[] }>();
  for (const result of impact.citations) {
    const key = `${result.citation.locator}\n${result.citation.text}`;
    const entry = seen.get(key);
    if (entry) entry.files.push(result.citation.file);
    else seen.set(key, { ...result, files: [result.citation.file] });
  }
  const results = [...seen.values()];
  const differs = results.filter((result) => result.status === 'quote_differs');
  const lost = results.filter((result) => result.status === 'not_located');
  differing += differs.length;
  unlocated += lost.length;
  const latest = fetched.text.notes
    .map((note) => note.date)
    .sort()
    .at(-1);
  const latestActs = [
    ...new Set(
      fetched.text.notes
        .filter((note) => note.date === latest)
        .flatMap((note) => (note.amendingAct ? [note.amendingAct.name] : []))
    ),
  ];
  console.log(
    `${act.name} (${act.id}): ${fetched.source === 'afis' ? `text from ${fetched.url}` : 'text on the act page'}` +
      `${fetched.annexUrls.length > 0 ? `, annexes from ${fetched.annexUrls.join(', ')}` : ''}` +
      `, consolidated ${fetched.consolidatedOn ?? 'never'}` +
      `${latest ? `, newest note ${latest} by ${latestActs.join(', ') || 'an act not named'}` : ''}` +
      `; ${results.length} distinct quotes, ${results.length - lost.length} located, ${differs.length} differ`
  );
  for (const result of [...differs, ...lost]) {
    const where = `${result.citation.locator} [${[...new Set(result.files)].join(', ')}]`;
    if (result.status === 'not_located') {
      console.log(
        `  NOT LOCATED ${where}${result.similarity === null ? ', no such unit' : `, ${Math.round(result.similarity * 100)}% of its words found`}`
      );
      continue;
    }
    if (result.status !== 'quote_differs') continue;
    const adapted = result.citation.text?.includes('{{') ? ', adapted with merge fields' : '';
    console.log(
      `  DIFFERS ${where}, ${Math.round(result.similarity * 100)}% of its words found${adapted}`
    );
    for (const difference of result.differences) {
      const label = difference.alineat ? `alin. (${difference.alineat})` : 'text';
      for (const change of difference.changes) {
        console.log(
          `    ${label}: «${oneLine(change.template) || '∅'}» → «${oneLine(change.current) || '∅'}»`
        );
      }
    }
  }
}

console.log(
  `${quoted.length} acts with quotes: ${failed} failed, ${differing} quotes differ, ${unlocated} not located.`
);
if (failed > 0) process.exitCode = 1;
