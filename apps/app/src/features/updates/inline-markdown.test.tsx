import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineMarkdown } from './inline-markdown';
import { parseInlineMarkdown } from './parse-inline-markdown';

const strong = (...children: ReturnType<typeof parseInlineMarkdown>) => ({
  mark: 'strong' as const,
  children,
});
const em = (...children: ReturnType<typeof parseInlineMarkdown>) => ({
  mark: 'em' as const,
  children,
});

describe('parseInlineMarkdown', () => {
  it('reads bold, the mark the updates use', () => {
    expect(
      parseInlineMarkdown(
        'butonul **Raportează o problemă cu importul** rămâne în capul paginii importului'
      )
    ).toEqual([
      'butonul ',
      strong('Raportează o problemă cu importul'),
      ' rămâne în capul paginii importului',
    ]);
    expect(parseInlineMarkdown('**Arhivate**, lângă __Active__.')).toEqual([
      strong('Arhivate'),
      ', lângă ',
      strong('Active'),
      '.',
    ]);
  });

  it('reads italics, code, and marks inside marks', () => {
    expect(parseInlineMarkdown('*Ce e nou* și _Remedieri_')).toEqual([
      em('Ce e nou'),
      ' și ',
      em('Remedieri'),
    ]);
    expect(parseInlineMarkdown('scrie `Pictogramă:` aici')).toEqual([
      'scrie ',
      { mark: 'code', text: 'Pictogramă:' },
      ' aici',
    ]);
    expect(parseInlineMarkdown('**fila *Arhivate* din listă**')).toEqual([
      strong('fila ', em('Arhivate'), ' din listă'),
    ]);
    expect(parseInlineMarkdown('*meniul **Arhivează…** de pe rând*')).toEqual([
      em('meniul ', strong('Arhivează…'), ' de pe rând'),
    ]);
  });

  it('keeps what is not a mark as typed', () => {
    expect(parseInlineMarkdown('2 * 3 * 4 și cod_caen_principal')).toEqual([
      '2 * 3 * 4 și cod_caen_principal',
    ]);
    expect(parseInlineMarkdown('**neînchis și `neînchis')).toEqual(['**neînchis și `neînchis']);
    expect(parseInlineMarkdown('** spațiu **')).toEqual(['** spațiu **']);
    expect(parseInlineMarkdown('****')).toEqual(['****']);
    expect(parseInlineMarkdown('')).toEqual([]);
  });

  it('honours escapes and leaves code untouched', () => {
    expect(parseInlineMarkdown('\\*\\*nu e bold\\*\\*')).toEqual(['**nu e bold**']);
    expect(parseInlineMarkdown('`**literal**` și **bold**')).toEqual([
      { mark: 'code', text: '**literal**' },
      ' și ',
      strong('bold'),
    ]);
    expect(parseInlineMarkdown('**a `**` b**')).toEqual([
      strong('a ', { mark: 'code', text: '**' }, ' b'),
    ]);
  });
});

describe('InlineMarkdown', () => {
  it('renders the marks as elements and never as HTML', () => {
    const { container } = render(
      <p>
        <InlineMarkdown text="butonul **Raportează** și <img src=x onerror=alert(1)> `cod`" />
      </p>
    );
    expect(container.querySelector('strong')?.textContent).toBe('Raportează');
    expect(container.querySelector('code')?.textContent).toBe('cod');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('butonul Raportează și <img src=x onerror=alert(1)> cod');
  });
});
