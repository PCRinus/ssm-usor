import {
  type BillingChoiceProblem,
  billingChoiceProblemReasonSchema,
  formatCount,
} from '@ssm-usor/contracts';

import { ApiHttpError } from '@/api/http';

import { contactEmail } from './subscription-copy';

export function problemMessage(problem: BillingChoiceProblem) {
  switch (problem.reason) {
    case 'employees_over_plan':
      return problem.maximum === 750
        ? 'Start acoperă cel mult 750 de lucrători. Pentru câți ai, alege Profesional.'
        : `Planurile din aplicație acoperă cel mult ${formatCount(problem.maximum ?? 5000)} de lucrători. Scrie-ne pentru o ofertă, la ${contactEmail}.`;
    case 'members_over_plan':
      return problem.maximum === 3
        ? 'Start are cel mult 3 utilizatori. Pentru câți sunteți, alege Profesional.'
        : `Planurile din aplicație au cel mult ${problem.maximum ?? 10} utilizatori. Scrie-ne pentru o ofertă, la ${contactEmail}.`;
    case 'step_below_need':
      return `Pentru lucrătorii de azi îți trebuie cel puțin treapta de ${formatCount(problem.minimum ?? 0)}.`;
    case 'split_change':
      return 'O plată anuală pentru schimbarea de mai devreme încă se confirmă. După ce reușește, poți programa schimbarea pentru reînnoire.';
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
  extras_pending_payment:
    'Banca încă trebuie să confirme o plată pentru o schimbare de plan. Extra se poate porni după ce plata e gata.',
  extras_unavailable:
    'Extra se poate porni doar pe un abonament plătit, fără plăți restante. Reîncarcă pagina.',
};

export function billingErrorMessage(cause: unknown) {
  if (cause instanceof ApiHttpError) {
    const reason = (cause.body as { reason?: unknown } | null)?.reason;
    if (typeof reason === 'string' && reason in reasonMessages) return reasonMessages[reason]!;
    const problem = billingChoiceProblemReasonSchema.safeParse(reason);
    if (problem.success) return problemMessage({ reason: problem.data });
    if (cause.status === 403) return 'Doar adminul organizației schimbă abonamentul.';
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return 'Nu a reușit. Verifică conexiunea și încearcă din nou.';
}
