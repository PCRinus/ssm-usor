export const testSheetTypeKey = 'test_sheet';

export type TestSheetFacts = {
  branding: boolean;
  client: { legalName: string };
  employee: { lastName: string; firstName: string; position: string };
  test: { code: string; title: string };
  /** ISO date, the Romanian day of the finish. */
  takenOn: string;
  /** As the sitting showed them, in the shown order; `chosen` the indexes of the options picked. */
  questions: { text: string; options: { text: string }[]; chosen: number[] }[];
  score: number;
  total: number;
  /** As printed: "Admis". */
  grade: string;
  /** Null while the organization had nobody to propose and no member has named one. */
  examiner: { name: string; jobTitle: string } | null;
};

export type TestSheetData = {
  branding: boolean;
  client: { legalName: string };
  employee: { name: string; position: string };
  test: { code: string; title: string };
  takenOn: string;
  questions: {
    number: number;
    text: string;
    options: { letter: string; text: string; chosen: boolean }[];
  }[];
  score: number;
  total: number;
  grade: string;
  /**
   * Not printed by the merge: the examiner's name and function are fields of the PDF, which the
   * API fills from these after the conversion and again when a member changes the examiner.
   */
  examiner: { name: string; jobTitle: string };
};

const letters = 'abcdefghijklmnopqrstuvwxyz';

const text = (value: string | null | undefined) => value?.trim() ?? '';

const printedDate = (isoDate: string) => {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
};

export function buildTestSheetData(facts: TestSheetFacts): TestSheetData {
  const { employee } = facts;
  return {
    branding: facts.branding,
    client: { legalName: text(facts.client.legalName) },
    employee: {
      name: `${text(employee.lastName).toLocaleUpperCase('ro')} ${text(employee.firstName)}`,
      position: text(employee.position),
    },
    test: { code: text(facts.test.code), title: text(facts.test.title) },
    takenOn: printedDate(facts.takenOn),
    questions: facts.questions.map((question, index) => ({
      number: index + 1,
      text: text(question.text),
      options: question.options.map((option, at) => ({
        letter: letters[at]!,
        text: text(option.text),
        chosen: question.chosen.includes(at),
      })),
    })),
    score: facts.score,
    total: facts.total,
    grade: facts.grade,
    examiner: {
      name: text(facts.examiner?.name),
      jobTitle: text(facts.examiner?.jobTitle),
    },
  };
}
