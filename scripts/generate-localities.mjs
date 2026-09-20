//   node scripts/generate-localities.mjs path/to/siruta_s1_2026.csv
//
// The input is the SIRUTA register of the National Institute of Statistics, from
// https://data.gov.ro/dataset?q=siruta ("SIRUTA_s1 <year>", CC BY 4.0, credited in apps/app/src/localities/README.md).
// It changes a few times a year at most; download the newest file and run this again.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'apps/app/src/localities/data');
const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/generate-localities.mjs <siruta.csv>');
  process.exit(1);
}

const counties = [
  ...readFileSync(join(root, 'packages/contracts/src/counties.ts'), 'utf8').matchAll(
    /\{ code: '([A-Z]{1,2})', name: '([^']+)' \}/g
  ),
].map(([, code, name]) => ({ code, name }));

// The register is in capitals and spells ș and ț with the cedilla forms of older encodings.
const particles = new Set(['de', 'din', 'la', 'lui', 'cel', 'cea', 'pe', 'sub', 'cu', 'și', 'în']);
function titleCase(text) {
  return text
    .toLocaleLowerCase('ro')
    .replaceAll('ş', 'ș')
    .replaceAll('ţ', 'ț')
    .split(' ')
    .map((word, index) =>
      index > 0 && particles.has(word)
        ? word
        : word
            .split('-')
            .map((part) => part.charAt(0).toLocaleUpperCase('ro') + part.slice(1))
            .join('-')
    )
    .join(' ');
}

const plain = (text) =>
  titleCase(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const [header, ...lines] = readFileSync(source, 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .filter(Boolean);
const columns = header.split(';');
const rows = lines.map((line) => {
  const cells = line.split(';');
  return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
});

const countyOfJud = new Map();
for (const row of rows.filter((row) => row.NIV === '1')) {
  const name = plain(row.DENLOC.replace(/^(JUDEŢUL|MUNICIPIUL) /, ''));
  const county = counties.find((county) => plain(county.name) === name);
  if (!county) throw new Error(`No county named like "${row.DENLOC}".`);
  countyOfJud.set(row.JUD, county.code);
}

function parentLabel(denloc) {
  if (denloc.startsWith('MUNICIPIUL ')) return `mun. ${titleCase(denloc.slice(11))}`;
  if (denloc.startsWith('ORAŞ ')) return `oraș ${titleCase(denloc.slice(5))}`;
  return `com. ${titleCase(denloc)}`;
}
const parents = new Map(
  rows.filter((row) => row.NIV === '2').map((row) => [row.SIRUTA, parentLabel(row.DENLOC)])
);

const byCounty = new Map(counties.map((county) => [county.code, []]));
for (const row of rows.filter((row) => row.NIV === '3')) {
  const sector = row.DENLOC.match(/^BUCUREŞTI (SECTORUL \d)$/);
  byCounty
    .get(countyOfJud.get(row.JUD))
    .push([titleCase(sector ? sector[1] : row.DENLOC), parents.get(row.SIRSUP)]);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const collator = new Intl.Collator('ro');
let total = 0;
for (const [code, localities] of byCounty) {
  if (localities.length === 0) throw new Error(`No localities for ${code}.`);
  localities.sort((a, b) => collator.compare(a[0], b[0]) || collator.compare(a[1], b[1]));
  // One pair per line, the way Prettier leaves the file, so a new edition reads as a diff.
  const pairs = localities.map(
    ([name, parent]) => `  [${JSON.stringify(name)}, ${JSON.stringify(parent)}]`
  );
  writeFileSync(join(outDir, `${code}.json`), `[\n${pairs.join(',\n')}\n]\n`);
  total += localities.length;
}
console.log(`${total} localities in ${byCounty.size} counties.`);
