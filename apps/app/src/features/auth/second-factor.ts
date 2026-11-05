import { redirect } from '@tanstack/react-router';
import { z } from 'zod';

import type { AuthStore, VerifyResult } from './auth-store';

// Only a path inside the app, so the code page cannot send anyone to another site.
export const continueToSchema = z
  .string()
  .regex(/^\/(?![/\\])/)
  .optional()
  .catch(undefined);

export const codeField = z.string().regex(/^\d{6}$/, 'Introdu cele 6 cifre ale codului.');

export const codeSchema = z.object({ code: codeField });

export type CodeValues = z.infer<typeof codeSchema>;

export const codeFailureMessages: Record<Exclude<VerifyResult, 'verified'>, string> = {
  invalid: 'Codul nu este corect sau a expirat. Introdu codul afișat acum în aplicație.',
  'rate-limited': 'Prea multe încercări. Așteaptă un minut și încearcă din nou.',
  unreachable: 'Nu am putut verifica codul. Verifică conexiunea și încearcă din nou.',
  'signed-out': 'Sesiunea ta a expirat. Autentifică-te din nou pentru a continua.',
};

export async function requireSecondFactor(auth: AuthStore, href: string) {
  if (await auth.needsSecondFactor()) {
    throw redirect({ to: '/verificare-cod', search: { redirect: href }, replace: true });
  }
}
