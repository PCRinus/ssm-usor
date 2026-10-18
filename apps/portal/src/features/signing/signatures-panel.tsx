import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronRight, FileSignature, PenLine } from 'lucide-react';

import { useListPortalClientSignatureRequests } from '@/api/generated/api';
import { cardClass } from '@/components/page';
import {
  isAdministrator,
  type Participation,
} from '@/features/participation/participation-context';
import { useApiRequest } from '@/lib/request';

import { SigningItemText } from './signing-item-text';
import { agreementsSettledFor, useSigningItems } from './signing-items';

const shownItems = 4;

export function SignaturesPanel({ participation }: { participation: Participation }) {
  const { t } = useLingui();
  const { items, ownAgreement, isPending, isError, refetch } = useSigningItems(participation);
  const administrator = isAdministrator(participation);

  if (isPending || isError || items.length === 0) {
    return (
      <section
        aria-labelledby="todo-title"
        data-testid="home-todo"
        className="grid gap-1.5 rounded-xl border border-dashed border-input px-4.5 py-4 sm:gap-2 sm:px-5.5 sm:py-5"
      >
        <h2 id="todo-title" className="text-base font-semibold sm:text-[1.0625rem]">
          <Trans>Semnături</Trans>
        </h2>
        {isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            <Trans>Se verifică…</Trans>
          </p>
        ) : isError ? (
          <p className="text-sm leading-relaxed text-foreground/80 sm:text-[0.9375rem]">
            <Trans>Nu am putut verifica ce ai de semnat.</Trans>{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-4"
              onClick={refetch}
            >
              <Trans>Încearcă din nou</Trans>
            </button>
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-foreground/80 sm:text-[0.9375rem]">
            <Trans>
              Nimic de semnat deocamdată. Când o instruire va avea nevoie de semnătura ta, apare
              aici.
            </Trans>
          </p>
        )}
        {administrator && <ClientPendingLink participantId={participation.participantId} />}
      </section>
    );
  }

  const count = items.length;
  const hidden = count - shownItems;
  const agreementsListed = agreementsSettledFor(
    participation.employeeId,
    ownAgreement,
    items.flatMap((item) => (item.kind === 'agreement' ? [item.employeeId] : []))
  );
  return (
    <section
      aria-labelledby="todo-title"
      data-testid="home-todo"
      className={cn(cardClass, 'grid gap-3.5 border-primary/25 px-4 py-4 sm:px-5 sm:py-5')}
    >
      <div className="flex items-center gap-2.5">
        <h2 id="todo-title" className="text-base font-semibold sm:text-[1.0625rem]">
          <Trans>Semnături</Trans>
        </h2>
        <span
          data-testid="home-todo-count"
          className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-lime px-2 text-[0.8125rem] font-bold text-primary tabular-nums"
        >
          {count}
        </span>
      </div>
      <ul className="-mx-1 grid divide-y" data-testid="home-todo-items">
        {items.slice(0, shownItems).map((item) => (
          <li
            key={item.key}
            data-testid="home-todo-item"
            data-kind={item.kind}
            className="flex gap-3 px-1 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              {item.kind === 'agreement' ? (
                <FileSignature aria-hidden="true" className="size-4" />
              ) : (
                <PenLine aria-hidden="true" className="size-4" />
              )}
            </span>
            <SigningItemText
              item={item}
              ownEmployeeId={participation.employeeId}
              agreementsSigned={agreementsListed}
            />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums" data-testid="home-todo-more">
          +{hidden}
        </p>
      )}
      <Button asChild className="h-12 w-full text-base sm:w-fit sm:px-6">
        <Link to="/semneaza" data-testid="home-sign">
          <PenLine aria-hidden="true" />
          {t`Semnează (${count})`}
        </Link>
      </Button>
      {administrator && <ClientPendingLink participantId={participation.participantId} />}
    </section>
  );
}

function ClientPendingLink({ participantId }: { participantId: string }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const pending = useListPortalClientSignatureRequests(participantId, { request: apiRequest });
  const count = pending.data?.items.length;
  if (count === undefined) return null;
  return (
    <Link
      to="/angajati/semnaturi"
      data-testid="home-client-signatures"
      className="-mx-1 flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex-1">
        {count === 0
          ? t`Angajații nu au nimic de semnat.`
          : t({
              message: plural(count, {
                one: 'O semnătură așteaptă la angajați',
                few: '# semnături așteaptă la angajați',
                other: '# de semnături așteaptă la angajați',
              }),
            })}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
    </Link>
  );
}
