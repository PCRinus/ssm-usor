import type { ParticipantInvitationSms, SignInCodeSms } from '@ssm-usor/contracts';

// One GSM-7 segment. A single character outside GSM-7's basic set, such as "ș", switches the
// whole message to UCS-2: 70 characters a segment, and two or three times the price (ADR 022).
export const SMS_MAX_LENGTH = 160;

type Language = 'ro' | 'en';

// The country code is a proxy for the language; a language per person comes with the portal's
// second language (ADR 022).
const languageOf = (to: string): Language => (to.startsWith('+40') ? 'ro' : 'en');

const replacements: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
  ı: 'i',
  '„': '"',
  '“': '"',
  '”': '"',
  '«': '"',
  '»': '"',
  '‘': "'",
  '’': "'",
  '‚': "'",
  '–': '-',
  '—': '-',
  '‐': '-',
  '‑': '-',
  '…': '...',
  '[': '(',
  ']': ')',
  '{': '(',
  '}': ')',
};

// Printable ASCII without the characters GSM-7 has only in its extension table, which cost two
// characters each, or not at all (the backtick).
const unsafe = /[^ !"#$%&'()*+,\-./0-9:;<=>?@A-Z_a-z]/g;

export function toSmsText(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/./gsu, (char) => replacements[char] ?? char)
    .replace(unsafe, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function shorten(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}.`;
}

const endSentence = (text: string) => (text.endsWith('.') ? text : `${text}.`);

function fitNames(render: (first: string, second: string) => string, a: string, b: string) {
  const room = SMS_MAX_LENGTH - render('', '').length;
  if (room < 20) throw new Error('The message leaves no room for the names.');
  const first = shorten(a, Math.max(Math.floor(room / 2), room - b.length));
  const second = shorten(b, room - first.length);
  return render(first, second);
}

export function participantInvitationText({
  to,
  clientName,
  organizationName,
  portalUrl,
}: ParticipantInvitationSms) {
  const render =
    languageOf(to) === 'ro'
      ? (organization: string, client: string) =>
          `${organization} te invita in portalul SSM Usor pentru ${endSentence(client)} Intra pe ${portalUrl} cu acest numar de telefon.`
      : (organization: string, client: string) =>
          `${organization} invites you to the SSM Usor portal for ${endSentence(client)} Sign in at ${portalUrl} with this phone number.`;
  return fitNames(render, toSmsText(organizationName), toSmsText(clientName));
}

function validity(minutes: number, language: Language) {
  if (language === 'ro') {
    if (minutes === 60) return 'o ora';
    if (minutes % 60 === 0) return `${minutes / 60} ore`;
    if (minutes === 1) return 'un minut';
    return minutes < 20 ? `${minutes} minute` : `${minutes} de minute`;
  }
  if (minutes === 60) return '1 hour';
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export function signInCodeText({ to, code, expiresInMinutes }: SignInCodeSms) {
  const language = languageOf(to);
  const valid = validity(expiresInMinutes, language);
  return language === 'ro'
    ? `Codul tau SSM Usor: ${code}. Este valabil ${valid}. Nu il da nimanui: nimeni de la SSM Usor nu ti-l va cere.`
    : `Your SSM Usor code: ${code}. It is valid for ${valid}. Do not share it: nobody from SSM Usor will ask you for it.`;
}
