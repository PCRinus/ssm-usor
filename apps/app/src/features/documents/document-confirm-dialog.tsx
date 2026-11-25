import { numberedTitle, unfilledMark } from '@ssm-usor/contracts';

import { ConfirmDialog } from '@/components/confirm-dialog';

import type { Confirming } from './use-document-actions';

const confirmations = {
  regenerate: {
    title: 'Generezi documentul din nou?',
    confirm: 'Generează din nou',
    pending: 'Se generează…',
    destructive: false,
  },
  issue: {
    title: 'Emiți documentul?',
    confirm: 'Emite',
    pending: 'Se emite…',
    destructive: false,
  },
  issueUnfilled: {
    title: 'Documentul mai are text de completat',
    confirm: 'Emite oricum',
    pending: 'Se emite…',
    destructive: false,
  },
  upload: {
    title: 'Înlocuiești ciorna cu un fișier?',
    confirm: 'Alege fișierul',
    pending: 'Se încarcă…',
    destructive: false,
  },
  delete: {
    title: 'Ștergi ciorna?',
    confirm: 'Șterge ciorna',
    pending: 'Se șterge…',
    destructive: true,
  },
} as const;

function confirmationText({ action, document }: NonNullable<Confirming>) {
  if (action === 'issueUnfilled') {
    return `În fișier scrie încă „${unfilledMark}”, acolo unde aplicația nu a avut ce completa. Deschide documentul: butonul „locuri de completat” din bara editorului te duce la fiecare. Dacă îl emiți așa, nu mai poate fi modificat decât printr-o ciornă nouă.`;
  }
  if (action === 'upload') {
    return 'Fișierul Word pe care îl alegi ia locul ciornei. Ce conține ciorna acum se pierde; dacă vrei să o păstrezi, descarc-o înainte.';
  }
  if (action === 'issue') {
    return document.issued
      ? `Ciorna devine revizia ${document.draft?.revision} și o înlocuiește pe cea emisă acum, care rămâne descărcabilă. Un document emis nu se mai modifică; o corectură este o ciornă nouă. La emitere se face și PDF-ul, ceea ce poate dura câteva secunde.`
      : 'Un document emis nu se mai modifică; o corectură este o ciornă nouă, care îl înlocuiește la emitere. La emitere se face și PDF-ul, ceea ce poate dura câteva secunde.';
  }
  if (action === 'delete') {
    return document.issued
      ? 'Ciorna și fișierul ei se șterg definitiv. Revizia emisă rămâne neschimbată.'
      : 'Ciorna și fișierul ei se șterg definitiv. Documentul poate fi generat din nou oricând.';
  }
  if (document.draft?.editedAt) {
    return 'Ciorna a fost modificată de mână. Dacă o generezi din nou, este completată cu datele de acum ale clientului, iar modificările tale se pierd.';
  }
  if (!document.editable) {
    return document.draft
      ? 'Ciorna este completată din nou cu datele de acum ale clientului.'
      : 'Se creează o ciornă nouă, completată cu datele de acum ale clientului. Revizia emisă rămâne în vigoare până când emiți ciorna.';
  }
  return document.draft
    ? 'Ciorna este completată din nou cu datele de acum ale clientului. Modificările făcute de mână în fișier se pierd.'
    : 'Se creează o ciornă nouă din șablon, completată cu datele de acum ale clientului, fără modificările făcute de mână în documentul emis. Ca să le păstrezi, alege „Modifică documentul emis”. Revizia emisă rămâne în vigoare până când emiți ciorna.';
}

// No `error` here: a refusal for missing data lists rows to fill in, which only the card has
// room for.
export function DocumentConfirmDialog({
  confirming,
  busy,
  onConfirm,
  onClose,
}: {
  confirming: NonNullable<Confirming>;
  busy: boolean;
  onConfirm: () => unknown;
  onClose: () => void;
}) {
  const confirmation = confirmations[confirming.action];
  return (
    <ConfirmDialog
      open
      busy={busy}
      testId="document"
      title={confirmation.title}
      confirmLabel={confirmation.confirm}
      pendingLabel={confirmation.pending}
      destructive={confirmation.destructive}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <span className="font-medium text-foreground">
        {numberedTitle(confirming.document.typeKey, confirming.document.title)}
      </span>
      {'. '}
      {confirmationText(confirming)}
    </ConfirmDialog>
  );
}
