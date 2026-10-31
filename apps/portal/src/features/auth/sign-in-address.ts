import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { SignInAddress } from './auth-store';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedAddress =
  { ok: true; address: SignInAddress; shown: string } | { ok: false; message: MessageDescriptor };

export async function parseSignInAddress(input: string): Promise<ParsedAddress> {
  const value = input.trim();
  if (!value) return { ok: false, message: msg`Scrie adresa de email sau numărul de telefon.` };
  if (value.includes('@')) {
    const email = value.toLowerCase();
    if (!emailPattern.test(email)) {
      return { ok: false, message: msg`Adresa de email nu pare scrisă corect.` };
    }
    return { ok: true, address: { email }, shown: email };
  }
  // The contracts carry the phone metadata (about 30 kB gzip); importing them only for a phone
  // keeps the sign-in page light.
  const { isRomanianNumber, normalizePhone } = await import('@ssm-usor/contracts');
  const phone = normalizePhone(value);
  if (!phone) {
    return {
      ok: false,
      message: msg`Numărul nu pare scris corect. Scrie-l cu 0 în față, de exemplu 0721 234 567.`,
    };
  }
  if (!isRomanianNumber(phone)) {
    return {
      ok: false,
      message: msg`Codurile prin SMS pleacă doar spre numere din România (+40). Intră cu adresa de email la care ai primit invitația sau spune-i specialistului SSM să-ți adauge una.`,
    };
  }
  return { ok: true, address: { phone }, shown: phone };
}
