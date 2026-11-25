import { describe, expect, it } from 'vitest';

import texts from '../../tools/import/ssm-duties.ro.json' with { type: 'json' };
import { renderDocument } from '../render';
import { ssmDutiesWording } from '../ssm-duties';
import { documentText } from '../text';
import { bodyOf, documentTextOf, read } from './read';

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

describe('the acknowledgement sheet', () => {
  const sheet = texts.acknowledgement;
  const printed = paragraphs(sheet.file);

  it("prints every line of document 13's annex, so it says what the annex says", () => {
    for (const line of [...strings(ssmDutiesWording.post), ...strings(ssmDutiesWording.roles)]) {
      expect(printed).toContain(line);
    }
  });

  it("prints one worker's annex with only the role blocks they hold, and their statement", () => {
    const text = documentText(
      renderDocument(read(sheet.file), {
        branding: true,
        issueDate: '24.11.2026',
        client: { legalName: 'Exemplu SRL' },
        employee: { name: 'Ion Popescu' },
        number: 2,
        position: 'Sudor',
        instructions: [{ number: 3, title: 'Sudură' }],
        hasInstructions: true,
        equipment: true,
        zones: [],
        hasZones: false,
        trainingInterval: 'la 3 luni',
        workplaceManagerDuties: { people: 'Ion Popescu' },
        firstAidDuties: null,
        imminentDangerDuties: { people: 'Ion Popescu', decision: 'nr. 4 SSM din 24.11.2026' },
        workersRepresentativeDuties: null,
        hasRoles: true,
      })
    );
    expect(text).toContain('anexa 2 din documentul 13');
    expect(text).toContain('emis la 24.11.2026');
    expect(text).toContain('Lucrător: Ion Popescu');
    expect(text).toContain('Anexa 3. I.P.S.S.M. Sudură;');
    expect(text).toContain('Conducător al locului de muncă: Ion Popescu');
    expect(text).toContain('conform deciziei nr. 4 SSM din 24.11.2026: Ion Popescu');
    expect(text).not.toContain('prim ajutor (art. 10');
    expect(text).toContain(sheet.statement);
  });
});
