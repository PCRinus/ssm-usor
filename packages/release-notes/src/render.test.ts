import { describe, expect, it } from 'vitest';

import { countItems } from './dialect';
import { parsePullRequestBlock, parseReleaseBody } from './parse';
import { assembleReleaseBody, renderUpdate } from './render';
import type { Update, UpdateSections } from './types';

const testsBlock: UpdateSections = {
  features: [
    {
      title: 'Teste compuse din banca de întrebări',
      text: 'Alegi tematica, câte întrebări intră și pragul de promovare.',
      where: 'Client, fila Instruiri, butonul Test nou',
      icon: 'clipboard-check',
    },
  ],
  improvements: [],
  fixes: ['Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.'],
};

const portalBlock: UpdateSections = {
  features: [
    {
      title: 'Răspunsuri de pe telefon',
      text: 'Angajații deschid testul din SMS.',
      where: null,
      icon: 'smartphone',
    },
    {
      title: 'Rezultat în fișă',
      text: 'Nota intră singură în fișa individuală.',
      where: null,
      icon: null,
    },
  ],
  improvements: ['Lista de angajați arată cine e la zi și are un filtru „La zi”.'],
  fixes: [],
};

const emptyBlock: UpdateSections = { features: [], improvements: [], fixes: [] };

const trailer = "## What's Changed\n* feat(app): knowledge tests (#543)\n* chore: bump deps (#560)";

describe('renderUpdate', () => {
  it('writes the dialect of ADR 026', () => {
    const update: Update = {
      headline: 'Teste de verificare, direct din portal',
      lead: 'Dai un test angajaților unui client.',
      ...testsBlock,
      improvements: ['Lista de angajați arată cine e la zi.'],
    };
    expect(renderUpdate(update)).toBe(
      [
        '# Teste de verificare, direct din portal',
        'Dai un test angajaților unui client.',
        '',
        '## Ce e nou',
        '### Teste compuse din banca de întrebări',
        'Alegi tematica, câte întrebări intră și pragul de promovare.',
        'Unde o găsești: Client, fila Instruiri, butonul Test nou',
        'Pictogramă: clipboard-check',
        '',
        '## Îmbunătățiri',
        '- Lista de angajați arată cine e la zi.',
        '',
        '## Remedieri',
        '- Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.',
      ].join('\n')
    );
  });

  it('flattens line breaks inside a field so the structure survives', () => {
    const rendered = renderUpdate({
      headline: 'Titlu\npe două rânduri',
      lead: null,
      features: [],
      improvements: ['Un rând\n## care nu e titlu'],
      fixes: [],
    });
    expect(rendered).toBe(
      '# Titlu pe două rânduri\n\n## Îmbunătățiri\n- Un rând ## care nu e titlu'
    );
  });
});

describe('assembleReleaseBody', () => {
  it('concatenates the blocks in order and round-trips through the parser', () => {
    const body = assembleReleaseBody({
      headline: 'Teste de verificare, direct din portal',
      lead: 'Dai un test angajaților unui client.',
      blocks: [testsBlock, emptyBlock, portalBlock],
      trailer,
    });
    const parsed = parseReleaseBody(body);
    expect(parsed).toEqual({
      kind: 'update',
      update: {
        headline: 'Teste de verificare, direct din portal',
        lead: 'Dai un test angajaților unui client.',
        features: [...testsBlock.features, ...portalBlock.features],
        improvements: portalBlock.improvements,
        fixes: testsBlock.fixes,
      },
      source: body.slice(0, body.indexOf('\n\n---\n\n')),
    });
    expect(body.endsWith(`\n\n---\n\n${trailer}`)).toBe(true);
  });

  it('round-trips the blocks parsed out of pull request descriptions', () => {
    const descriptions = [testsBlock, portalBlock].map(
      (block) =>
        `## What\n\nSomething.\n\n## Actualizări\n\n${renderUpdate({ headline: 'x', lead: null, ...block }).replace(/^# x\n\n/, '')}\n\n## Evidence\n`
    );
    const blocks = descriptions.map((description) => {
      const result = parsePullRequestBlock(description);
      if (result.kind !== 'block') throw new Error(JSON.stringify(result));
      return result.sections;
    });
    expect(blocks).toEqual([testsBlock, portalBlock]);

    const parsed = parseReleaseBody(assembleReleaseBody({ blocks }));
    expect(parsed.kind === 'update' && parsed.update).toEqual({
      headline: 'Teste compuse din banca de întrebări',
      lead: null,
      features: [...testsBlock.features, ...portalBlock.features],
      improvements: portalBlock.improvements,
      fixes: testsBlock.fixes,
    });
  });

  it('falls back to the first feature, then the first improvement, then the first fix', () => {
    const headlineOf = (blocks: UpdateSections[], headline?: string | null) => {
      const parsed = parseReleaseBody(assembleReleaseBody({ headline, blocks }));
      return parsed.kind === 'update' ? parsed.update.headline : parsed.kind;
    };
    expect(headlineOf([testsBlock])).toBe('Teste compuse din banca de întrebări');
    expect(headlineOf([{ ...portalBlock, features: [] }, testsBlock])).toBe(
      'Teste compuse din banca de întrebări'
    );
    expect(headlineOf([{ ...portalBlock, features: [] }])).toBe(
      'Lista de angajați arată cine e la zi și are un filtru „La zi”.'
    );
    expect(headlineOf([{ ...testsBlock, features: [] }], '  ')).toBe(
      'Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.'
    );
    expect(headlineOf([testsBlock], null)).toBe('Teste compuse din banca de întrebări');
  });

  it('leaves the lead out when it is absent or blank', () => {
    const body = assembleReleaseBody({ headline: 'Titlu', lead: ' ', blocks: [testsBlock] });
    expect(body.startsWith('# Titlu\n\n## Ce e nou\n')).toBe(true);
    expect(parseReleaseBody(body)).toMatchObject({ kind: 'update', update: { lead: null } });
  });

  it('has no rule without a trailer', () => {
    const body = assembleReleaseBody({ headline: 'Titlu', blocks: [testsBlock] });
    expect(body).not.toContain('---');
    expect(body).toBe(renderUpdate({ headline: 'Titlu', lead: null, ...testsBlock }));
  });

  it('writes a silent release when every block is empty', () => {
    expect(assembleReleaseBody({ headline: 'Titlu', blocks: [emptyBlock], trailer })).toBe(
      `---\n\n${trailer}`
    );
    expect(assembleReleaseBody({ blocks: [] })).toBe('');
    expect(parseReleaseBody(assembleReleaseBody({ blocks: [emptyBlock], trailer }))).toEqual({
      kind: 'silent',
    });
  });
});

describe('countItems', () => {
  it('counts each section', () => {
    expect(countItems(portalBlock)).toEqual({ features: 2, improvements: 1, fixes: 0 });
    expect(countItems(emptyBlock)).toEqual({ features: 0, improvements: 0, fixes: 0 });
  });
});
