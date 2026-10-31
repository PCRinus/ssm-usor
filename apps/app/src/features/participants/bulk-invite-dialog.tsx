import {
  type BulkInvitationOutcome,
  type ImportInvitee,
  type ParticipantChannel,
  typedInvitationAddress,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { CircleCheck, IdCard, Mail, Send, Smartphone } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  getListClientParticipantsQueryKey,
  getListImportPortalInviteesQueryKey,
  getListImportsQueryKey,
  inviteEmployeeParticipants,
} from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import {
  capitalized,
  formerEmployeesSentence,
  invitationCount,
  nameOf,
  pendingSummary,
  rowReasonMessage,
  sendLabel,
  sentSummary,
} from './bulk-invite-format';
import { participantFailure } from './participant-errors';
import { useImportInvitees } from './use-import-invitees';

// Each request is short enough to answer well inside a Worker's time, and the count moves.
const requestSize = 10;
const shownAtFirst = 8;

interface RowResult {
  outcome: BulkInvitationOutcome;
  channel: ParticipantChannel | null;
  message: string | null;
}

type Phase =
  | { step: 'editing' }
  | { step: 'sending'; done: number; total: number }
  | { step: 'sent'; invited: number; notInvited: number };

const storedAddress = (invitee: ImportInvitee) => invitee.email ?? invitee.phone ?? '';

export function BulkInviteDialog({
  clientId,
  importId,
  open,
  onClose,
}: {
  clientId: string;
  importId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { queryClient } = useRouteContext({ from: '__root__' });
  const close = () => {
    void queryClient.invalidateQueries({
      queryKey: getListImportPortalInviteesQueryKey(clientId, importId),
    });
    void queryClient.invalidateQueries({
      queryKey: getListImportsQueryKey({ clientId, kind: 'employees', status: 'confirmed' }),
    });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {/* Mounted per opening, so a reopened dialog starts from the employees' rows again. */}
      {open && <BulkInviteForm clientId={clientId} importId={importId} onClose={close} />}
    </Dialog>
  );
}

function BulkInviteForm({
  clientId,
  importId,
  onClose,
}: {
  clientId: string;
  importId: string;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const invitees = useImportInvitees(clientId, importId, { refetchOnMount: 'always' });
  // The rows as fetched on opening, not as cached: someone may have been invited elsewhere since.
  // They stay while the dialog is open, since sending changes who is invited and each row keeps
  // its result.
  const [rows, setRows] = useState<ImportInvitee[] | null>(null);
  if (!rows && invitees.data && invitees.isFetchedAfterMount) setRows(invitees.data.items);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [phase, setPhase] = useState<Phase>({ step: 'editing' });

  const items = rows ?? [];
  const candidates = items.filter((invitee) => invitee.current && !invitee.portal);
  const withAddress = candidates.filter((invitee) => storedAddress(invitee));
  const withoutAddress = candidates.filter((invitee) => !storedAddress(invitee));
  const onPortal = items.filter((invitee) => invitee.current && invitee.portal);
  const formers = items.filter((invitee) => !invitee.current);

  const textOf = (invitee: ImportInvitee) => typed[invitee.employeeId] ?? storedAddress(invitee);
  const firstAt = new Map<string, ImportInvitee>();
  const plans = new Map<string, { address: string; channel: ParticipantChannel | null }>();
  const errors = new Map<string, string>();
  for (const invitee of candidates) {
    const text = textOf(invitee).trim();
    if (!text) continue;
    const address = typedInvitationAddress(text);
    if (!address) {
      errors.set(invitee.employeeId, 'Scrie un email sau un număr de telefon valid.');
      plans.set(invitee.employeeId, { address: text, channel: null });
      continue;
    }
    const first = firstAt.get(address.address);
    if (first) {
      errors.set(invitee.employeeId, `Aceeași adresă e scrisă și la ${nameOf(first)}.`);
    } else {
      firstAt.set(address.address, invitee);
    }
    plans.set(invitee.employeeId, { address: text, channel: address.channel });
  }
  const toSend = candidates.filter(
    (invitee) => plans.get(invitee.employeeId)?.channel && !errors.has(invitee.employeeId)
  );
  const bySms = toSend.filter((invitee) => plans.get(invitee.employeeId)?.channel === 'sms');
  const editing = phase.step === 'editing';

  async function send() {
    const planned = toSend.map((invitee) => ({
      employeeId: invitee.employeeId,
      address: plans.get(invitee.employeeId)!.address,
    }));
    const outcome: Record<string, RowResult> = {};
    for (const invitee of candidates) {
      const error = errors.get(invitee.employeeId);
      if (error) outcome[invitee.employeeId] = { outcome: 'failed', channel: null, message: error };
    }
    setPhase({ step: 'sending', done: 0, total: planned.length });
    for (let start = 0; start < planned.length; start += requestSize) {
      const chunk = planned.slice(start, start + requestSize);
      try {
        const { results: answered } = await inviteEmployeeParticipants(
          clientId,
          { invitations: chunk },
          apiRequest
        );
        for (const result of answered) {
          outcome[result.employeeId] = {
            outcome: result.outcome,
            channel: result.invitation?.channel ?? null,
            message: result.outcome === 'invited' ? null : rowReasonMessage(result.reason),
          };
        }
      } catch (cause) {
        const { message } = participantFailure(cause);
        for (const row of chunk) {
          outcome[row.employeeId] = { outcome: 'failed', channel: null, message };
        }
      }
      setResults({ ...outcome });
      setPhase({ step: 'sending', done: start + chunk.length, total: planned.length });
    }
    setResults(outcome);
    const invited = Object.values(outcome).filter((row) => row.outcome === 'invited').length;
    setPhase({ step: 'sent', invited, notInvited: Object.keys(outcome).length - invited });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListClientParticipantsQueryKey(clientId) }),
      // The employees' rows hold the addresses typed here, and their pages their portal state.
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith(`/clients/${clientId}/employees`),
      }),
    ]);
  }

  const row = (invitee: ImportInvitee) => {
    const id = invitee.employeeId;
    // An address from the employee's row is checked at once: nobody types it, so nobody blurs it.
    const prefilled = typed[id] === undefined;
    return (
      <InviteeRow
        key={id}
        invitee={invitee}
        text={textOf(invitee)}
        channel={plans.get(id)?.channel ?? null}
        error={touched[id] || prefilled ? errors.get(id) : undefined}
        result={results[id]}
        disabled={!editing}
        onChange={(text) => setTyped((current) => ({ ...current, [id]: text }))}
        onBlur={() => setTouched((current) => ({ ...current, [id]: true }))}
      />
    );
  };
  const leftOut = candidates.length - toSend.length;

  return (
    <DialogContent
      data-testid="bulk-invite-dialog"
      className="sm:max-w-3xl"
      showCloseButton={phase.step !== 'sending'}
      onEscapeKeyDown={(event) => phase.step === 'sending' && event.preventDefault()}
      onInteractOutside={(event) => phase.step === 'sending' && event.preventDefault()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editing && toSend.length > 0) void send();
        }}
        aria-busy={phase.step === 'sending'}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>Invită în portal angajații din fișe</DialogTitle>
          <DialogDescription>
            Fiecare primește adresa portalului și intră cu un cod primit la aceeași adresă, fără
            parolă. Invitația e valabilă 30 de zile.{' '}
            <HelpLink topic="angajati.invitatie-din-fise">Află mai mult</HelpLink>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-6">
          <PortalSteps />
          {invitees.isError ? (
            <Notice variant="destructive" data-testid="bulk-invite-load-error">
              Lista angajaților nu a putut fi încărcată. Închide dialogul și încearcă din nou.
            </Notice>
          ) : !rows ? (
            <div className="grid gap-2" data-testid="bulk-invite-loading">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              {candidates.length === 0 && (
                <Notice variant="info" data-testid="bulk-invite-nobody">
                  {onPortal.length > 0
                    ? 'Toți angajații din fișe au deja acces la portal sau o invitație.'
                    : 'Importul nu a adus angajați actuali de invitat.'}
                </Notice>
              )}
              {withAddress.length > 0 && (
                <InviteeGroup
                  testId="bulk-invite-with-address"
                  title="Primesc invitația"
                  count={withAddress.length}
                  note="Cine are și email și telefon primește invitația pe email."
                >
                  <RowList rows={withAddress} render={row} />
                </InviteeGroup>
              )}
              {withoutAddress.length > 0 && (
                <InviteeGroup
                  testId="bulk-invite-without-address"
                  title="Fără email sau telefon pe fișă"
                  count={withoutAddress.length}
                  description="Scrie unul ca să-l inviți acum. Gol, rămâne neinvitat; îl inviți oricând din pagina lui sau din fila Portal."
                >
                  <RowList rows={withoutAddress} render={row} />
                </InviteeGroup>
              )}
              {onPortal.length > 0 && (
                <InviteeGroup
                  testId="bulk-invite-on-portal"
                  title="Au deja acces sau invitație"
                  count={onPortal.length}
                >
                  <RowList
                    rows={onPortal}
                    render={(invitee) => (
                      <li
                        key={invitee.employeeId}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <PersonName invitee={invitee} />
                        <span className="text-xs text-muted-foreground">
                          {invitee.portal === 'participant' ? 'În portal' : 'Invitat'}
                        </span>
                      </li>
                    )}
                  />
                </InviteeGroup>
              )}
              <div className="grid gap-1.5 rounded-lg bg-muted/60 px-3.5 py-3 text-sm">
                <p className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5">
                  <IdCard className="mt-0.5 size-4" aria-hidden="true" />
                  <span data-testid="bulk-invite-saved-note">
                    Adresele scrise aici se salvează în datele angajaților.
                    {formers.length > 0 && ` ${formerEmployeesSentence(formers)}`}
                  </span>
                </p>
                {bySms.length > 0 && (
                  <p
                    data-testid="bulk-invite-sms"
                    className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5"
                  >
                    <Smartphone className="mt-0.5 size-4" aria-hidden="true" />
                    <span>
                      {capitalized(invitationCount(bySms.length))} pleacă prin SMS. Fiecare SMS
                      costă, ca și codurile de intrare trimise după aceea; emailul nu costă.
                    </span>
                  </p>
                )}
              </div>
            </>
          )}
        </DialogBody>
        {phase.step === 'sent' && (
          <Notice
            variant={phase.notInvited > 0 ? 'warning' : 'success'}
            data-testid="bulk-invite-summary"
            className="mt-4"
          >
            {sentSummary(phase.invited, phase.notInvited)}
          </Notice>
        )}
        <DialogFooter className="mt-5 items-center gap-3 border-t pt-4 sm:justify-between">
          <span
            data-testid="bulk-invite-count"
            className="text-sm text-muted-foreground tabular-nums"
          >
            {phase.step === 'sending'
              ? `Se trimit: ${phase.done} din ${phase.total}`
              : rows && candidates.length > 0 && editing
                ? pendingSummary(toSend.length, leftOut)
                : null}
          </span>
          <span className="flex flex-col-reverse gap-2 sm:flex-row">
            {phase.step === 'sent' ? (
              <Button type="button" data-testid="bulk-invite-done" onClick={onClose}>
                Închide
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={phase.step === 'sending'}
                  onClick={onClose}
                >
                  Renunță
                </Button>
                <Button
                  type="submit"
                  data-testid="bulk-invite-submit"
                  disabled={phase.step === 'sending' || toSend.length === 0}
                >
                  <Send aria-hidden="true" />
                  {phase.step === 'sending' ? 'Se trimit…' : sendLabel(toSend.length)}
                </Button>
              </>
            )}
          </span>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

const portalSteps = [
  {
    title: 'Cum le folosim datele',
    text: 'O informare la prima intrare, despre evidența instruirilor. Apasă «Am înțeles».',
  },
  {
    title: 'Actul adițional privind semnarea electronică',
    text: 'Primul lucru de semnat pe Acasă. Cine preferă hârtia îl semnează de mână; îl descarci din pagina lui.',
  },
  {
    title: 'Instruirile de acum înainte',
    text: 'Le semnează pe telefon. Ce e pe fișe rămâne semnat pe hârtie și apare doar de citit.',
  },
];

function PortalSteps() {
  return (
    <section aria-labelledby="bulk-invite-steps" className="grid gap-2.5">
      <h3 id="bulk-invite-steps" className="text-sm font-semibold text-muted-foreground">
        Ce găsesc în portal, în ordine
      </h3>
      <ol className="grid gap-2 sm:grid-cols-3" data-testid="bulk-invite-steps">
        {portalSteps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 px-3.5 py-3"
          >
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {index + 1}
            </span>
            <span className="text-sm leading-snug font-semibold">{step.title}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InviteeGroup({
  testId,
  title,
  count,
  description,
  note,
  children,
}: {
  testId: string;
  title: string;
  count: number;
  description?: string;
  note?: string;
  children: ReactNode;
}) {
  const id = `${testId}-title`;
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <h3
        id={id}
        className="flex items-baseline justify-between gap-3 text-sm font-semibold text-muted-foreground"
      >
        <span>{title}</span>
        <span className="font-medium tabular-nums">{count}</span>
      </h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {children}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}

function RowList({
  rows,
  render,
}: {
  rows: ImportInvitee[];
  render: (invitee: ImportInvitee) => ReactNode;
}) {
  const [all, setAll] = useState(rows.length <= shownAtFirst + 1);
  const shown = all ? rows : rows.slice(0, shownAtFirst);
  return (
    <>
      <ul className="mt-1 grid divide-y">{shown.map(render)}</ul>
      {!all && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setAll(true)}
        >
          Arată încă {rows.length - shownAtFirst}
        </Button>
      )}
    </>
  );
}

function PersonName({ invitee, hint }: { invitee: ImportInvitee; hint?: string }) {
  return (
    <span className="min-w-0">
      <span className="block font-semibold">{nameOf(invitee)}</span>
      {(invitee.position || hint) && (
        <span className="block text-xs text-muted-foreground">
          {[invitee.position, hint].filter(Boolean).join(' · ')}
        </span>
      )}
    </span>
  );
}

function InviteeRow({
  invitee,
  text,
  channel,
  error,
  result,
  disabled,
  onChange,
  onBlur,
}: {
  invitee: ImportInvitee;
  text: string;
  channel: ParticipantChannel | null;
  error: string | undefined;
  result: RowResult | undefined;
  disabled: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const inputId = `bulk-invite-${invitee.employeeId}`;
  const messageId = `${inputId}-message`;
  const fromRow = text !== '' && text === storedAddress(invitee);
  const message = result?.message ?? error;
  return (
    <li
      data-testid="bulk-invite-row"
      className="grid gap-x-3 gap-y-1.5 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_17.5rem_5.5rem] sm:items-center"
    >
      <PersonName invitee={invitee} hint={fromRow ? 'din datele angajatului' : undefined} />
      <span>
        <label htmlFor={inputId} className="sr-only">
          Email sau telefon pentru {nameOf(invitee)}
        </label>
        <Input
          id={inputId}
          className="h-9 tabular-nums"
          placeholder="Email sau telefon"
          autoComplete="off"
          value={text}
          disabled={disabled}
          aria-invalid={Boolean(error) || result?.outcome === 'failed' || undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </span>
      <RowStatus
        text={text}
        channel={error ? null : channel}
        result={result}
        leftOut={Boolean(error)}
      />
      {message && (
        <p
          id={messageId}
          data-testid="bulk-invite-row-message"
          className={cn(
            'text-xs sm:col-span-2 sm:col-start-2',
            result?.outcome === 'skipped' ? 'text-muted-foreground' : 'text-destructive'
          )}
        >
          {message}
        </p>
      )}
    </li>
  );
}

function RowStatus({
  text,
  channel,
  result,
  leftOut,
}: {
  text: string;
  channel: ParticipantChannel | null;
  result: RowResult | undefined;
  leftOut: boolean;
}) {
  if (result) {
    if (result.outcome === 'invited') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          Trimisă
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">Netrimisă</span>;
  }
  const shown = leftOut
    ? null
    : (channel ?? (text.trim() ? (text.includes('@') ? 'email' : 'sms') : null));
  if (!shown) return <span className="text-xs text-muted-foreground">Neinvitat</span>;
  const Icon = shown === 'email' ? Mail : Smartphone;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <Icon className="size-3.5" aria-hidden="true" />
      {shown === 'email' ? 'Email' : 'SMS'}
    </span>
  );
}
