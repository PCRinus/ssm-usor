import { describe, expect, it } from 'vitest';

import texts from '../../tools/import/ssm-duties.ro.json' with { type: 'json' };
import { ssmDutiesWording } from '../ssm-duties';
import { bodyOf, documentTextOf } from './read';

const paragraphs = (name: string) =>
  (bodyOf(name).match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []).map((paragraph) =>
    documentTextOf(paragraph.replaceAll('<w:tab/>', '<w:t> </w:t>')).replace(/\s+/g, ' ').trim()
  );
const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : [];
const withoutDash = (line: string) => line.replace(/^– /, '');

describe('document 13', () => {
  const printed = paragraphs(texts.file);

  it('prints every line of the wording its fingerprints hash, so the two cannot drift apart', () => {
    for (const line of [...strings(ssmDutiesWording.post), ...strings(ssmDutiesWording.roles)]) {
      expect(printed).toContain(line);
    }
  });

  it('repeats the measures of decision 1.4 word for word', () => {
    const decision = paragraphs('1.4_decision_imminent_danger.docx');
    for (const measure of texts.annex.wording.roles.imminent_danger.items) {
      expect(decision).toContain(withoutDash(measure));
    }
  });

  it("repeats the duties of decision 1.5, in the singular of one representative's annex", () => {
    const decision = paragraphs('1.5_decision_workers_representative.docx');
    const plural: Record<string, string> = {
      însoțește: 'însoțesc',
      aduce: 'aduc',
      urmărește: 'urmăresc',
    };
    for (const duty of texts.annex.wording.roles.workers_representative.items) {
      const [verb, ...rest] = withoutDash(duty).split(' ');
      expect(decision).toContain([plural[verb!] ?? verb, ...rest].join(' '));
    }
  });
});
