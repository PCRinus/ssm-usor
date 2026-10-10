import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  fireOwnInstructionsChapters,
  generalTrainingChapters,
  ownInstructionsChapters,
} from '../../src/modules/documents/themes';

// The training themes cite chapters of 3.2, 2.2 and the IPSU as article ranges written into the
// code and the 4.2 template (ADR 014, ADR 019); an article added to any of them moves them.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);
const fireOwnInstructions = 'fire/2.1_fire_own_instructions.docx';

function documentXml(file: string) {
  return new PizZip(readFileSync(new URL(file, templatesUrl))).file('word/document.xml')!.asText();
}

function articlesByChapter(file: string) {
  const xml = documentXml(file);
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
      chapterStarts: [
        ...ownInstructionsChapters.chapterStarts,
        ownInstructionsChapters.articleCount + 1,
      ],
      total: ownInstructionsChapters.articleCount,
    });
  });

  it('fall where the general training material template has them', () => {
    expect(articlesByChapter('2.2_general_training_material.docx')).toEqual({
      chapterStarts: [...generalTrainingChapters.chapterStarts],
      total: generalTrainingChapters.articleCount,
    });
  });

  it('fall where the fire-safety own instructions template has them', () => {
    expect(articlesByChapter(fireOwnInstructions)).toEqual({
      chapterStarts: [...fireOwnInstructionsChapters.chapterStarts],
      total: fireOwnInstructionsChapters.articleCount,
    });
  });

  it('are the chapters the fire-safety training themes template prints, each once', () => {
    const text = documentXml('fire/3.1_fire_training_themes.docx')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '');
    const { chapterStarts, total } = articlesByChapter(fireOwnInstructions);
    const chapters = chapterStarts.map((start, index) => [
      start,
      (chapterStarts[index + 1] ?? total + 1) - 1,
    ]);
    const rows = [...text.matchAll(/^IPSU Art\. (\d+)(?: – (\d+))?$/gm)].map(([, from, to]) => [
      Number(from),
      Number(to ?? from),
    ]);
    expect([...rows].sort((a, b) => a[0]! - b[0]!)).toEqual(chapters);
    const summaries = [
      ...text.matchAll(/^CONȚINUTUL MATERIALULUI DE INSTRUIRE: IPSU Art\. ([^;]+);/gm),
    ]
      .flatMap(([, list]) => list!.split(', '))
      .map((range) => range.split(' – ').map(Number));
    const covered = summaries.flatMap(([from, to]) =>
      Array.from({ length: (to ?? from!) - from! + 1 }, (_, index) => from! + index)
    );
    expect([...covered].sort((a, b) => a - b)).toEqual(
      Array.from({ length: total }, (_, index) => index + 1)
    );
    for (const [from, to] of summaries) {
      expect(chapterStarts).toContain(from);
      expect([...chapterStarts.slice(1).map((start) => start - 1), total]).toContain(to ?? from);
    }
  });

  it('are the ranges the training themes template prints', () => {
    const text = documentXml('4.2_training_themes.docx')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '');
    const printed = (prefix: string) =>
      [...text.matchAll(new RegExp(`^${prefix} Art\\. (\\d+)(?: – (\\d+))?$`, 'gm'))].map(
        ([, from, to]) => [Number(from), Number(to ?? from)]
      );
    const ranges = (file: string) => {
      const { chapterStarts, total } = articlesByChapter(file);
      const starts = chapterStarts.filter((start) => start <= total);
      return starts.map((start, index) => [start, (starts[index + 1] ?? total + 1) - 1]);
    };

    expect(printed('I\\.P\\.S\\.S\\.M\\.')).toEqual(ranges('3.2_own_instructions.docx'));
    expect(printed('MISSMIG')).toEqual(ranges('2.2_general_training_material.docx'));
    expect(text).toContain(
      `I.P.S.S.M. Art.\u00a01\u00a0–\u00a0${articlesByChapter('3.2_own_instructions.docx').total};`
    );
  });
});
