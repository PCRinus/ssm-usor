import { importErrorReasons, trainingDomainLabels } from '@ssm-usor/contracts';
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
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouteContext, useRouter } from '@tanstack/react-router';
import {
  BadgeCheck,
  CalendarCheck,
  FileImage,
  PenOff,
  RotateCcw,
  TriangleAlert,
  UserMinus,
  UserPlus,
  UserRoundPen,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  type ApiErrorResponse,
  confirmImport,
  getGetClientQueryKey,
  getGetImportQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { roCount } from '@/features/employees/employee-format';

import { importErrorMessage, photosLabel } from '../import-format';
import { confirmIssueLines, createLabel } from './confirm-messages';
import {
  confirmSummary,
  decisionsOf,
  personName,
  type ReviewContext,
} from './employee-review-model';
import { leaveEmployeesImported } from './employees-imported-notice';
import type { EmployeeReview } from './use-employee-review';

function Line({
  icon,
  count,
  label,
  detail,
  warn = false,
}: {
  icon: ReactNode;
  count?: number;
  label: string;
  detail: ReactNode;
  warn?: boolean;
}) {
  return (
    <li
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3"
      data-testid="employee-confirm-line"
    >
      <span
        className={cn(
          'grid size-9 place-items-center rounded-lg',
          warn ? 'bg-warning text-warning-foreground' : 'bg-secondary'
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm">
          {count !== undefined && <span className="mr-1 font-semibold tabular-nums">{count}</span>}
          <span className="font-medium">{label}</span>
        </span>
        <span className="text-[13px] text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
    <ul className="grid gap-3">{children}</ul>
  </>
);

const join = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names.at(-1)}` : (names[0] ?? '');

const count = (value: number, one: string, many: string) =>
  roCount(value, one, many).replace(/^\d+ /, '');

const issueFallback =
  'Nu am putut crea angajații: o valoare nu se poate salva. Verifică persoanele și încearcă din nou.';

const conflictReasons: Record<string, string> = {
  [importErrorReasons.outdated]:
    'Clientul s-a schimbat între timp: un post, un loc de muncă sau un angajat ales nu mai există. Reîncarcă pagina și alege din nou.',
};

export function EmployeeConfirmDialog({
  open,
  detail,
  clientId,
  clientName,
  context,
  review,
  onClose,
}: {
  open: boolean;
  detail: ImportDetail;
  clientId: string;
  clientName: string;
  context: ReviewContext;
  review: EmployeeReview;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const summary = confirmSummary(context);
  const total = context.proposal.people.length;
  const writtenCount = summary.written.length;
  const newCount = summary.created.length + summary.leavers.length;
  const checkedCount = Object.values(context.states).filter((state) => state === 'checked').length;
  const left = summary.toCheck;
  const nameOf = (person: (typeof left)[number]) => personName(context, person);

  async function confirm() {
    setSending(true);
    setError(null);
    setIssues([]);
    try {
      const saved = await review.flush();
      if ('error' in saved) {
        setError(saved.error);
        setSending(false);
        return;
      }
      await confirmImport(detail.id, { version: saved.version }, apiRequest);
      leaveEmployeesImported(clientId, {
        created: summary.created.length + summary.leavers.length,
        photos: summary.files,
        trainingsHeld: summary.trainingsHeld,
        completed: summary.completed.map(nameOf),
        leavers: summary.leavers.map(nameOf),
        noCommute: summary.noCommute.map(nameOf),
        noContact: summary.noContact.length,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetImportQueryKey(detail.id) }),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => String(queryKey[0]).startsWith(`/clients/${clientId}`),
        }),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => String(queryKey[0]).startsWith('/employees'),
        }),
        queryClient.refetchQueries({ queryKey: getGetClientQueryKey(clientId) }),
      ]);
      await navigate({ to: '/clients/$clientId/employees', params: { clientId } });
      // The client's header reads its route's loader, which keeps the client it loaded.
      await router.invalidate();
    } catch (cause) {
      const body =
        cause instanceof ApiHttpError
          ? (cause.body as Partial<ApiErrorResponse> | undefined)
          : undefined;
      const reason = body?.reason;
      if (reason === importErrorReasons.refused || reason === importErrorReasons.incomplete) {
        const lines = confirmIssueLines(context, body?.issues ?? []);
        if (lines.length > 0) setIssues(lines);
        else setError(issueFallback);
      } else {
        setError(
          reason && Object.hasOwn(conflictReasons, reason)
            ? conflictReasons[reason]!
            : importErrorMessage(
                cause,
                'Nu am putut crea angajații. Încearcă din nou.',
                'employees'
              )
        );
      }
      setSending(false);
    }
  }

  const ssmPsi = [
    summary.tests.ssm > 0 ? `${summary.tests.ssm} SSM` : null,
    summary.tests.psi > 0 ? `${summary.tests.psi} PSI` : null,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent data-testid="employee-confirm-dialog" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {left.length > 0
              ? `Creezi angajații fără ${left.length === 1 ? 'cel neverificat' : `cei ${roCount(left.length, 'neverificat', 'neverificați')}`}?`
              : `Creezi angajații clientului ${clientName}?`}
          </DialogTitle>
          <DialogDescription>
            {left.length > 0
              ? `${checkedCount} din ${roCount(total, 'persoană', 'persoane')} sunt verificate.`
              : total === 1
                ? 'Persoana de pe fișe e verificată.'
                : `Toate cele ${roCount(total, 'persoană', 'persoane')} de pe fișe sunt verificate.`}{' '}
            Preluăm ce ai verificat; orice poți modifica după, din pagina fiecărui angajat.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4 grid gap-4">
          {left.length > 0 && (
            <Notice
              variant="warning"
              title={
                left.length === 1
                  ? 'O persoană nu e verificată'
                  : `${roCount(left.length, 'persoană', 'persoane')} nu sunt verificate`
              }
              data-testid="employee-confirm-left"
            >
              <ul className="my-1 grid gap-0.5">
                {left.map((person) => {
                  const decision = decisionsOf(context, person)[0];
                  return (
                    <li key={person.id}>
                      <span className="font-medium">{nameOf(person)}</span>{' '}
                      <span className="text-muted-foreground">
                        {decision ? decision.tag.toLowerCase() : 'încă nedeschisă'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              Rămân în afara acestui import: nu creăm angajații lor. Îi poți aduce mai târziu,
              într-un import nou, din fotografiile fișelor lor.
            </Notice>
          )}
          <Group title="Se adaugă">
            {summary.created.length > 0 && (
              <Line
                icon={<UserPlus className="size-4" />}
                count={summary.created.length}
                label={count(summary.created.length, 'angajat nou', 'angajați noi')}
                detail="Cu postul ales pentru fiecare."
              />
            )}
            {summary.completed.map((person) => (
              <Line
                key={person.id}
                icon={<UserRoundPen className="size-4" />}
                label={`${nameOf(person)} se completează`}
                detail="Primește ce lipsea și instruirile de pe fișa lui. Ce avea deja în aplicație rămâne."
              />
            ))}
            {summary.leavers.length > 0 && (
              <Line
                icon={<UserMinus className="size-4" />}
                count={summary.leavers.length}
                label={count(summary.leavers.length, 'fost angajat', 'foști angajați')}
                detail={`${join(summary.leavers.map(nameOf))}, cu instruirile lor. Apar la Foști angajați.`}
              />
            )}
            {summary.trainingsHeld > 0 && (
              <Line
                icon={<CalendarCheck className="size-4" />}
                count={summary.trainingsHeld}
                label={count(summary.trainingsHeld, 'instruire ținută', 'instruiri ținute')}
                detail={`${roCount(summary.rows, 'rând', 'rânduri')} de pe fișe, transcrise de pe fișa pe hârtie. Rândurile cu aceeași zi, același instructor și același fel de instruire devin o singură instruire, cu toți participanții ei.`}
              />
            )}
            {ssmPsi.length > 0 && (
              <Line
                icon={<BadgeCheck className="size-4" />}
                count={summary.tests.ssm + summary.tests.psi}
                label={count(
                  summary.tests.ssm + summary.tests.psi,
                  'test la angajare verificat pe fișă',
                  'teste la angajare verificate pe fișă'
                )}
                detail={`${ssmPsi.join(' și ')}. Examinatorul e cel care a semnat pe fișă la verificarea cunoștințelor.`}
              />
            )}
            {summary.files > 0 && (
              <Line
                icon={<FileImage className="size-4" />}
                count={summary.files}
                label={count(summary.files, 'fotografie', 'fotografii')}
                detail={`La fișierele fiecărui angajat, lângă instruirile transcrise din ele.${summary.filesLeft > 0 ? ` ${photosLabel(summary.filesLeft)} ${summary.filesLeft === 1 ? 'rămâne' : 'rămân'} deoparte.` : ''}`}
              />
            )}
          </Group>
          <Group title="Nu se cere nimic din nou">
            <Line
              icon={<PenOff className="size-4" />}
              label="Nicio cerere de semnare"
              detail="Rândurile de pe fișe sunt semnate pe hârtie. Pe fișa individuală din aplicație apar cu mențiunea «semnat pe hârtie»."
            />
            <Line
              icon={<RotateCcw className="size-4" />}
              label="Nicio instruire și niciun test de refăcut"
              detail="Testul la angajare verificat pe fișă nu li se mai cere. Următoarea instruire periodică și testul anual PSI se socotesc de la datele de pe fișe."
            />
          </Group>
          {(summary.noContact.length > 0 ||
            summary.untested.length > 0 ||
            summary.noCommute.length > 0 ||
            summary.unusual.length > 0) && (
            <Group title="Rămân pentru tine, după creare">
              {summary.noContact.length > 0 && (
                <Line
                  warn
                  icon={<TriangleAlert className="size-4" />}
                  count={summary.noContact.length}
                  label={count(
                    summary.noContact.length,
                    'angajat fără email sau telefon',
                    'angajați fără email sau telefon'
                  )}
                  detail="Fișele nu le au. Le adaugi când îi inviți în portal."
                />
              )}
              {summary.untested.length > 0 && (
                <Line
                  warn
                  icon={<TriangleAlert className="size-4" />}
                  count={summary.untested.length}
                  label={count(
                    summary.untested.length,
                    'test la angajare neverificat pe fișă',
                    'teste la angajare neverificate pe fișă'
                  )}
                  detail={`${join(summary.untested.map(({ person, domain }) => `${nameOf(person)} (${trainingDomainLabels[domain]})`))}: pe fișă nu se vede testul verificat. Poți înregistra rezultatul pe pagina angajatului.`}
                />
              )}
              {summary.noCommute.length > 0 && (
                <Line
                  warn
                  icon={<TriangleAlert className="size-4" />}
                  count={summary.noCommute.length}
                  label={count(
                    summary.noCommute.length,
                    'angajat fără traseul de deplasare',
                    'angajați fără traseul de deplasare'
                  )}
                  detail={`${join(summary.noCommute.map(nameOf))}. Fișa individuală îl cere; îl completezi din datele angajatului.`}
                />
              )}
              {summary.unusual.length > 0 && (
                <Line
                  warn
                  icon={<TriangleAlert className="size-4" />}
                  count={summary.unusual.length}
                  label={count(
                    summary.unusual.length,
                    'valoare neobișnuită, preluată cum ai lăsat-o',
                    'valori neobișnuite, preluate cum le-ai lăsat'
                  )}
                  detail={`La ${join([...new Set(summary.unusual.map(({ person }) => nameOf(person)))])}. Le poți corecta pe pagina fiecăruia.`}
                />
              )}
            </Group>
          )}
          <p className="border-t pt-4 text-sm">
            Fișele pe hârtie rămân originalul semnat. Se păstrează la client, la locul de muncă,
            până la încetarea contractului fiecăruia.
          </p>
          {error && (
            <Notice variant="destructive" data-testid="employee-confirm-error">
              {error}
            </Notice>
          )}
          {issues.length > 0 && (
            <Notice
              variant="destructive"
              title="Nu am putut crea angajații"
              data-testid="employee-confirm-error"
            >
              <ul
                className="my-1 grid list-disc gap-0.5 pl-5"
                data-testid="employee-confirm-issues"
              >
                {issues.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              Deschide persoanele, corectează și încearcă din nou.
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button variant="outline" disabled={sending} onClick={onClose}>
            Înapoi la verificare
          </Button>
          <Button
            data-testid="employee-confirm-submit"
            disabled={sending || writtenCount === 0}
            onClick={() => void confirm()}
          >
            {sending ? 'Se creează…' : createLabel(newCount, left.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
