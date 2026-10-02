import type { EvaluationProfileErrorReason } from '@ssm-usor/contracts';
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

export const profileNameFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Denumirea are cel puțin 2 caractere.')
    .max(160, 'Denumirea are cel mult 160 de caractere.'),
});

export type ProfileNameFormValues = z.infer<typeof profileNameFormSchema>;

export const profileNameTaken =
  'Biblioteca are deja un profil cu această denumire. Deosebește-le prin nume: „Lucrător de birou – contabilitate”.';

export const isProfileNameTaken = (cause: unknown) =>
  cause instanceof ApiHttpError &&
  (cause.body as Partial<ApiErrorResponse> | null)?.reason ===
    ('evaluation_profile_name_taken' satisfies EvaluationProfileErrorReason);

/** "Niciun factor", "4 factori, unul inacceptabil". */
export function profileTotalsLabel(
  profile: Pick<EvaluationProfileSummary, 'factorCount' | 'unacceptableFactorCount'>
) {
  if (profile.factorCount === 0) return factorCountLabel(0);
  return `${factorCountLabel(profile.factorCount)}, ${unacceptableCountLabel(profile.unacceptableFactorCount)}`;
}

export function profileCountLabel(count: number) {
  if (count === 0) return 'Niciun profil';
  if (count === 1) return '1 profil';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de profiluri` : `${count} profiluri`;
}

export function profileFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  if (isProfileNameTaken(cause)) return profileNameTaken;
  if (cause.status === 404) return 'Profilul sau factorul nu mai există în bibliotecă.';
  if (cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return fallback;
}
