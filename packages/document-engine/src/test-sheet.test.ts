import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { testSheetFacts, testSheetSamples } from '../tools/test-sheet-samples';
import { renderDocument, TemplateError, templatePlaceholders } from './render';
import { buildTestSheetData } from './test-sheet';
import { documentText } from './text';

const template = new Uint8Array(
  readFileSync(new URL('../templates/fisa_test.docx', import.meta.url))
);

const dotted = (data: object, prefix = ''): string[] =>
  Object.entries(data).flatMap(([key, value]) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? dotted(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );

const xmlOf = (bytes: Uint8Array) => new PizZip(bytes).file('word/document.xml')!.asText();

describe('the test sheet data', () => {
  const data = buildTestSheetData(testSheetFacts.passed);

  it('names the employee as the training sheets do and dates the test as the documents do', () => {
    expect(data.employee).toEqual({
      name: 'MĂRGINEANU-ZAHARIA Radu-Constantin',
      position: 'Operator montaj linii automate',
    });
    expect(data.takenOn).toBe('21.10.2026');
  });

  it('numbers the questions, letters the options and marks the ones chosen', () => {
    expect(data.questions).toHaveLength(10);
    expect(data.questions[0]!.number).toBe(1);
    expect(data.questions[0]!.options.map((option) => option.letter)).toEqual(['a', 'b', 'c']);
    for (const question of data.questions) {
      expect(question.options.filter((option) => option.chosen).length).toBeGreaterThan(0);
    }
  });

  it('gives an empty examiner when none is named yet', () => {
    expect(buildTestSheetData(testSheetFacts.annual).examiner).toEqual({ name: '', jobTitle: '' });
  });
});

describe('the test sheet template', () => {
  it('asks only for what its data has', () => {
    const { data } = testSheetSamples()[0]!;
    const known = new Set([
      ...dotted(data),
      'number',
      'text',
      'options',
      'letter',
      'chosen',
      '$last',
    ]);
    expect(templatePlaceholders(template).filter((name) => !known.has(name))).toEqual([]);
  });

  it.each(testSheetSamples())('prints the $label sample whole', ({ data }) => {
    const text = documentText(renderDocument(template, data));
    expect(text).not.toContain('{{');
    for (const line of [
      'FIȘA DE TEST',
      data.test.title,
      data.client.legalName,
      data.employee.name,
      data.employee.position,
      data.takenOn,
      data.test.code,
      `${data.score} din ${data.total} răspunsuri corecte (minimum 70%)`,
      'Admis',
      'Instruit',
      'Examinator',
    ]) {
      expect(text).toContain(line);
    }
    for (const question of data.questions) {
      expect(text).toContain(`${question.number}. ${question.text}`);
      for (const option of question.options) {
        expect(text).toContain(`${option.chosen ? '☒' : '☐'} ${option.letter}) ${option.text}`);
      }
    }
  });

  it('marks as many options chosen as the sitting has', () => {
    const { data } = testSheetSamples()[0]!;
    const text = documentText(renderDocument(template, data));
    const chosen = data.questions.flatMap((question) => question.options.filter((o) => o.chosen));
    expect(text.match(/☒/g)).toHaveLength(chosen.length + 1);
  });

  it('holds the two signature fields and the examiner fields the API signs and fills', () => {
    const titles = [...xmlOf(template).matchAll(/<w:alias w:val="([^"]+)"\/>/g)].map(
      (match) => match[1]
    );
    expect(titles).toEqual([
      'test_sig_trainee',
      'test_sig_examiner',
      'test_examiner_name',
      'test_examiner_job_title',
    ]);
  });

  it('prints the examiner only through the fields, so a change of examiner refills them', () => {
    const { data } = testSheetSamples()[0]!;
    expect(documentText(renderDocument(template, data))).not.toContain(data.examiner.name);
  });

  it('refuses to render without the questions', () => {
    const { data } = testSheetSamples()[0]!;
    const rest: Partial<typeof data> = { ...data };
    delete rest.questions;
    expect(() => renderDocument(template, rest)).toThrow(TemplateError);
  });
});
