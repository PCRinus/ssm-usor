import { describe, expect, it } from 'vitest';

import {
  createTestQuestionRequestSchema,
  knowledgeTestCodeOf,
  knowledgeTestTitleOf,
  paperTestResultRequestSchema,
  testAttemptAnswerRequestSchema,
  testBankQuerySchema,
  testPassed,
  testResultMaterial,
} from './tests';

const options = [
  { text: 'Legea 319/2006', correct: true },
  { text: 'Legea 53/2003', correct: false },
];

describe('createTestQuestionRequestSchema', () => {
  it('takes an own question with its options', () => {
    expect(
      createTestQuestionRequestSchema.parse({
        domain: 'ssm',
        test: 'hiring',
        text: ' Ce lege reglementează securitatea muncii? ',
        options,
      })
    ).toMatchObject({ text: 'Ce lege reglementează securitatea muncii?' });
  });

  it('refuses a question without a correct option', () => {
    const parsed = createTestQuestionRequestSchema.safeParse({
      domain: 'ssm',
      test: 'hiring',
      text: 'Ce lege reglementează securitatea muncii?',
      options: options.map((option) => ({ ...option, correct: false })),
    });
    expect(parsed.error?.issues[0]?.path).toEqual(['options']);
  });

  it('refuses an annual occupational safety question', () => {
    const parsed = createTestQuestionRequestSchema.safeParse({
      domain: 'ssm',
      test: 'annual',
      text: 'Ce lege reglementează securitatea muncii?',
      options,
    });
    expect(parsed.error?.issues[0]?.path).toEqual(['test']);
  });
});

describe('testAttemptAnswerRequestSchema', () => {
  it('refuses an option chosen twice', () => {
    expect(testAttemptAnswerRequestSchema.safeParse({ chosen: [1, 1] }).success).toBe(false);
  });

  it('takes an empty answer', () => {
    expect(testAttemptAnswerRequestSchema.parse({ chosen: [] })).toEqual({
      chosen: [],
    });
  });
});

describe('paperTestResultRequestSchema', () => {
  it('grades a paper result admis', () => {
    expect(
      paperTestResultRequestSchema.parse({
        domain: 'psi',
        test: 'annual',
        takenOn: '2026-10-20',
        examiner: { name: 'Vasile Tehnic', jobTitle: 'Cadru tehnic PSI' },
      })
    ).toMatchObject({ grade: 'admis' });
  });
});

describe('testPassed', () => {
  it.each([
    [7, 10, true],
    [6, 10, false],
    [10, 10, true],
  ])('%i of %i passes: %s', (score, total, passed) => {
    expect(testPassed(score, total)).toBe(passed);
  });
});

describe('testResultMaterial', () => {
  it('names the test and its code', () => {
    expect(testResultMaterial('ssm', 'hiring')).toBe(
      'Test de verificare a cunoștințelor la angajare (TASSM)'
    );
    expect(testResultMaterial('psi', 'hiring')).toBe(
      'Test de verificare a cunoștințelor la angajare (TASU)'
    );
    expect(testResultMaterial('psi', 'annual')).toBe('Verificare anuală pe bază de test (TPSU)');
  });
});

describe('knowledgeTestTitleOf', () => {
  it('names each test with its code', () => {
    expect(knowledgeTestCodeOf('psi', 'annual')).toBe('TPSU');
    expect(knowledgeTestTitleOf('ssm', 'hiring')).toBe(
      'Test de verificare a cunoștințelor la angajare (TASSM)'
    );
  });
});

describe('testBankQuerySchema', () => {
  it('lists every test without a filter and refuses an annual occupational safety test', () => {
    expect(testBankQuerySchema.parse({})).toEqual({});
    expect(testBankQuerySchema.safeParse({ domain: 'ssm', test: 'annual' }).success).toBe(false);
  });
});
