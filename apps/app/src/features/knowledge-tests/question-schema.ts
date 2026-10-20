import { knowledgeTestSchema } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { CreateTestQuestionRequest, UpdateTestQuestionRequest } from '@/api/generated/api';

import type { BankQuestion } from './test-format';

export const minimumOptions = 2;
export const maximumOptions = 4;

export const questionFormSchema = z.object({
  test: knowledgeTestSchema,
  text: z
    .string()
    .trim()
    .min(5, 'Scrie întrebarea, de cel puțin cinci caractere.')
    .max(1000, 'Întrebarea are cel mult 1000 de caractere.'),
  options: z
    .array(
      z.object({
        text: z
          .string()
          .trim()
          .min(1, 'Scrie varianta sau scoate-o.')
          .max(500, 'O variantă are cel mult 500 de caractere.'),
        correct: z.boolean(),
      })
    )
    .min(minimumOptions)
    .max(maximumOptions)
    .refine((options) => options.some((option) => option.correct), {
      message: 'Marchează cel puțin o variantă corectă.',
    }),
  explanation: z.string().trim().max(1000, 'Explicația are cel mult 1000 de caractere.'),
  citation: z.string().trim().max(300, 'Temeiul are cel mult 300 de caractere.'),
});

export type QuestionFormValues = z.infer<typeof questionFormSchema>;

export const newOption = () => ({ text: '', correct: false });

export function questionFormValues(
  question: BankQuestion | null,
  test: QuestionFormValues['test']
): QuestionFormValues {
  if (!question) {
    return {
      test,
      text: '',
      options: [newOption(), newOption(), newOption()],
      explanation: '',
      citation: '',
    };
  }
  return {
    test: question.test,
    text: question.text,
    options: question.options.map((option) => ({ ...option })),
    explanation: question.explanation ?? '',
    citation: question.citation ?? '',
  };
}

export function toQuestionRequest(values: QuestionFormValues): UpdateTestQuestionRequest {
  return {
    text: values.text,
    options: values.options,
    explanation: values.explanation || null,
    citation: values.citation || null,
  };
}

export const toNewQuestionRequest = (
  domain: CreateTestQuestionRequest['domain'],
  values: QuestionFormValues
): CreateTestQuestionRequest => ({ domain, test: values.test, ...toQuestionRequest(values) });
