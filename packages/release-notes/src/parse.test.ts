import { describe, expect, it } from 'vitest';

import { parsePullRequestBlock, parseReleaseBody } from './parse';
import type { Update } from './types';

const text = (...lines: string[]) => lines.join('\n');

const adrBody = text(
  '# Teste de verificare, direct din portal',
  'Dai un test angajaților unui client, ei răspund de pe telefon, iar rezultatul intră singur în fișa individuală.',
  '',
  '## Ce e nou',
  '### Teste compuse din banca de întrebări',
  'Alegi tematica, câte întrebări intră și pragul de promovare.',
  'Unde o găsești: Client, fila Instruiri, butonul Test nou',
  'Pictogramă: clipboard-check',
  '',
  '## Îmbunătățiri',
  '- Lista de angajați arată cine e la zi și are un filtru „La zi”.',
  '',
  '## Remedieri',
  '- Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.',
  '',
  '---',
  '',
  "## What's Changed",
  '* feat(app): knowledge tests in the portal (#543)',
  '* fix(api): PDF dates in Bucharest time (#548)'
);

const adrUpdate: Update = {
  headline: 'Teste de verificare, direct din portal',
  lead: 'Dai un test angajaților unui client, ei răspund de pe telefon, iar rezultatul intră singur în fișa individuală.',
  features: [
    {
      title: 'Teste compuse din banca de întrebări',
      text: 'Alegi tematica, câte întrebări intră și pragul de promovare.',
      where: 'Client, fila Instruiri, butonul Test nou',
      icon: 'clipboard-check',
    },
  ],
  improvements: ['Lista de angajați arată cine e la zi și are un filtru „La zi”.'],
  fixes: ['Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.'],
};

function errorsOf(result: { kind: string; errors?: unknown }) {
  expect(result.kind).toBe('invalid');
  return (result as { errors: { line: number; message: string }[] }).errors;
}

describe('parseReleaseBody', () => {
  it('reads the example of ADR 026', () => {
    const result = parseReleaseBody(adrBody);
    expect(result).toEqual({
      kind: 'update',
      update: adrUpdate,
      source: adrBody.slice(0, adrBody.indexOf('\n---')).trim(),
    });
  });

  it('reads Windows line endings and trailing whitespace the same way', () => {
    const crlf = adrBody
      .split('\n')
      .map((line) => `${line}  \t`)
      .join('\r\n');
    const result = parseReleaseBody(crlf);
    expect(result.kind).toBe('update');
    if (result.kind !== 'update') return;
    expect(result.update).toEqual(adrUpdate);
    expect(result.source).not.toContain('\r');
  });

  it('joins a lead and a feature text written over several lines and paragraphs', () => {
    const result = parseReleaseBody(
      text(
        '# Titlu',
        'Prima frază.',
        'A doua frază.',
        '',
        'Al doilea paragraf.',
        '## Ce e nou',
        '### Funcție',
        'Primul rând',
        'continuă aici.',
        '',
        'Și un paragraf.'
      )
    );
    expect(result).toMatchObject({
      kind: 'update',
      update: {
        lead: 'Prima frază. A doua frază. Al doilea paragraf.',
        features: [{ title: 'Funcție', text: 'Primul rând continuă aici. Și un paragraf.' }],
      },
    });
  });

  it('leaves the lead, the place and the icon out when they are absent', () => {
    const result = parseReleaseBody(text('# Titlu', '## Ce e nou', '### Funcție', 'Un paragraf.'));
    expect(result).toEqual({
      kind: 'update',
      update: {
        headline: 'Titlu',
        lead: null,
        features: [{ title: 'Funcție', text: 'Un paragraf.', where: null, icon: null }],
        improvements: [],
        fixes: [],
      },
      source: text('# Titlu', '## Ce e nou', '### Funcție', 'Un paragraf.'),
    });
  });

  it('takes the sections in any order and leaves an empty one out', () => {
    const result = parseReleaseBody(
      text(
        '# Titlu',
        '## Remedieri',
        '- O remediere.',
        '## Ce e nou',
        '',
        '## Îmbunătățiri',
        '* Cu steluță.'
      )
    );
    expect(result).toMatchObject({
      kind: 'update',
      update: { features: [], improvements: ['Cu steluță.'], fixes: ['O remediere.'] },
    });
  });

  it('keeps inline formatting as written', () => {
    const result = parseReleaseBody(
      text('# Titlu', '## Remedieri', '- Butonul **Salvează** și `PDF`.')
    );
    expect(result).toMatchObject({ update: { fixes: ['Butonul **Salvează** și `PDF`.'] } });
  });

  it('reads headings and labels typed with the cedilla ş and ţ', () => {
    const result = parseReleaseBody(
      text(
        '# Titlu',
        '## Îmbunătăţiri',
        '- Un rând.',
        '## Ce e nou',
        '### Funcție',
        'Text.',
        'Unde o găseşti: Setări'
      )
    );
    expect(result).toMatchObject({
      kind: 'update',
      update: { improvements: ['Un rând.'], features: [{ where: 'Setări' }] },
    });
  });

  it('ends the update at any thematic break', () => {
    for (const rule of ['---', '***', '___', '- - -', '-----']) {
      const result = parseReleaseBody(
        text('# Titlu', '## Remedieri', '- Un rând.', rule, '## Altceva')
      );
      expect(result.kind).toBe('update');
    }
  });

  it('ignores whatever follows the rule, even broken dialect', () => {
    const result = parseReleaseBody(
      text('# Titlu', '## Remedieri', '- Un rând.', '---', '# Another', '## Unknown', 'text')
    );
    expect(result).toMatchObject({ kind: 'update', update: { fixes: ['Un rând.'] } });
  });

  describe('silent releases', () => {
    it.each([
      ['an empty body', ''],
      ['blank lines', '\n\n  \n'],
      [
        'the rule and the developer list',
        text('---', '', "## What's Changed", '* chore: bump deps (#560)'),
      ],
      ['GitHub notes with no rule', text("## What's Changed", '* chore: bump deps (#560)')],
      ['prose with no headline or section', 'Only dependency updates.'],
    ])('treats %s as silent', (_, body) => {
      expect(parseReleaseBody(body)).toEqual({ kind: 'silent' });
    });
  });

  describe('errors', () => {
    it('needs a headline when there are sections', () => {
      const errors = errorsOf(parseReleaseBody(text('', '## Remedieri', '- Un rând.')));
      expect(errors).toEqual([
        { line: 2, message: 'A release needs a headline: a # line before the sections.' },
      ]);
    });

    it('needs at least one item under a headline', () => {
      const errors = errorsOf(
        parseReleaseBody(text('# Titlu', 'Un rezumat.', '## Ce e nou', '---'))
      );
      expect(errors).toEqual([
        {
          line: 1,
          message:
            'The release has a headline but no items under ## Ce e nou, ## Îmbunătățiri and ## Remedieri.',
        },
      ]);
    });

    it('names an unknown icon by its line', () => {
      const body = adrBody.replace('clipboard-check', 'clipboard-checkk');
      expect(errorsOf(parseReleaseBody(body))).toEqual([
        { line: 8, message: '"clipboard-checkk" is not a lucide icon name.' },
      ]);
    });

    it('names a feature with no text by its title line', () => {
      const errors = errorsOf(
        parseReleaseBody(
          text(
            '# Titlu',
            '## Ce e nou',
            '### Fără text',
            'Pictogramă: smartphone',
            '### Cu text',
            'Text.'
          )
        )
      );
      expect(errors).toEqual([{ line: 3, message: 'The feature "Fără text" has no text.' }]);
    });

    it('rejects anything but list items under Îmbunătățiri and Remedieri', () => {
      const errors = errorsOf(
        parseReleaseBody(
          text(
            '# Titlu',
            '## Îmbunătățiri',
            '- Bun.',
            'Un paragraf.',
            '## Remedieri',
            '### Titlu',
            '-'
          )
        )
      );
      expect(errors).toEqual([
        {
          line: 4,
          message: '## Îmbunătățiri holds only list items, each a line starting with "- ".',
        },
        { line: 6, message: '## Remedieri holds only list items, each a line starting with "- ".' },
        { line: 7, message: 'The list item is empty.' },
      ]);
    });

    it('rejects an unknown section heading', () => {
      const errors = errorsOf(
        parseReleaseBody(text('# Titlu', '## Remedieri', '- Un rând.', '## Noutăți', '- Ignorat.'))
      );
      expect(errors).toEqual([
        {
          line: 4,
          message:
            'Unknown section "## Noutăți"; the sections are ## Ce e nou, ## Îmbunătățiri and ## Remedieri.',
        },
      ]);
    });

    it('rejects a section that appears twice', () => {
      const errors = errorsOf(
        parseReleaseBody(text('# Titlu', '## Remedieri', '- Unu.', '## Remedieri', '- Doi.'))
      );
      expect(errors).toEqual([
        { line: 4, message: '## Remedieri appears twice; the first is on line 2.' },
      ]);
    });

    it('rejects a second headline and a headline after the sections', () => {
      expect(
        errorsOf(parseReleaseBody(text('# Unu', '# Doi', '## Remedieri', '- Un rând.')))
      ).toEqual([{ line: 2, message: 'A second # headline; a release has one.' }]);
      expect(errorsOf(parseReleaseBody(text('## Remedieri', '- Un rând.', '# Titlu')))).toEqual([
        { line: 3, message: 'The # headline must come before the sections.' },
      ]);
    });

    it('rejects text before the headline and items in the lead', () => {
      const errors = errorsOf(
        parseReleaseBody(
          text('Ceva.', '# Titlu', '- Nu aici.', '### Nici aici', '## Remedieri', '- Bun.')
        )
      );
      expect(errors).toEqual([
        { line: 1, message: 'Text before the # headline.' },
        {
          line: 3,
          message: 'The lead is a paragraph; list items go under ## Îmbunătățiri or ## Remedieri.',
        },
        { line: 4, message: 'A feature goes under ## Ce e nou.' },
      ]);
    });

    it('rejects text in Ce e nou before the first feature, and list items inside a feature', () => {
      const errors = errorsOf(
        parseReleaseBody(
          text('# Titlu', '## Ce e nou', 'Orfan.', '### Funcție', 'Text.', '- Rând.')
        )
      );
      expect(errors).toEqual([
        { line: 3, message: 'Text under ## Ce e nou must follow a ### feature title.' },
        {
          line: 6,
          message:
            'A list item inside a feature; improvements and fixes go under ## Îmbunătățiri or ## Remedieri.',
        },
      ]);
    });

    it('rejects an empty or repeated label', () => {
      const errors = errorsOf(
        parseReleaseBody(
          text(
            '# Titlu',
            '## Ce e nou',
            '### Funcție',
            'Text.',
            'Unde o găsești:',
            'Pictogramă: smartphone',
            'Pictogramă: smartphone'
          )
        )
      );
      expect(errors).toEqual([
        { line: 5, message: '"Unde o găsești:" names no place.' },
        { line: 7, message: 'A second "Pictogramă:" line in the feature.' },
      ]);
    });

    it('reads labels case-sensitively, so a lowercase one is text', () => {
      const result = parseReleaseBody(
        text('# Titlu', '## Ce e nou', '### Funcție', 'Text.', 'pictogramă: smartphone')
      );
      expect(result).toMatchObject({
        update: { features: [{ text: 'Text. pictogramă: smartphone', icon: null }] },
      });
    });

    it('rejects a code block before the rule', () => {
      const errors = errorsOf(
        parseReleaseBody(text('# Titlu', '## Remedieri', '- Bun.', '```', '- Nu.', '```'))
      );
      expect(errors).toEqual([{ line: 4, message: 'A code block is not part of an update.' }]);
    });

    it('reports every error at once, in line order', () => {
      const errors = errorsOf(
        parseReleaseBody(
          text('# Titlu', '## Ce e nou', '### Fără', 'Pictogramă: nope', '## Remedieri', 'Text.')
        )
      );
      expect(errors.map((error) => error.line)).toEqual([3, 4, 6]);
    });
  });
});

const pullRequestBody = text(
  '## What',
  '',
  'Adds knowledge tests to the portal.',
  '',
  '```md',
  '## Actualizări',
  '- inside a code block, not a block',
  '```',
  '',
  '## Actualizări  ',
  '',
  '## Ce e nou',
  '### Teste compuse din banca de întrebări',
  'Alegi tematica, câte întrebări intră și pragul de promovare.',
  'Unde o găsești: Client, fila Instruiri, butonul Test nou',
  'Pictogramă: clipboard-check',
  '',
  '## Remedieri',
  '- Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.',
  '',
  '## Evidence',
  '',
  '![Dialog](https://raw.githubusercontent.com/PCRinus/ssm-usor/pr-screenshots/feat/x/dialog.png)',
  '',
  '## Test plan',
  '- pnpm test'
);

describe('parsePullRequestBlock', () => {
  it('extracts only the block from a pull request description', () => {
    expect(parsePullRequestBlock(pullRequestBody)).toEqual({
      kind: 'block',
      sections: {
        features: adrUpdate.features,
        improvements: [],
        fixes: adrUpdate.fixes,
      },
    });
  });

  it('reads the block with Windows line endings', () => {
    expect(parsePullRequestBlock(pullRequestBody.replaceAll('\n', '\r\n'))).toMatchObject({
      kind: 'block',
    });
  });

  it('ends the block at a thematic break', () => {
    const result = parsePullRequestBlock(
      text('## Actualizări', '## Remedieri', '- Un rând.', '---', 'Developer notes.')
    );
    expect(result).toEqual({
      kind: 'block',
      sections: { features: [], improvements: [], fixes: ['Un rând.'] },
    });
  });

  it('is none without the heading, or with it only in a code block or in another case', () => {
    expect(parsePullRequestBlock(text('## What', 'Bumps deps.'))).toEqual({ kind: 'none' });
    expect(parsePullRequestBlock('')).toEqual({ kind: 'none' });
    expect(parsePullRequestBlock(text('```', '## Actualizări', '```'))).toEqual({ kind: 'none' });
    expect(parsePullRequestBlock(text('## actualizări', '## Remedieri', '- Un rând.'))).toEqual({
      kind: 'none',
    });
  });

  it('rejects a block with no items, naming the heading line', () => {
    expect(
      errorsOf(parsePullRequestBlock(text('## What', '## Actualizări', '', '## Evidence')))
    ).toEqual([{ line: 2, message: 'The ## Actualizări block has no items.' }]);
  });

  it('rejects a headline or a lead in the block', () => {
    const message =
      "The headline and the lead belong to the release; a pull request's block holds only ## Ce e nou, ## Îmbunătățiri and ## Remedieri.";
    expect(
      errorsOf(
        parsePullRequestBlock(
          text('## Actualizări', '# Titlu', 'Rezumat.', '## Remedieri', '- Rând.')
        )
      )
    ).toEqual([{ line: 2, message }]);
    expect(
      errorsOf(parsePullRequestBlock(text('## Actualizări', 'Rezumat.', '## Remedieri', '- Rând.')))
    ).toEqual([{ line: 2, message }]);
  });

  it('numbers errors by the line of the whole description', () => {
    const body = pullRequestBody.replace('clipboard-check', 'clipboard-checkk');
    expect(errorsOf(parsePullRequestBlock(body))).toEqual([
      { line: 16, message: '"clipboard-checkk" is not a lucide icon name.' },
    ]);
  });

  it('rejects a second block', () => {
    const errors = errorsOf(
      parsePullRequestBlock(
        text(
          '## Actualizări',
          '## Remedieri',
          '- Unu.',
          '## Evidence',
          '## Actualizări',
          '## Remedieri',
          '- Doi.'
        )
      )
    );
    expect(errors).toEqual([
      { line: 5, message: 'A second ## Actualizări; the first is on line 1.' },
    ]);
  });

  it('applies the section rules inside the block', () => {
    const errors = errorsOf(
      parsePullRequestBlock(
        text('## Actualizări', '## Îmbunătățiri', 'Paragraf.', '## Remedieri', '- Rând.')
      )
    );
    expect(errors).toEqual([
      {
        line: 3,
        message: '## Îmbunătățiri holds only list items, each a line starting with "- ".',
      },
    ]);
  });
});
