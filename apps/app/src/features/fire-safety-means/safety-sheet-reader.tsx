import {
  importCredits,
  type ReadSafetySheetResponse,
  safetySheetErrorReasons,
  safetySheetLimits,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useRouteContext } from '@tanstack/react-router';
import { FileText, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  getGetMeQueryKey,
  getReadSafetySheetUrl,
} from '@/api/generated/api';
import { ApiHttpError, apiUpload } from '@/api/http';
import { Notice } from '@/components/notice';
import { CreditsLine } from '@/features/imports/credits-notices';
import { creditsDay, creditsLabel, creditsRefusal } from '@/features/imports/import-credits';
import { useCreditsBalance } from '@/features/imports/use-credits-balance';
import { contactEmail } from '@/features/subscription/subscription-copy';

import { droppedSentence, filledSentence, offeredSentence } from './substances-schema';

const cost = importCredits.safetySheet;

const refusals: Record<string, string> = {
  [safetySheetErrorReasons.notPdf]:
    'Fișa trebuie să fie un PDF. Alege PDF-ul primit de la furnizorul produsului.',
  [safetySheetErrorReasons.tooLarge]:
    'Fișierul are mai mult de 10 MB. O fișă cu date de securitate în PDF are de obicei sub 2 MB.',
  [safetySheetErrorReasons.tooManyPages]: `Fișierul are mai mult de 40 de pagini. O fișă cu date de securitate are de obicei sub 20; verifică dacă ai ales fișierul potrivit.`,
  [safetySheetErrorReasons.scanned]: `Fișa este scanată sau fotografiată. Deocamdată citim doar fișe în PDF cu text, cum le trimit furnizorii; cere-i furnizorului fișa în PDF sau completează câmpurile de mână.`,
  [safetySheetErrorReasons.unreadable]: `PDF-ul nu poate fi deschis: este deteriorat sau protejat cu parolă.`,
  [safetySheetErrorReasons.notASheet]: `Fișierul nu este o fișă cu date de securitate: nu are cele 16 secțiuni ale ei. O fișă tehnică sau o etichetă nu ajung.`,
};

function failureMessage(cause: unknown) {
  if (!(cause instanceof ApiHttpError)) {
    return 'Fișa nu a putut fi trimisă. Verifică conexiunea și încearcă din nou.';
  }
  const body = cause.body as Partial<ApiErrorResponse> | undefined;
  const reason = body?.reason;
  const credits =
    body?.creditsRefunded === true
      ? ' Creditele ți-au fost returnate.'
      : body?.creditsRefunded === false
        ? ` Creditele nu au putut fi returnate încă; scrie-ne la ${contactEmail} și le returnăm noi.`
        : '';
  if (reason && Object.hasOwn(refusals, reason)) return `${refusals[reason]!}${credits}`;
  if (reason === 'credits_insufficient' && body?.credits) {
    const { left, renewsAt } = body.credits;
    const until = renewsAt ? ` până pe ${creditsDay(renewsAt)}` : '';
    return left <= 0
      ? `Nu mai ai credite${until}. Scrie-ne la ${contactEmail} și îți adăugăm credite.`
      : `Nu ajung creditele: citirea fișei folosește ${creditsLabel(cost)}, iar ${left === 1 ? 'îți mai rămâne' : 'îți mai rămân'} ${left}${until}.`;
  }
  if (reason === 'client_archived') return 'Clientul este arhivat.';
  return `Nu am putut citi fișa acum. Încearcă din nou peste câteva minute.${credits}`;
}

function refusalBeforeSending(file: File) {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!pdf) return refusals[safetySheetErrorReasons.notPdf]!;
  if (file.size > safetySheetLimits.maxBytes) return refusals[safetySheetErrorReasons.tooLarge]!;
  return null;
}

export type SheetOutcome = { filled: number; offered: number; droppedCodes: number };

export function SafetySheetReader({
  clientId,
  disabled,
  onReading,
  onDraft,
}: {
  clientId: string;
  disabled: boolean;
  onReading: (reading: boolean) => void;
  onDraft: (answer: ReadSafetySheetResponse) => SheetOutcome;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { balance } = useCreditsBalance();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SheetOutcome | null>(null);
  const short = creditsRefusal(balance, cost) !== null;

  async function read(file: File | undefined) {
    if (!file) return;
    const refusal = refusalBeforeSending(file);
    setError(refusal);
    if (refusal) return;
    setReading(true);
    onReading(true);
    try {
      const answer = await apiUpload<ReadSafetySheetResponse>(
        getReadSafetySheetUrl(clientId),
        file,
        apiRequest
      );
      setOutcome(onDraft(answer));
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setReading(false);
      onReading(false);
      void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    }
  }

  // One button through every state, so focus stays on it while a second sheet is read.
  const choose = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="bg-card"
      data-testid="fire-substance-sheet-choose"
      disabled={disabled || short}
      aria-disabled={reading || undefined}
      onClick={() => {
        if (!reading) input.current?.click();
      }}
    >
      {reading ? 'Se citește…' : outcome ? 'Citește altă fișă' : 'Alege fișa (PDF)'}
    </Button>
  );

  return (
    <div className="grid gap-3 sm:col-span-2" data-testid="fire-substance-sheet">
      <Notice
        variant={reading || !outcome ? 'info' : 'success'}
        title={
          reading
            ? 'Citim fișa cu date de securitate…'
            : outcome
              ? 'Fișa a fost citită'
              : 'Completează din fișa cu date de securitate'
        }
        icon={
          reading ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : outcome ? undefined : (
            <FileText aria-hidden="true" />
          )
        }
        action={choose}
        data-testid={
          reading
            ? 'fire-substance-sheet-reading'
            : outcome
              ? 'fire-substance-sheet-done'
              : 'fire-substance-sheet-offer'
        }
      >
        {reading ? (
          <>
            Durează de obicei sub un minut. Fereastra rămâne deschisă până se termină citirea; poți
            completa între timp cantitatea și locul de depozitare.
          </>
        ) : outcome ? (
          <>
            {outcome.filled > 0
              ? filledSentence(outcome.filled)
              : 'Fișa nu a adăugat nimic în câmpurile goale.'}
            {outcome.offered > 0 && ` ${offeredSentence(outcome.offered)}`} Cantitatea și locul de
            depozitare le scrii tu.
          </>
        ) : (
          <>
            Alege PDF-ul fișei primite de la furnizorul produsului. Completăm câmpurile goale, iar
            tu le verifici înainte să salvezi.
            <CreditsLine
              className="mt-1.5"
              uses={`Citirea folosește ${creditsLabel(cost)}.`}
              balance={balance}
              short={short}
            />
          </>
        )}
      </Notice>
      {outcome && outcome.droppedCodes > 0 && (
        <Notice variant="warning" data-testid="fire-substance-sheet-dropped">
          {droppedSentence(outcome.droppedCodes)}
        </Notice>
      )}
      {error && (
        <Notice variant="destructive" data-testid="fire-substance-sheet-error">
          {error}
        </Notice>
      )}
      <input
        ref={input}
        type="file"
        data-testid="fire-substance-sheet-input"
        className="hidden"
        accept=".pdf,application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Emptied, so that choosing the same file again is still a change.
          event.target.value = '';
          void read(file);
        }}
      />
    </div>
  );
}
