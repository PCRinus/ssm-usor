import { buildTestSheetData, type TestSheetFacts } from '../src/test-sheet';
import { type KnowledgeTestCode, knowledgeTestData } from './knowledge-test-samples';

const letters = 'abcd';

function sitting(code: KnowledgeTestCode, wrong: number[]): TestSheetFacts['questions'] {
  return knowledgeTestData(code, 10).questions.map((question, index) => {
    const right = question.key.split(', ').map((letter) => letters.indexOf(letter.toLowerCase()));
    const chosen = wrong.includes(index) ? [(right[0]! + 1) % question.options.length] : right;
    return { text: question.text, options: question.options, chosen };
  });
}

const passed: TestSheetFacts = {
  branding: true,
  client: { legalName: 'S.C. INSTALAȚII TERMICE ȘI SANITARE BANAT CONSTRUCT S.R.L.' },
  employee: {
    lastName: 'Mărgineanu-Zaharia',
    firstName: 'Radu-Constantin',
    position: 'Operator montaj linii automate',
  },
  test: { code: 'TASSM', title: 'Test de verificare a cunoștințelor la angajare (TASSM)' },
  takenOn: '2026-10-21',
  questions: sitting('TASSM', [2, 5, 8]),
  score: 7,
  total: 10,
  grade: 'Admis',
  examiner: { name: 'Ana IONESCU', jobTitle: 'Inspector de securitate și sănătate în muncă' },
};

const annual: TestSheetFacts = {
  ...passed,
  branding: false,
  employee: { lastName: 'Pop', firstName: 'Ion', position: 'Sudor' },
  test: { code: 'TPSU', title: 'Test de verificare a cunoștințelor anual (TPSU)' },
  questions: sitting('TPSU', []),
  score: 10,
  examiner: null,
};

export const testSheetFacts = { passed, annual };

export function testSheetSamples() {
  return [
    { label: 'passed', data: buildTestSheetData(passed) },
    { label: 'annual', data: buildTestSheetData(annual) },
  ];
}
