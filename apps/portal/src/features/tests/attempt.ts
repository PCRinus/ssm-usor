import type { TestAttemptResponseAttempt } from '@/api/generated/api';

export type Attempt = TestAttemptResponseAttempt;

export function resumeIndexOf(attempt: Attempt) {
  const unanswered = attempt.questions.findIndex((question) => question.chosen.length === 0);
  return unanswered === -1 ? attempt.questions.length - 1 : unanswered;
}
