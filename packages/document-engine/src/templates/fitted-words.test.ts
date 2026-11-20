import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { setSamples } from '../../tools/set-samples';
import { renderDocument } from '../render';
import { convert, converter } from '../test/converter';
import { decode, isTextPart } from '../text';
import { read } from './read';

// The word check joins a word printed across two lines before it counts it, so it cannot see a
// word broken inside it. A table whose widths the merge fits to its content must break none.

const plan = '10_prevention_plan.docx';
// LibreOffice breaks a line after any hyphen, one before a digit too ("0722-" over "123-456") when
// the number reaches the end of a line; the widths only make room for the whole number.
function hyphenPieces(token: string) {
  const pieces = token.split(/(?<=[^\s]-)/);
  return pieces.flatMap((_, start) =>
    pieces.slice(start).map((__, length) => pieces.slice(start, start + length + 1).join(''))
  );
}

function docxTokens(docx: Uint8Array) {
  const zip = new PizZip(docx);
  const tokens = new Set<string>();
  for (const name of Object.keys(zip.files).filter(isTextPart)) {
    const text = [
      ...zip
        .file(name)!
        .asText()
        .matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<\/w:p>|<w:(?:tab|br|cr)\/>/g),
    ]
      .map((match) => (match[1] === undefined ? ' ' : decode(match[1])))
      .join('');
    for (const token of text.split(/\s+/).filter(Boolean)) {
      tokens.add(token);
      for (const piece of hyphenPieces(token)) tokens.add(piece);
    }
  }
  return tokens;
}

async function pdfTokens(pdf: Uint8Array) {
  const loading = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const document = await loading.promise;
  const tokens: string[] = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const content = await (await document.getPage(number)).getTextContent();
      for (const item of content.items)
        if ('str' in item) tokens.push(...item.str.split(/\s+/).filter(Boolean));
    }
  } finally {
    await loading.destroy();
  }
  return tokens;
}

async function brokenWords(docx: Uint8Array) {
  const known = docxTokens(docx);
  return (await pdfTokens(await convert(docx))).filter(
    (token) => !known.has(token) && !/^\d+$/.test(token)
  );
}

type Row = Record<string, unknown> & { description: string };
type Sample = { riskAssessment: { evaluations: { plan: Row[] }[] } };

const long = setSamples.find(({ label }) => label === 'long')!.data as unknown as Sample;
const stress = structuredClone(long);
stress.riskAssessment.evaluations = stress.riskAssessment.evaluations.map((evaluation) => ({
  ...evaluation,
  plan: evaluation.plan.map((row, index) => ({
    ...row,
    description: `${row.description} Neconformitățile instalațiilor electroizolante.`,
    technical: '– Supraveghere-electrotehnică permanentă.\n– Echipamente termoizolante.',
    organizational: index % 2 ? '—' : '– Verificarea neconformităților constatate.',
    deadline: '31-12-2026',
    responsiblePerson: 'Ion Popescu, 0722-123-456',
  })),
}));

const samples = [
  ...setSamples.map(({ label, data }) => ({ label, data })),
  {
    label: 'long words, dates and phone numbers',
    data: stress as unknown as Record<string, unknown>,
  },
];

describe.skipIf(!converter)('a table fitted to its content', () => {
  it('is caught breaking a word', async () => {
    const zip = new PizZip(renderDocument(read(plan), stress));
    const xml = zip.file('word/document.xml')!.asText();
    const narrowed = xml.replace(
      /(<w:tblGrid><w:gridCol w:w="\d+"\/>)<w:gridCol w:w="(\d+)"\/><w:gridCol w:w="(\d+)"\/>/g,
      (_, first: string, second: string, third: string) =>
        `${first}<w:gridCol w:w="700"/><w:gridCol w:w="${Number(second) + Number(third) - 700}"/>`
    );
    expect(narrowed).not.toBe(xml);
    zip.file('word/document.xml', narrowed.replace(/<w:tcW w:w="\d+" w:type="dxa"\/>/g, ''));
    expect(await brokenWords(zip.generate({ type: 'uint8array' }))).not.toEqual([]);
  }, 60_000);

  it.each(samples)(
    'breaks no word of the prevention plan ($label)',
    async ({ data }) => {
      expect(await brokenWords(renderDocument(read(plan), data))).toEqual([]);
    },
    60_000
  );
});
