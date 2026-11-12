import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import PizZip from 'pizzip';
import { afterAll, describe, expect, it } from 'vitest';

import { type Citation, templateCitations } from '../src/citations';
import { renderDocument } from '../src/render';
import { documentText, paragraphsOf } from '../src/text';
import { replaceLegalQuote } from './legal-quote';
import { buildCitationIndex, templateSources } from './template-sources';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const templatesFolder = fileURLToPath(new URL('../templates/', import.meta.url));
const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});
const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'legal-quote-'));
  folders.push(folder);
  return folder;
};

const quotesIn = (source: Uint8Array, file: string) =>
  templateCitations({ manifest: 'ssm', file, typeKey: 'test', source }).filter(
    (citation) => citation.form === 'quote'
  );
const parts = (source: Uint8Array) => {
  const zip = new PizZip(source);
  return Object.fromEntries(
    Object.keys(zip.files)
      .filter((name) => !zip.files[name]!.dir)
      .map((name) => [name, zip.file(name)!.asText()])
  );
};

describe('a quote replaced in a templates folder', () => {
  const run = (properties: string, text: string) =>
    `<w:r>${properties}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  const plain = (text: string) => `<w:p>${run('<w:rPr><w:sz w:val="20"/></w:rPr>', text)}</w:p>`;
  const passage = [
    plain('Primul ajutor este ajutorul imediat.'),
    plain(
      '(Preluare din O.U.G. 195/2002 – Art. 36 alin. (1), (2)) (1) Conducătorii poartă centura.'
    ),
    plain('(2) Motocicliștii poartă casca de protecție.'),
    plain('Salvatorul nu devine a doua victimă.'),
  ];
  const docx = (paragraphs: string[]) => {
    const zip = new PizZip();
    zip.file(
      'word/document.xml',
      `<w:document><w:body>${paragraphs.join('')}</w:body></w:document>`
    );
    return zip.generate({ type: 'uint8array' });
  };
  const fireManifest = `{
  "templates": [
    {
      "number": "1.6",
      "originals": ["Decizia 6"],
      "typeKey": "fire_copy",
      "title": "Copia",
      "file": "copy.docx",
      "change": { "kind": "correction", "note": "Prima versiune." }
    }
  ]
}
`;

  function folder(last = '^Salvatorul') {
    const root = temporaryFolder();
    mkdirSync(join(root, 'fire'));
    mkdirSync(join(root, 'other'));
    cpSync(join(templatesFolder, 'legal-acts.json'), join(root, 'legal-acts.json'));
    writeFileSync(
      join(root, 'manifest.json'),
      `${JSON.stringify(
        {
          templates: [
            {
              typeKey: 'source',
              title: 'Sursa',
              file: 'source.docx',
              change: { kind: 'correction', note: 'Prima versiune.' },
            },
          ],
        },
        null,
        2
      )}\n`
    );
    writeFileSync(join(root, 'fire/manifest.json'), fireManifest);
    writeFileSync(join(root, 'other/manifest.json'), '{ "templates": [] }\n');
    writeFileSync(
      join(root, 'copied-passages.json'),
      JSON.stringify({
        passages: [
          {
            template: 'fire/copy.docx',
            from: 'source.docx',
            first: '^Primul ajutor',
            last,
          },
        ],
      })
    );
    writeFileSync(
      join(root, 'source.docx'),
      docx([plain('Capitolul VII'), ...passage, plain('Capitolul VIII')])
    );
    writeFileSync(
      join(root, 'fire/copy.docx'),
      docx([plain('Art. 1. Decizia'), plain('Art. 2. Primul ajutor:'), ...passage])
    );
    return root;
  }

  const wording = [
    '(1) Conducătorii poartă centura.',
    '(2) Motocicliștii poartă pe cap cască de protecție.',
  ];
  const citationIn = (root: string) =>
    quotesIn(new Uint8Array(readFileSync(join(root, 'source.docx'))), 'source.docx')[0]!;

  it('changes the copy of the passage too, and the index of both', () => {
    const root = folder();
    const result = replaceLegalQuote(pathToFileURL(`${root}/`), {
      citation: citationIn(root),
      lines: wording,
    });
    expect(result.written).toEqual(['source.docx', 'fire/copy.docx', 'citations.json']);
    expect(result.copies).toEqual(['fire/copy.docx']);
    for (const file of ['source.docx', 'fire/copy.docx']) {
      expect(
        quotesIn(new Uint8Array(readFileSync(join(root, file))), file).map((c) => c.text)
      ).toEqual([wording.join('\n')]);
    }
    const index = JSON.parse(readFileSync(join(root, 'citations.json'), 'utf8')) as {
      citations: Citation[];
    };
    expect(index).toEqual(buildCitationIndex(templateSources(pathToFileURL(`${root}/`))));
    expect(index.citations.filter((c) => c.form === 'quote').map((c) => c.file)).toEqual([
      'source.docx',
      'fire/copy.docx',
    ]);
    expect(result.markdown).toContain(
      'The same change in the copy of the passage: fire/copy.docx.'
    );
  });

  it('records the change in the manifest of every template it changed, the rest as it was', () => {
    const root = folder();
    const change = {
      note: 'Casca se poartă pe cap, după Legea 207/2026.',
      resolves: { act: 'oug-195-2002', consolidatedOn: '2026-11-06' },
    };
    const result = replaceLegalQuote(pathToFileURL(`${root}/`), {
      citation: citationIn(root),
      lines: wording,
      change,
    });
    expect(result.written).toEqual([
      'source.docx',
      'fire/copy.docx',
      'citations.json',
      'manifest.json',
      'fire/manifest.json',
    ]);
    const recorded = { kind: 'legal', ...change };
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    expect(manifest.templates[0].change).toEqual(recorded);
    expect(readFileSync(join(root, 'fire/manifest.json'), 'utf8')).toBe(
      fireManifest.replace(
        '"change": { "kind": "correction", "note": "Prima versiune." }',
        `"change": ${JSON.stringify(recorded, null, 2).replace(/\n/g, '\n      ')}`
      )
    );
  });

  it('refuses a change it could not register, and writes nothing', () => {
    const root = folder();
    const before = readFileSync(join(root, 'source.docx'));
    expect(() =>
      replaceLegalQuote(pathToFileURL(`${root}/`), {
        citation: citationIn(root),
        lines: wording,
        change: { note: 'Notă.', resolves: { act: 'lege-1-1900', consolidatedOn: '2026-13-01' } },
      })
    ).toThrow(/not in legal-acts\.json.*is not a date/);
    expect(readFileSync(join(root, 'source.docx'))).toEqual(before);
  });

  it('refuses a quote that runs past the copied passage, and writes nothing', () => {
    const root = folder('^\\(Preluare');
    const before = readFileSync(join(root, 'source.docx'));
    expect(() =>
      replaceLegalQuote(pathToFileURL(`${root}/`), { citation: citationIn(root), lines: wording })
    ).toThrow('the quote runs past the passage');
    expect(readFileSync(join(root, 'source.docx'))).toEqual(before);
  });
});

// The first change the pipeline will make (ADR 017): Legea 207/2026 rewrote O.U.G. 195/2002
// art. 36 alin. (2), which the general training material quotes. Run on a copy of the folder;
// the real change is the pipeline's to propose.
describe('O.U.G. 195/2002 art. 36 alin. (2), as Legea 207/2026 worded it', () => {
  const file = '2.2_general_training_material.docx';
  const committed = JSON.parse(readFileSync(join(templatesFolder, 'citations.json'), 'utf8')) as {
    citations: Citation[];
  };
  const citation = committed.citations.find(
    (each) => each.act === 'oug-195-2002' && each.locator === 'Art. 36 alin. (1) – (3)'
  )!;
  const before =
    '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
  const after =
    '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.';
  const lines = citation.text!.split('\n').map((line) => (line === before ? after : line));
  const root = temporaryFolder();
  const templates = join(root, 'templates');
  cpSync(templatesFolder, templates, { recursive: true });
  const original = new Uint8Array(readFileSync(join(templatesFolder, file)));
  const result = replaceLegalQuote(pathToFileURL(`${templates}/`), {
    citation,
    lines,
    change: {
      note: 'Casca de protecție a motocicliștilor se poartă pe cap, omologată pentru categoria vehiculului și cu elementele de siguranță cuplate (O.U.G. 195/2002 art. 36 alin. (2), modificat prin Legea 207/2026).',
      resolves: { act: 'oug-195-2002', consolidatedOn: '2026-11-06' },
    },
  });
  const changed = new Uint8Array(readFileSync(join(templates, file)));

  it('changes alineat (2) alone, and the parser reads the new wording', () => {
    expect(result.written).toEqual([file, 'citations.json', 'manifest.json']);
    expect(result.summary.changes).toEqual([
      { kind: 'changed', paragraph: citation.paragraph + 4, before, after },
    ]);
    expect(result.summary.notes).toEqual([]);
    const reread = quotesIn(changed, file).find(
      (each) => each.paragraph === citation.paragraph && each.act === citation.act
    )!;
    expect(reread.text).toBe(lines.join('\n'));
    expect(reread.lastParagraph).toBe(citation.lastParagraph);
  });

  it('leaves the XML as it was outside the paragraph, and the other parts of the file', () => {
    const { 'word/document.xml': xml, ...rest } = parts(changed);
    const { 'word/document.xml': originalXml, ...originalRest } = parts(original);
    expect(rest).toEqual(originalRest);
    const paragraph = paragraphsOf(originalXml!)[citation.paragraph + 4]!;
    const tail = originalXml!.length - paragraph.offset - paragraph.xml.length;
    expect(xml!.slice(0, paragraph.offset)).toBe(originalXml!.slice(0, paragraph.offset));
    expect(xml!.slice(xml!.length - tail)).toBe(originalXml!.slice(originalXml!.length - tail));
    expect(paragraphsOf(xml!)[citation.paragraph + 4]!.xml).toBe(
      paragraph.xml.replace(
        'să poarte casca de protecție omologată.',
        'să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.'
      )
    );
  });

  it('changes that one citation in the index, and records the change in the manifest', () => {
    const index = JSON.parse(readFileSync(join(templates, 'citations.json'), 'utf8')) as {
      citations: Citation[];
    };
    expect(index.citations).toEqual(
      committed.citations.map((each) =>
        each === citation ? { ...each, text: lines.join('\n') } : each
      )
    );
    const manifest = JSON.parse(readFileSync(join(templates, 'manifest.json'), 'utf8')) as {
      templates: { file: string; change: unknown }[];
    };
    expect(manifest.templates.find((entry) => entry.file === file)!.change).toEqual({
      kind: 'legal',
      note: expect.stringContaining('Legea 207/2026'),
      resolves: { act: 'oug-195-2002', consolidatedOn: '2026-11-06' },
    });
  });

  it('still renders, with the new wording', () => {
    const rendered = renderDocument(changed, {
      branding: true,
      issueDate: '12.11.2026',
      client: {
        legalName: 'S.C. CLIENT DEMO S.R.L.',
        representativeName: 'Maria POPESCU',
        representativeRole: 'Administrator',
      },
      provider: {
        legalName: 'S.C. SERVICIU EXTERN S.R.L.',
        representativeName: 'Dan MARIN',
        representativeRole: 'Administrator',
      },
      hasUnitRisks: false,
      noUnitRisks: true,
      unitRisks: [],
    });
    expect(documentText(rendered)).toContain(after);
  });

  it('passes the template, citation and copied-passage tests on the changed folder', () => {
    const vitest = join(
      dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
      'vitest.mjs'
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST'))
    );
    const child = spawnSync(
      process.execPath,
      [
        vitest,
        'run',
        'src/templates.test.ts',
        'src/citations.test.ts',
        'src/copied-passages.test.ts',
      ],
      {
        cwd: packageRoot,
        env: { ...env, DOCUMENT_TEMPLATES_DIR: templates },
        encoding: 'utf8',
      }
    );
    expect(child.status, `${child.stdout}\n${child.stderr}`.slice(-4000)).toBe(0);
  }, 300_000);
});
