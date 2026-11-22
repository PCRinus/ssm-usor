import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { ssmAnnexData } from '../../tools/annex-samples';
import { person, setSamples } from '../../tools/set-samples';
import { renderAnnex } from '../annex';
import { renderDocument } from '../render';
import { convert, converter } from '../test/converter';
import { read } from './read';

type Line = { page: number; top: number; left: number; size: number; text: string };

async function linesOf(pdf: Uint8Array) {
  const loading = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const document = await loading.promise;
  const lines: Line[] = [];
  try {
    for (let page = 1; page <= document.numPages; page += 1) {
      const view = await document.getPage(page);
      const height = view.getViewport({ scale: 1 }).height;
      for (const item of (await view.getTextContent()).items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const size = Math.hypot(item.transform[2]!, item.transform[3]!);
        // The top of the line's em box, as pymupdf measured the covers.
        lines.push({
          page,
          top: height - item.transform[5]! - size * 0.905,
          left: item.transform[4]!,
          size,
          text: item.str,
        });
      }
    }
  } finally {
    await loading.destroy();
  }
  return { lines, pages: document.numPages };
}

const covers = [
  '1.0_cover_decisions.docx',
  '2.0_cover_general_training_material.docx',
  '3.0_cover_own_instructions.docx',
  '4.0_cover_training_themes.docx',
  '5.0_cover_tests.docx',
  '7.0_cover_event_registers.docx',
  '11.0_cover_employer_briefing.docx',
];
const longName =
  'S.C. ÎNTREPRINDEREA DE CONSTRUCȚII, INSTALAȚII TERMICE, SANITARE ȘI ELECTRICE PENTRU INDUSTRIE ȘI AGRICULTURĂ BANAT-CRIȘANA S.R.L.';
const withClient = (data: Record<string, unknown>, legalName: string) => ({
  ...data,
  client: { ...(data.client as object), legalName },
});

describe.skipIf(!converter)('the converted pages of the occupational safety set', () => {
  it.each(covers)(
    '%s opens its title at 217.8 pt and its hand-over block at 470 pt, on one page even for a long name',
    async (name) => {
      for (const { data } of setSamples) {
        for (const legalName of [undefined, longName]) {
          const merged = legalName ? withClient(data, legalName) : data;
          const { lines, pages } = await linesOf(await convert(renderDocument(read(name), merged)));
          expect(pages).toBe(1);
          const title = lines.find((line) => Math.round(line.size) === 16)!;
          const handover = lines.find((line) => line.text.startsWith('PERSOANE IMPLICATE'))!;
          expect(title.top).toBeCloseTo(217.8, 0);
          if (!legalName) expect(handover.top).toBeCloseTo(470, 0);
        }
      }
    },
    120_000
  );

  // A table's row numbers hang their text too, but stand closer to the margin than the first tier.
  const tierStep = 18;
  async function listTiers(docx: Uint8Array) {
    const { lines } = await linesOf(await convert(docx));
    const rows = new Map<string, Line[]>();
    for (const line of lines) {
      const key = `${line.page}:${Math.round(line.top)}`;
      rows.set(key, [...(rows.get(key) ?? []), line]);
    }
    const tiers = new Set<number>();
    for (const row of rows.values()) {
      const [label, text] = row.sort((a, b) => a.left - b.left);
      if (!label || !text || !/^(\d{1,2}\.|[a-z]\)|–)$/.test(label.text.trim())) continue;
      const hang = text.left - label.left;
      if (hang < tierStep - 1 || hang > 24 || label.left < 70.87 + tierStep - 1) continue;
      tiers.add(Math.round(((label.left - 70.87) / tierStep) * 10) / 10);
    }
    return [...tiers].sort((a, b) => a - b);
  }

  it.each([
    ['1.1_decision_training.docx', [1, 2, 3]],
    ['11.1_employer_briefing.docx', [1, 2, 3]],
    ['12_control_regulation.docx', [1, 2]],
  ])(
    '%s steps each list tier 6.35 mm in from the one before, numbers, letters and dashes alike',
    async (name, tiers) => {
      expect(await listTiers(renderDocument(read(name), setSamples[0]!.data))).toEqual(tiers);
    },
    120_000
  );

  it('steps the tiers of an annex as the common part does', async () => {
    const annex = renderAnnex(
      'ssm',
      {
        blocks: [
          {
            kind: 'article',
            paragraphs: [
              'Instruirea cuprinde:',
              '1. Instruirea introductiv-generală:',
              'a) se face pentru:',
              '– lucrătorii nou angajați;',
              '– lucrătorii detașați.',
            ],
          },
        ],
      },
      ssmAnnexData
    );
    expect(await listTiers(annex)).toEqual([1, 2, 3]);
  }, 60_000);

  it('keeps the four registers on four pages for a client name of 130 characters', async () => {
    const { data } = setSamples.at(-1)!;
    const docx = renderDocument(read('7.1_event_registers.docx'), withClient(data, longName));
    expect((await linesOf(await convert(docx))).pages).toBe(4);
  }, 60_000);
});

describe.skipIf(!converter)('the lists the occupational safety set has signed by hand', () => {
  const listOf: Record<string, string> = {
    '1.1_decision_training.docx': 'workplaceManagers',
    '1.2_decision_risk_evaluation_team.docx': 'evaluationTeam',
    '1.3_decision_first_aid.docx': 'firstAiders',
    '1.4_decision_imminent_danger.docx': 'imminentDanger',
    '1.5_decision_workers_representative.docx': 'workersRepresentatives',
  };
  const reviewedName =
    'Test Pachet Revizie Confecții Metalice și Vopsitorie Industrială Ștefănescu-Țăranu S.R.L.';
  const names = [
    person('Ștefănescu-Țăranu Alexandru-Bogdan', 'Șef de echipă'),
    person('Ionescu-Brâncoveanu Mihai-Răzvan', 'Inginer tehnolog'),
    person('Mihai POPESCU', 'Operator montaj linii automate'),
    person('Elena DUMITRU', 'Conducător antrepriză construcții-montaj'),
    person('Ana POP', 'Contabil'),
  ];
  const team = (count: number) =>
    Array.from({ length: count }, (_, index) => {
      const each = names[index % names.length]!;
      return index < names.length ? each : { ...each, name: `${each.name} ${index + 1}` };
    });
  const withTeam = (sample: 'short' | 'long', count: number) => {
    const { data } = setSamples.find(({ label }) => label === sample)!;
    const people = team(count);
    return {
      ...data,
      client:
        sample === 'long'
          ? {
              ...data.client,
              legalName: reviewedName,
              representativeName: 'Gheorghița-Alexandra Țăranu-Ștefănescu',
            }
          : data.client,
      workplaceManagers: people,
      firstAiders: people,
      evaluationTeam: people,
      imminentDanger: people,
      workersRepresentatives: people,
    };
  };

  /** Per page a signed list stands on, the numbers of its body rows there. */
  async function signedRows(docx: Uint8Array) {
    const { lines } = await linesOf(await convert(docx));
    const headers = lines.filter((line) => /^Semnătura\b/.test(line.text.trim()));
    return headers.map((header) => {
      const number = lines
        .filter((line) => line.page === header.page && line.text.trim() === 'Nr.')
        .sort((a, b) => Math.abs(a.top - header.top) - Math.abs(b.top - header.top))[0]!;
      const next = headers.find((each) => each.page === header.page && each.top > header.top);
      return {
        page: header.page,
        rows: lines
          .filter(
            (line) =>
              line.page === header.page &&
              /^\d+\.$/.test(line.text.trim()) &&
              Math.abs(line.left - number.left) < 12 &&
              line.top > header.top + 15 &&
              line.top < (next?.top ?? Infinity)
          )
          .sort((a, b) => a.top - b.top)
          .map((line) => Number.parseInt(line.text)),
      };
    });
  }

  async function expectNoRowAlone(docx: Uint8Array, rowCount: number) {
    const parts = await signedRows(docx);
    expect(parts.length).toBeGreaterThan(0);
    for (const [index, { page, rows }] of parts.entries()) {
      expect(rows.length).toBeGreaterThan(0);
      const next = parts[index + 1];
      if (next?.page === page + 1 && next.rows[0] === rows.at(-1)! + 1) {
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(next.rows.length).toBeGreaterThanOrEqual(2);
      }
    }
    const lists: number[][] = [];
    for (const { rows } of parts) {
      if (rows[0] === 1) lists.push([...rows]);
      else lists.at(-1)!.push(...rows);
    }
    for (const list of lists)
      expect(list).toEqual(Array.from({ length: rowCount }, (_, index) => index + 1));
    return new Set(parts.map(({ page }) => page)).size;
  }

  it.each(Object.keys(listOf))(
    '%s never leaves one row of the list alone at a page break, for a short and a long client',
    async (name) => {
      for (const { data } of setSamples) {
        const people = (data as Record<string, unknown>)[listOf[name]!] as unknown[];
        await expectNoRowAlone(renderDocument(read(name), data), people.length + 2);
      }
      await expectNoRowAlone(renderDocument(read(name), withTeam('long', 2)), 4);
    },
    120_000
  );

  it.each([
    ['1.1_decision_training.docx', 'short', 8],
    ['1.1_decision_training.docx', 'long', 20],
    ['1.2_decision_risk_evaluation_team.docx', 'short', 12],
    ['1.2_decision_risk_evaluation_team.docx', 'long', 18],
    ['1.2_decision_risk_evaluation_team.docx', 'long', 26],
    ['1.3_decision_first_aid.docx', 'short', 12],
    ['1.4_decision_imminent_danger.docx', 'short', 12],
    ['1.5_decision_workers_representative.docx', 'long', 5],
  ] as const)(
    "%s breaks a %s client's list of %i people with two rows at least on each side",
    async (name, sample, count) => {
      const pages = await expectNoRowAlone(
        renderDocument(read(name), withTeam(sample, count)),
        count + 2
      );
      expect(pages).toBeGreaterThan(1);
    },
    60_000
  );
});
