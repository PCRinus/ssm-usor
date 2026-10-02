import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  generalTrainingArticleCount,
  generalTrainingChapterStarts,
  ownInstructionsArticleCount,
  ownInstructionsChapterStarts,
} from '../../src/modules/documents/themes';

// The training themes cite chapters of 3.2 and 2.2 as article ranges written into the code
// and the 4.2 template (ADR 014); an article added to either template moves them.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);

function articlesByChapter(file: string) {
  const xml = new PizZip(readFileSync(new URL(file, templatesUrl)))
    .file('word/document.xml')!
    .asText();
  const paragraphs = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((paragraph) => {
    const numbering = /<w:pPr>[\s\S]*?<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(paragraph)?.[1] ?? '';
    const level = /<w:ilvl w:val="(\d+)"\/>/.exec(numbering)?.[1];
    const numId = /<w:numId w:val="(\d+)"\/>/.exec(numbering)?.[1];
    let text = '';
    paragraph.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (_, run: string) => {
      text += run;
      return '';
    });
    return { list: level === '0' && numId && numId !== '0' ? numId : null, text: text.trim() };
  });
  const counts = new Map<string, number>();
  for (const { list } of paragraphs) if (list) counts.set(list, (counts.get(list) ?? 0) + 1);
  const articles = [...counts].sort((a, b) => b[1] - a[1])[0]![0];

  const chapterStarts: number[] = [];
  let count = 0;
  for (const paragraph of paragraphs) {
    // "Capitolul. X." also occurs, with a dot after the word.
    if (/^(Capitolul|CAPITOLUL)\b/.test(paragraph.text)) chapterStarts.push(count + 1);
    if (paragraph.list === articles) count += 1;
  }
  return { chapterStarts, total: count };
}

describe('the chapters the training themes cite', () => {
  it('fall where the own instructions template has them, chapter XIII being the annexes', () => {
    expect(articlesByChapter('3.2_own_instructions.docx')).toEqual({
      chapterStarts: [...ownInstructionsChapterStarts, ownInstructionsArticleCount + 1],
      total: ownInstructionsArticleCount,
    });
  });

  it('fall where the general training material template has them', () => {
    expect(articlesByChapter('2.2_general_training_material.docx')).toEqual({
      chapterStarts: [...generalTrainingChapterStarts],
      total: generalTrainingArticleCount,
    });
  });
});
