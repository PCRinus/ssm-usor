import {
  type EvaluationProfileErrorReason,
  evaluationProfileSortKeys,
  sortOrderSchema,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  ApiErrorResponse,
  EvaluationProfileListResponse,
  EvaluationProfileResponse,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import {
  factorCountLabel,
  unacceptableCountLabel,
} from '@/features/risk-evaluations/risk-evaluation-schema';

export type EvaluationProfile = EvaluationProfileResponse['profile'];
export type EvaluationProfileSummary = EvaluationProfileListResponse['items'][number];

export const riskLibrarySearchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(evaluationProfileSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  status: z.literal('archived').optional().catch(undefined),
});

export type RiskLibrarySearch = z.infer<typeof riskLibrarySearchSchema>;

export const profileNameFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Denumirea are cel puțin 2 caractere.')
    .max(160, 'Denumirea are cel mult 160 de caractere.'),
});

export type ProfileNameFormValues = z.infer<typeof profileNameFormSchema>;

export const profileNameTaken =
  'Biblioteca are deja o evaluare cu această denumire. Deosebește-le prin nume: „Lucrător de birou – contabilitate”.';

const hasReason = (cause: unknown, reason: EvaluationProfileErrorReason) =>
  cause instanceof ApiHttpError &&
  (cause.body as Partial<ApiErrorResponse> | null)?.reason === reason;

export const isProfileNameTaken = (cause: unknown) =>
  hasReason(cause, 'evaluation_profile_name_taken');

export const isProfileInUse = (cause: unknown) => hasReason(cause, 'evaluation_profile_in_use');

export const isProfileArchived = (cause: unknown) =>
  hasReason(cause, 'evaluation_profile_archived');

export const profileInUse =
  'Evaluarea este folosită la clienți, așa că nu se poate șterge. O poți arhiva: nu mai apare în „Aplică din bibliotecă”, iar clienții își păstrează fișele.';

/** "—", "1 client", "3 clienți", "20 de clienți". */
export function clientCountLabel(count: number) {
  if (count === 0) return '—';
  if (count === 1) return '1 client';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de clienți` : `${count} clienți`;
}

/** "Niciun factor", "4 factori, unul inacceptabil". */
export function profileTotalsLabel(
  profile: Pick<EvaluationProfileSummary, 'factorCount' | 'unacceptableFactorCount'>
) {
  if (profile.factorCount === 0) return factorCountLabel(0);
  return `${factorCountLabel(profile.factorCount)}, ${unacceptableCountLabel(profile.unacceptableFactorCount)}`;
}

export function profileCountLabel(count: number) {
  if (count === 0) return 'Nicio evaluare';
  if (count === 1) return '1 evaluare';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de evaluări` : `${count} evaluări`;
}

export function profileFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  if (isProfileNameTaken(cause)) return profileNameTaken;
  if (isProfileInUse(cause)) return profileInUse;
  if (cause.status === 404) return 'Evaluarea sau factorul nu mai există în bibliotecă.';
  if (cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return fallback;
}
