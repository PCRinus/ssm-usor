import { describe, expect, it } from 'vitest';

import { foldText } from './fold-text';
import {
  articleCount,
  categoryDomain,
  categoryFitsDomain,
  guidedTemplates,
  type InstructionBody,
  instructionBodySchema,
  instructionCategories,
  instructionCategoryLabels,
  textHash,
} from './instruction-body';

const body: InstructionBody = {
  blocks: [
    { kind: 'heading', text: 'Înainte de începerea lucrului' },
    {
      kind: 'article',
      paragraphs: [
        'Lucrătorul verifică starea scării înainte de fiecare folosire.',
        'a) treptele sunt întregi și curate;',
        'b) picioarele au tălpile antiderapante la locul lor.',
      ],
    },
    { kind: 'article', paragraphs: ['Scara se așază pe o suprafață plană și stabilă.'] },
    { kind: 'heading', text: 'Acțiuni interzise' },
    { kind: 'article', paragraphs: ['Se interzice urcarea a două persoane pe scară.'] },
  ],
};

describe('foldText', () => {
  it('folds diacritics, case and punctuation to plain words', () => {
    expect(foldText('  Șină de GHIDARE – cârlig, (tip „A”)… ')).toBe(
      'sina de ghidare carlig tip a'
    );
    expect(foldText('ţeavă')).toBe(foldText('țeavă'));
  });
});

describe('instructionBodySchema', () => {
  it('takes headings and articles in any order', () => {
    expect(instructionBodySchema.parse(body)).toEqual(body);
  });

  it('trims the paragraphs and headings', () => {
    const parsed = instructionBodySchema.parse({
      blocks: [{ kind: 'article', paragraphs: ['  Se poartă casca.  '] }],
    });
    expect(parsed.blocks[0]).toEqual({ kind: 'article', paragraphs: ['Se poartă casca.'] });
  });

  it('refuses a body without an article', () => {
    expect(instructionBodySchema.safeParse({ blocks: [] }).success).toBe(false);
    expect(
      instructionBodySchema.safeParse({
        blocks: [{ kind: 'heading', text: 'Domeniul de aplicare' }],
      }).success
    ).toBe(false);
  });

  it('refuses empty paragraphs, empty articles and line breaks inside a block', () => {
    for (const block of [
      { kind: 'article', paragraphs: [] },
      { kind: 'article', paragraphs: ['   '] },
      { kind: 'article', paragraphs: ['Primul rând\nal doilea rând'] },
      { kind: 'heading', text: 'Titlu\npe două rânduri' },
      { kind: 'heading', text: '' },
      { kind: 'list', text: 'Nu există' },
    ]) {
      expect(instructionBodySchema.safeParse({ blocks: [block] }).success).toBe(false);
    }
  });

  it('takes 400 articles and refuses 401', () => {
    const articles = (count: number) => ({
      blocks: Array.from({ length: count }, (_, index) => ({
        kind: 'article' as const,
        paragraphs: [`Regula numărul ${index + 1}.`],
      })),
    });
    expect(instructionBodySchema.safeParse(articles(400)).success).toBe(true);
    expect(instructionBodySchema.safeParse(articles(401)).success).toBe(false);
  });

  it('refuses a body above 200,000 characters', () => {
    const paragraph = 'x'.repeat(10_000);
    const blocks = (count: number) =>
      Array.from({ length: count }, () => ({ kind: 'article' as const, paragraphs: [paragraph] }));
    expect(instructionBodySchema.safeParse({ blocks: blocks(20) }).success).toBe(true);
    expect(
      instructionBodySchema.safeParse({
        blocks: [...blocks(20), { kind: 'heading', text: 'Încă unul' }],
      }).success
    ).toBe(false);
  });
});

describe('articleCount', () => {
  it('counts articles and never headings', () => {
    expect(articleCount(body)).toBe(3);
  });
});

describe('textHash', () => {
  it('is the hex SHA-256 of the folded body', async () => {
    const hash = await textHash(body);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await textHash(body)).toBe(hash);
  });

  it('does not change when only spacing, case, diacritics or punctuation move', async () => {
    const respaced: InstructionBody = {
      blocks: body.blocks.map((block) =>
        block.kind === 'heading'
          ? { ...block, text: block.text.toUpperCase() }
          : {
              ...block,
              paragraphs: block.paragraphs.map((paragraph) =>
                paragraph.replace(/ /g, '  ').replace(/ș/g, 'ş').replace(/;$/, '.')
              ),
            }
      ),
    };
    expect(await textHash(respaced)).toBe(await textHash(body));
  });

  it('changes with a word, and with an article split or turned into a heading', async () => {
    const hash = await textHash(body);
    const reworded = structuredClone(body);
    (reworded.blocks[2] as { paragraphs: string[] }).paragraphs[0] =
      'Scara se așază pe o suprafață plană.';
    expect(await textHash(reworded)).not.toBe(hash);

    const split = structuredClone(body);
    const first = split.blocks[1] as { kind: 'article'; paragraphs: string[] };
    split.blocks.splice(2, 0, { kind: 'article', paragraphs: first.paragraphs.splice(1) });
    expect(await textHash(split)).not.toBe(hash);

    const asHeading: InstructionBody = {
      blocks: [
        { kind: 'heading', text: 'Se interzice urcarea a două persoane pe scară' },
        { kind: 'article', paragraphs: ['Scara se așază pe o suprafață plană și stabilă.'] },
      ],
    };
    const asArticle: InstructionBody = {
      blocks: [
        { kind: 'article', paragraphs: ['Se interzice urcarea a două persoane pe scară'] },
        { kind: 'article', paragraphs: ['Scara se așază pe o suprafață plană și stabilă.'] },
      ],
    };
    expect(await textHash(asHeading)).not.toBe(await textHash(asArticle));
  });
});

describe('instruction categories', () => {
  it('keeps the existing SSM groups and adds three PSI ones', () => {
    for (const group of ['work_activity', 'work_equipment', 'protective_equipment'] as const) {
      expect(instructionCategories).toContain(group);
      expect(categoryDomain(group)).toBe('ssm');
    }
    expect(categoryDomain('premises_activity')).toBe('psi');
    expect(categoryDomain('installation_equipment')).toBe('psi');
    expect(categoryDomain('hazardous_work')).toBe('psi');
  });

  it('keeps each category in its domain', () => {
    expect(categoryFitsDomain('protective_equipment', 'ssm')).toBe(true);
    expect(categoryFitsDomain('protective_equipment', 'psi')).toBe(false);
    expect(categoryFitsDomain('hazardous_work', 'psi')).toBe(true);
    expect(categoryFitsDomain('hazardous_work', 'ssm')).toBe(false);
  });

  it('names every category in Romanian', () => {
    expect(instructionCategoryLabels.premises_activity).toBe('Spații și activități');
    expect(instructionCategoryLabels.installation_equipment).toBe('Instalații și echipamente');
    expect(instructionCategoryLabels.hazardous_work).toBe('Lucrări periculoase');
  });
});

describe('guidedTemplates', () => {
  it('has the sections of the ADR for every category, keys unique within one', () => {
    for (const category of instructionCategories) {
      const keys = guidedTemplates[category].map((section) => section.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(guidedTemplates.work_equipment.map((section) => section.heading)).toEqual([
      'Domeniul de aplicare',
      'Cine îl poate folosi',
      'Verificări înainte de pornire',
      'În timpul utilizării',
      'Oprire, curățare și întreținere',
      'Ce faci la o defecțiune',
      'Echipament de protecție necesar',
      'Acțiuni interzise',
      'Situații de urgență',
    ]);
    expect(guidedTemplates.premises_activity.at(-1)?.heading).toBe(
      'Mijloacele de stingere și evacuarea'
    );
  });
});
