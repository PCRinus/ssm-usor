import { describe, expect, it } from 'vitest';

import { rewriteParagraph } from './paragraph-edit';
import { paragraphsOf } from './text';

const bold = '<w:rPr><w:b/><w:sz w:val="20"/><w:lang w:val="ro-RO"/></w:rPr>';
const normal = '<w:rPr><w:sz w:val="20"/><w:lang w:val="ro-RO"/></w:rPr>';
const superscript =
  '<w:rPr><w:sz w:val="20"/><w:vertAlign w:val="superscript"/><w:lang w:val="ro-RO"/></w:rPr>';
const run = (properties: string, text: string) =>
  `<w:r>${properties}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const paragraph = (...runs: string[]) =>
  `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs.join('')}</w:p>`;
const textOf = (xml: string) => paragraphsOf(xml)[0]!.text;

describe('a paragraph rewritten', () => {
  const alineat = paragraph(
    run(bold, '(2)'),
    run(normal, ' Conducătorii au obligația să poarte casca de protecție omologată.')
  );

  it('changes only the words that differ, in the run that held them', () => {
    const rewritten = rewriteParagraph(
      alineat,
      '(2) Conducătorii au obligația să poarte pe cap cască de protecție omologată pentru vehicul.'
    );
    expect(rewritten).toBe(
      paragraph(
        run(bold, '(2)'),
        run(
          normal,
          ' Conducătorii au obligația să poarte pe cap cască de protecție omologată pentru vehicul.'
        )
      )
    );
  });

  it('is the same paragraph when the text is', () => {
    expect(rewriteParagraph(alineat, textOf(alineat))).toBe(alineat);
  });

  it('gives words added between two runs the formatting of the longer one', () => {
    const rewritten = rewriteParagraph(
      paragraph(run(bold, '(2)'), run(normal, ' Text.')),
      '(2) Alt text.'
    );
    expect(rewritten).toBe(paragraph(run(bold, '(2)'), run(normal, ' Alt text.')));
    expect(
      rewriteParagraph(paragraph(run(bold, '(2)'), run(normal, 'Text.')), '(2)Nou Text.')
    ).toBe(paragraph(run(bold, '(2)'), run(normal, 'Nou Text.')));
  });

  it('changes a label in its bold run', () => {
    expect(rewriteParagraph(alineat, textOf(alineat).replace('(2)', '(2¹)'))).toBe(
      paragraph(
        run(bold, '(2¹)'),
        run(normal, ' Conducătorii au obligația să poarte casca de protecție omologată.')
      )
    );
  });

  it('drops a run whose words are all removed', () => {
    expect(
      rewriteParagraph(
        paragraph(run(bold, 'Preluare'), run(normal, ' Primul ajutor.')),
        ' Primul ajutor.'
      )
    ).toBe(paragraph(run(normal, ' Primul ajutor.')));
  });

  it('escapes what it writes', () => {
    const rewritten = rewriteParagraph(paragraph(run(normal, 'A și B.')), 'A & B < C.');
    expect(rewritten).toBe(paragraph(run(normal, 'A &amp; B &lt; C.')));
    expect(textOf(rewritten)).toBe('A & B < C.');
  });

  describe('in a passage that sets superscripts as runs', () => {
    const article = paragraph(
      run(normal, 'prevăzute la art. 27'),
      run(superscript, '1'),
      run(normal, ' și la art. 30.')
    );

    it('writes a changed superscript as a digit in its superscript run', () => {
      const rewritten = rewriteParagraph(article, 'prevăzute la art. 27² și la art. 30.', 'runs');
      expect(rewritten).toBe(
        paragraph(
          run(normal, 'prevăzute la art. 27'),
          run(superscript, '2'),
          run(normal, ' și la art. 30.')
        )
      );
    });

    it('sets a new superscript in a run of its own, its mark before the language', () => {
      const rewritten = rewriteParagraph(article, 'prevăzute la art. 27¹ și la art. 30³.', 'runs');
      expect(rewritten).toBe(
        paragraph(
          run(normal, 'prevăzute la art. 27'),
          run(superscript, '1'),
          run(normal, ' și la art. 30'),
          run(superscript, '3'),
          run(normal, '.')
        )
      );
      expect(textOf(rewritten)).toBe('prevăzute la art. 27¹ și la art. 30³.');
    });

    it('keeps words out of a superscript run', () => {
      const rewritten = rewriteParagraph(
        article,
        'prevăzute la art. 27¹ alin. (2) și la art. 30.',
        'runs'
      );
      expect(textOf(rewritten)).toBe('prevăzute la art. 27¹ alin. (2) și la art. 30.');
      expect(rewritten).toContain(run(superscript, '1'));
      expect(rewritten).toContain(run(normal, ' alin. (2) și la art. 30.'));
    });
  });

  it('writes a new superscript as a character where the passage does', () => {
    expect(
      rewriteParagraph(paragraph(run(normal, 'art. 30 alin. (1)')), 'art. 30³ alin. (1)')
    ).toBe(paragraph(run(normal, 'art. 30³ alin. (1)')));
  });

  it("keeps the tab a list item's label hangs from", () => {
    const item =
      '<w:p><w:r>' + normal + '<w:t>a)</w:t><w:tab/><w:t>să poarte casca;</w:t></w:r></w:p>';
    expect(rewriteParagraph(item, 'a) să poarte cască;')).toBe(
      '<w:p><w:r>' + normal + '<w:t>a)</w:t><w:tab/><w:t>să poarte cască;</w:t></w:r></w:p>'
    );
  });
});
