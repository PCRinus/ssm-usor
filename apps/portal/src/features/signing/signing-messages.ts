import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type {
  SignatureErrorReason,
  SignerSlot,
  SigningItemFailureReason,
} from '@ssm-usor/contracts';

export const signAsMessages: Record<SignerSlot, MessageDescriptor> = {
  trainee: msg`semnezi ca lucrător`,
  trainer: msg`semnezi ca instructor`,
  verifier: msg`semnezi ca verificator`,
  admitter: msg`semnezi ca cel care admite la lucru`,
};

export const slotRoleMessages: Record<SignerSlot, MessageDescriptor> = {
  trainee: msg`lucrător`,
  trainer: msg`instructor`,
  verifier: msg`verificator`,
  admitter: msg`admite la lucru`,
};

export const itemFailureMessages: Record<SigningItemFailureReason, MessageDescriptor> = {
  request_not_pending: msg`Nu mai așteaptă semnătura ta: a fost semnat, anulat sau modificat între timp.`,
  agreement_not_awaiting: msg`Actul nu mai așteaptă semnătura ta: a fost semnat sau schimbat între timp.`,
  sheet_busy: msg`Fișa era folosită chiar atunci de altă semnătură. Încearcă din nou peste un minut.`,
  slot_not_on_sheet: msg`Fișa nu are loc pentru această semnătură. Spune-i specialistului.`,
  missing_sheet_data: msg`Fișa nu poate fi întocmită încă: lipsesc date pe care le completează specialistul.`,
  signer_unavailable: msg`Serviciul de semnare nu a răspuns. Încearcă din nou peste câteva minute.`,
  pdf_unavailable: msg`Documentul nu a putut fi pregătit. Încearcă din nou peste câteva minute.`,
  template_missing: msg`Documentul nu poate fi întocmit încă. Spune-i specialistului.`,
  signing_failed: msg`Nu a putut fi semnat. Încearcă din nou; dacă se repetă, spune-i specialistului.`,
  agreement_changed: msg`Actul adițional s-a schimbat de când ai cerut codul. Cere un cod nou și semnează din nou.`,
  missing_document_data: msg`Actul adițional nu poate fi întocmit încă: lipsesc date ale firmei pe care le completează specialistul.`,
  client_archived: msg`Firma nu mai este activă în aplicație, așa că nu se mai semnează nimic pentru ea.`,
  signer_not_of_client: msg`Nu mai poți semna pentru această firmă. Spune-i specialistului.`,
  row_locked: msg`Fișa nu poate primi semnătura acum. Spune-i specialistului.`,
  already_signed: msg`Rubrica era deja semnată.`,
  locked_field: msg`Fișa nu mai poate primi această semnătură. Spune-i specialistului.`,
  unknown_fields: msg`Fișa nu are rubricile așteptate. Spune-i specialistului.`,
  cannot_certify: msg`Fișa nu a putut fi certificată. Spune-i specialistului.`,
  signer_refused: msg`Serviciul de semnare a refuzat documentul. Spune-i specialistului.`,
};

type SessionReason = Extract<
  SignatureErrorReason,
  | 'signing_item_not_found'
  | 'signer_has_no_address'
  | 'signing_code_not_sent'
  | 'signing_unavailable'
>;

export const sessionFailureMessages: Record<SessionReason, MessageDescriptor> = {
  signing_item_not_found: msg`Ceva din listă nu mai așteaptă semnătura ta. Am actualizat lista; verifică-o și cere din nou codul.`,
  signer_has_no_address: msg`Nu avem o adresă de email sau un telefon la care să-ți trimitem codul. Spune-i specialistului.`,
  signing_code_not_sent: msg`Nu am putut trimite codul. Încearcă din nou peste câteva minute.`,
  signing_unavailable: msg`Semnarea nu este disponibilă acum. Încearcă din nou mai târziu.`,
};

type CodeReason = Extract<
  SignatureErrorReason,
  'code_expired' | 'code_already_used' | 'code_attempts_exceeded' | 'signing_session_not_found'
>;

export const spentCodeMessages: Record<CodeReason, MessageDescriptor> = {
  code_expired: msg`Codul a expirat: e valabil 10 minute. Cere un cod nou.`,
  code_already_used: msg`Codul a fost deja folosit. Cere un cod nou.`,
  code_attempts_exceeded: msg`Codul a fost greșit de trei ori. Cere un cod nou.`,
  signing_session_not_found: msg`Cererea de semnare nu mai există. Cere un cod nou.`,
};

export const unreachableMessage = msg`Cererea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.`;
