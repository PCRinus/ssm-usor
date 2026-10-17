import { describe, expect, it } from 'vitest';

import { participantInvitationText, signInCodeText, SMS_MAX_LENGTH, toSmsText } from './messages';

// The GSM 03.38 default alphabet, without the escape to the extension table.
const gsm7Basic = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
);

function expectOneGsm7Segment(text: string) {
  const outside = [...text].filter((char) => !gsm7Basic.has(char) || char.charCodeAt(0) > 0x7e);
  expect(outside).toEqual([]);
  expect(text.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
}

const portalUrl = 'https://portal.ssmusor.ro';

const invitation = (to: string, organizationName: string, clientName: string) =>
  participantInvitationText({ to, organizationName, clientName, portalUrl });

describe('toSmsText', () => {
  it.each([
    ['Fabrica de Mobilă Ș.A.', 'Fabrica de Mobila S.A.'],
    ['Țesătoria „Bună” Întreprindere', 'Tesatoria "Buna" Intreprindere'],
    ['Müller & Søn – Café', 'Muller & Son - Cafe'],
    ['Alpha [Beta] {Gamma} ~ Delta | Epsilon', 'Alpha (Beta) (Gamma) Delta Epsilon'],
  ])('writes %s as %s', (name, text) => {
    expect(toSmsText(name)).toBe(text);
  });
});

describe('participant invitation', () => {
  it('is in Romanian, without diacritics, for a Romanian number', () => {
    const text = invitation('+40722123456', 'Protect SSM Consult', 'Fabrica de Mobilă Sigma SRL');

    expect(text).toBe(
      'Protect SSM Consult te invita in portalul SSM Usor pentru Fabrica de Mobila Sigma SRL. Intra pe https://portal.ssmusor.ro cu acest numar de telefon.'
    );
    expectOneGsm7Segment(text);
  });

  it('is in English for any other number', () => {
    const text = invitation('+373691234567', 'Protect SSM Consult', 'Fabrica Sigma SRL');

    expect(text).toBe(
      'Protect SSM Consult invites you to the SSM Usor portal for Fabrica Sigma SRL. Sign in at https://portal.ssmusor.ro with this phone number.'
    );
    expectOneGsm7Segment(text);
  });

  it('does not end the client name with two periods', () => {
    expect(invitation('+40722123456', 'Protect SSM', 'Sigma S.R.L.')).toContain(
      'pentru Sigma S.R.L. Intra pe'
    );
  });

  it.each(['+40722123456', '+447700900123'])(
    'shortens long names to stay in one segment for %s',
    (to) => {
      const organization = 'Societatea de Consultanță în Securitate și Sănătate în Muncă Protect';
      const client = 'Întreprinderea Mecanică de Utilaje și Echipamente Industriale Ștefănești';

      const text = invitation(to, organization, client);

      expectOneGsm7Segment(text);
      expect(text).toContain(portalUrl);
      expect(text).toMatch(/^Societatea de Consultanta/);
      expect(text).toContain('Intreprinderea Mecanica');
    }
  );

  it('gives a short name its whole length and the room it leaves to the other', () => {
    const client = 'Intreprinderea Mecanica de Utilaje si Echipamente Industriale Stefanesti';

    const text = invitation('+40722123456', 'SSM Pro', client);

    expectOneGsm7Segment(text);
    expect(text).toMatch(/^SSM Pro te invita/);
    expect(text).toContain('pentru Intreprinderea Mecanica de Utilaje si Echipamente');
  });
});

describe('sign-in code', () => {
  it('is in Romanian, without diacritics, for a Romanian number', () => {
    const text = signInCodeText({ to: '+40722123456', code: '493027', expiresInMinutes: 10 });

    expect(text).toBe(
      'Codul tau SSM Usor: 493027. Este valabil 10 minute. Nu il da nimanui: nimeni de la SSM Usor nu ti-l va cere.'
    );
    expectOneGsm7Segment(text);
  });

  it('is in English for any other number', () => {
    const text = signInCodeText({ to: '+4915112345678', code: '493027', expiresInMinutes: 10 });

    expect(text).toBe(
      'Your SSM Usor code: 493027. It is valid for 10 minutes. Do not share it: nobody from SSM Usor will ask you for it.'
    );
    expectOneGsm7Segment(text);
  });

  it.each([
    ['+40722123456', 60, 'valabil o ora'],
    ['+40722123456', 120, 'valabil 2 ore'],
    ['+40722123456', 30, 'valabil 30 de minute'],
    ['+447700900123', 60, 'valid for 1 hour'],
    ['+447700900123', 100, 'valid for 100 minutes'],
  ])('words the validity for %s and %s minutes', (to, expiresInMinutes, words) => {
    const text = signInCodeText({ to, code: '1234567890', expiresInMinutes });

    expect(text).toContain(words);
    expectOneGsm7Segment(text);
  });
});
