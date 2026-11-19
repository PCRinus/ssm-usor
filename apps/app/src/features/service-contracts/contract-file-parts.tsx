import type { ReactNode } from 'react';

import type { ServiceContractResponse } from '@/api/generated/api';
import { Masked } from '@/components/replay';
import { formatRoDate } from '@/lib/dates';

export function FileTile({
  testId,
  icon,
  title,
  badge,
  meta,
  placeholder = false,
  children,
}: {
  testId: string;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  meta: string;
  /** The place where a file is expected, before there is one. */
  placeholder?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-3 pl-4 ${
        placeholder ? 'border-dashed' : 'bg-background'
      }`}
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5 ${
          placeholder ? 'text-muted-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <span className={placeholder ? 'text-muted-foreground' : 'font-medium'}>{title}</span>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{meta}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// Where the issued revision stands, in the order things happen to it.
export function ContractTrail({
  issuedAt,
  lastSend,
  signed,
  received,
}: {
  issuedAt: string;
  lastSend: ServiceContractResponse['lastSend'];
  signed: boolean;
  /** When a copy came through the return link and waits to be confirmed. */
  received: string | null;
}) {
  const steps = [
    {
      label: 'Emis',
      done: true,
      detail: `pe ${formatRoDate(issuedAt.slice(0, 10))}`,
    },
    {
      label: 'Trimis',
      done: lastSend !== null,
      testId: 'contract-sent',
      detail: lastSend ? (
        <span data-testid="contract-last-send">
          Revizia {lastSend.revision} a fost trimisă la <Masked>{lastSend.sentTo}</Masked> pe{' '}
          {formatRoDate(lastSend.sentAt.slice(0, 10))}.
        </span>
      ) : (
        'prin email, cu PDF-ul atașat'
      ),
    },
    {
      label: 'Semnat',
      done: signed,
      testId: 'contract-signed',
      detail: signed
        ? 'exemplarul semnat este atașat'
        : received
          ? `exemplar primit pe ${formatRoDate(received.slice(0, 10))}, de confirmat`
          : 'când se întoarce exemplarul semnat',
    },
  ];
  const next = steps.findIndex((step) => !step.done);
  // Side by side, the dots sit at the start, the middle and the end of one track, and the
  // track is coloured as far as the last step reached. Stacked, each step draws the piece of
  // track down to the next one.
  const reached = ['sm:w-0', 'sm:w-1/2', 'sm:w-full'][steps.filter((step) => step.done).length - 1];
  const align = ['', 'sm:text-center', 'sm:text-right'];
  const place = ['', 'sm:mx-auto', 'sm:ml-auto'];

  return (
    <ol data-testid="contract-trail" className="relative grid gap-4 sm:grid-cols-3 sm:gap-0">
      <span
        aria-hidden="true"
        className="absolute top-[5px] right-1.5 left-1.5 hidden h-0.5 rounded-full bg-muted-foreground/35 sm:block"
      />
      <span
        aria-hidden="true"
        className={`absolute top-[5px] left-1.5 hidden h-0.5 rounded-full bg-primary sm:block ${reached}`}
      />
      {steps.map((step, index) => {
        const current = index === next;
        return (
          <li key={step.label} className={`relative flex gap-3 sm:block ${align[index]}`}>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute top-4 -bottom-5 left-[5px] w-0.5 rounded-full sm:hidden ${
                  steps[index + 1]!.done ? 'bg-primary' : 'bg-muted-foreground/35'
                }`}
              />
            )}
            <span className={`relative mt-1 flex size-3 shrink-0 sm:mt-0 ${place[index]}`}>
              {current && (
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 animate-ping rounded-full bg-primary/30 [animation-duration:2.4s] motion-reduce:animate-none"
                />
              )}
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full ${
                  step.done
                    ? 'bg-primary'
                    : current
                      ? 'bg-background ring-2 ring-primary ring-inset'
                      : 'bg-background ring-2 ring-muted-foreground/40 ring-inset'
                }`}
              />
            </span>
            <div className="text-sm sm:mt-2">
              <p
                data-testid={step.done ? step.testId : undefined}
                className={step.done || current ? 'font-medium' : 'text-muted-foreground'}
              >
                {step.label}
              </p>
              <p className="text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
