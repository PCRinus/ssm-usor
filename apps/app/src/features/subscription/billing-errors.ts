import { type BillingChoiceProblem, billingChoiceProblemReasonSchema } from '@ssm-usor/contracts';

import { ApiHttpError } from '@/api/http';

import { contactEmail } from './subscription-copy';

export function problemMessage(problem: BillingChoiceProblem) {
  switch (problem.reason) {
    case 'start_employee_ceiling':
      return 'Start acoperă cel mult 600 de angajați. Pentru câți ai, alege Profesional.';
    case 'start_member_ceiling':
      return 'Start are cel mult 2 utilizatori. Pentru câți sunteți, alege Profesional.';
    case 'employee_packs_below_need':
      return `Pentru angajații de azi îți trebuie cel puțin ${problem.minimum ?? 1} ${problem.minimum === 1 ? 'pachet' : 'pachete'}.`;
    case 'extra_members_below_need':
      return `Pentru utilizatorii de azi îți trebuie cel puțin ${problem.minimum ?? 1} în plus.`;
    case 'employee_packs_above_plan':
      return `Planul permite cel mult ${problem.maximum ?? 0} pachete.`;
    case 'extra_members_above_plan':
      return `Planul permite cel mult ${problem.maximum ?? 0} ${problem.maximum === 1 ? 'utilizator' : 'utilizatori'} în plus.`;
    case 'split_change':
      return 'Pe planul anual, ce adaugi se plătește azi, iar ce scoți se schimbă abia la reînnoire, așa că le faci pe rând: întâi adaugi și plătești, apoi scoți ce nu mai îți trebuie.';
  }
}

const reasonMessages: Record<string, string> = {
  subscription_exists: 'Organizația are deja un abonament. Reîncarcă pagina ca să-l vezi.',
  already_subscribed:
    'Planul ales mai devreme e deja plătit și activ, așa că nu am mai făcut încă unul. Îl vezi pe pagina abonamentului.',
  checkout_in_progress:
    'Abonamentul se alege chiar acum, din altă fereastră. Așteaptă un minut, apoi reîncarcă pagina.',
  no_subscription: 'Organizația nu mai are un abonament activ. Reîncarcă pagina.',
  enterprise_plan: `Abonamentul Enterprise se schimbă prin email, la ${contactEmail}.`,
  company_details_missing:
    'Factura are nevoie de denumirea firmei și de CUI. Completează-le în Date firmă, apoi revino.',
  not_canceling: 'Abonamentul nu mai este anulat. Reîncarcă pagina.',
  unchanged: 'Abonamentul are deja această alegere.',
  pdf_pending: 'Factura se pregătește încă. Încearcă din nou peste câteva minute.',
  card_declined: 'Banca a refuzat cardul. Încearcă din nou sau folosește alt card.',
  stripe_unset: 'Plata nu este disponibilă acum. Încearcă din nou mai târziu.',
};

export function billingErrorMessage(cause: unknown) {
  if (cause instanceof ApiHttpError) {
    const reason = (cause.body as { reason?: unknown } | null)?.reason;
    if (typeof reason === 'string' && reason in reasonMessages) return reasonMessages[reason]!;
    const problem = billingChoiceProblemReasonSchema.safeParse(reason);
    if (problem.success) return problemMessage({ reason: problem.data });
    if (cause.status === 403) return 'Doar administratorul organizației schimbă abonamentul.';
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return 'Nu a reușit. Verifică conexiunea și încearcă din nou.';
}
