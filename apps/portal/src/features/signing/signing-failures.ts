import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { SignSessionResponse } from '@/api/generated/api';
import { apiErrorBody, ApiHttpError } from '@/api/http';

import type { SigningItem } from './signing-items';
import {
  itemFailureMessages,
  sessionFailureMessages,
  signInAgainMessage,
  spentCodeMessages,
  tooManyItemsMessage,
  unreachableMessage,
} from './signing-messages';
import { type SmsRefusal, smsRefusalOf } from './sms-refusal';

// The API sends one signing code per account a minute.
export const resendDelaySeconds = 60;

export type SessionFailure = {
  message: MessageDescriptor;
  retryAfterSeconds: number;
  sms?: SmsRefusal;
};

export function sessionFailureOf(cause: unknown): SessionFailure {
  const body = apiErrorBody(cause);
  const reason = body?.reason ?? null;
  const sms = smsRefusalOf(body);
  if (sms)
    return { message: sessionFailureMessages.signing_code_not_sent, retryAfterSeconds: 0, sms };
  if (reason === 'code_rate_limited') {
    return {
      message: msg`Ai cerut un cod acum mai puțin de un minut.`,
      retryAfterSeconds: body?.retryAfterSeconds ?? resendDelaySeconds,
    };
  }
  if (reason && reason in sessionFailureMessages) {
    return {
      message: sessionFailureMessages[reason as keyof typeof sessionFailureMessages],
      retryAfterSeconds: 0,
    };
  }
  if (cause instanceof ApiHttpError && cause.status === 400) {
    return { message: tooManyItemsMessage, retryAfterSeconds: 0 };
  }
  if (cause instanceof ApiHttpError && (cause.status === 401 || cause.status === 403)) {
    return { message: signInAgainMessage, retryAfterSeconds: 0 };
  }
  return { message: unreachableMessage, retryAfterSeconds: 0 };
}

export type CodeError =
  | { kind: 'invalid'; attemptsLeft: number | null }
  | { kind: 'spent'; message: MessageDescriptor }
  | { kind: 'other'; message: MessageDescriptor };

export function codeErrorOf(cause: unknown): CodeError {
  const body = apiErrorBody(cause);
  const reason = body?.reason ?? null;
  if (reason === 'code_invalid') {
    const attemptsLeft = body?.attemptsLeft ?? null;
    return attemptsLeft === 0
      ? { kind: 'spent', message: spentCodeMessages.code_attempts_exceeded }
      : { kind: 'invalid', attemptsLeft };
  }
  if (reason && reason in spentCodeMessages) {
    return { kind: 'spent', message: spentCodeMessages[reason as keyof typeof spentCodeMessages] };
  }
  if (reason === 'signing_unavailable') {
    return { kind: 'other', message: sessionFailureMessages.signing_unavailable };
  }
  if (cause instanceof ApiHttpError && (cause.status === 401 || cause.status === 403)) {
    return { kind: 'other', message: signInAgainMessage };
  }
  return { kind: 'other', message: unreachableMessage };
}

export type Outcome = { item: SigningItem; signed: boolean; reason: MessageDescriptor | null };

export function outcomesOf(items: SigningItem[], result: SignSessionResponse): Outcome[] {
  return items.map((item) => {
    if (item.kind === 'agreement') {
      const answer = result.agreements.find((each) => each.employeeId === item.employeeId);
      return {
        item,
        signed: answer?.signed === true,
        reason: answer?.reason ? itemFailureMessages[answer.reason] : null,
      };
    }
    const failed = result.failed.find((each) => each.requestId === item.request.id);
    return {
      item,
      signed: result.signed.some((each) => each.requestId === item.request.id),
      reason: failed ? itemFailureMessages[failed.reason] : null,
    };
  });
}
