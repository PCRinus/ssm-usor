import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { type ErrorComponentProps, Link, useLocation } from '@tanstack/react-router';
import {
  CircleAlert,
  Compass,
  LayoutDashboard,
  type LucideIcon,
  MessageSquareWarning,
  RotateCw,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { ApiHttpError } from '@/api/http';
import { EmptyState } from '@/components/empty-state';
import { isCodeFileError, openReloadDialog } from '@/features/reload-prompts/reload-dialog-store';

import { appVersion } from './build-version';
import { useShellReportProblem } from './report-problem-context';
import { ReportProblemDialog } from './report-problem-dialog';

const timeFormat = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'long', timeStyle: 'short' });

function ProblemCard({
  icon,
  title,
  description,
  actions,
  meta,
  testId,
  alert = false,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  meta?: ReactNode;
  testId: string;
  alert?: boolean;
}) {
  return (
    <Card
      data-testid={testId}
      role={alert ? 'alert' : undefined}
      className="items-center gap-0 px-5 py-14 sm:px-6 sm:py-20"
    >
      <EmptyState icon={icon} title={title} titleAs="h1" actions={actions} className="w-full">
        {description}
      </EmptyState>
      {meta && <p className="mt-8 text-xs text-muted-foreground">{meta}</p>}
    </Card>
  );
}

function StandalonePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center border-b bg-card px-4 sm:px-6">
        <a href="/" aria-label="SSM Ușor — pagina principală">
          <img
            src="/brand/logo.png"
            alt="SSM Ușor"
            width={2172}
            height={724}
            className="h-auto w-28 sm:w-36"
          />
        </a>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-8 sm:py-10 lg:px-10">
        {children}
      </main>
    </div>
  );
}

function errorDescription(error: unknown, explainForbidden: boolean) {
  if (error instanceof ApiHttpError && error.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  if (explainForbidden && error instanceof ApiHttpError && error.status === 403) {
    return 'Contul tău nu face parte dintr-o organizație. Contactează adminul.';
  }
  return 'Cel mai des e o întrerupere scurtă a conexiunii. Verifică internetul și reîncarcă pagina. Dacă problema continuă, raportează-ne-o.';
}

export function RouteError({
  error,
  title = 'Pagina nu a putut fi încărcată',
  testId = 'route-error-page',
  retryTestId = 'route-error-reload',
  explainForbidden = false,
}: Partial<ErrorComponentProps> & {
  title?: string;
  testId?: string;
  retryTestId?: string;
  explainForbidden?: boolean;
}) {
  const shellReport = useShellReportProblem();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [failedAt] = useState(() => new Date());
  const [reportingByEmail, setReportingByEmail] = useState<string | null>(null);
  const version = appVersion();
  const time = timeFormat.format(failedAt);
  const note = `Menționează în mesaj pagina ${pathname}, versiunea ${version} și ora ${time}.`;

  useEffect(() => {
    if (isCodeFileError(error)) openReloadDialog('code_file');
  }, [error]);

  const card = (
    <ProblemCard
      icon={CircleAlert}
      title={title}
      description={errorDescription(error, explainForbidden)}
      testId={testId}
      alert
      actions={
        <>
          <Button size="lg" data-testid={retryTestId} onClick={() => window.location.reload()}>
            <RotateCw aria-hidden="true" />
            Reîncarcă
          </Button>
          <Button
            size="lg"
            variant="outline"
            data-testid="route-error-report"
            onClick={() => void (shellReport ? shellReport(note) : setReportingByEmail(note))}
          >
            <MessageSquareWarning aria-hidden="true" />
            Raportează problema
          </Button>
        </>
      }
      meta={
        <span data-testid="route-error-details">
          Versiune {version}, {time}
        </span>
      }
    />
  );

  if (shellReport) return card;
  return (
    <StandalonePage>
      {card}
      <ReportProblemDialog
        open={reportingByEmail !== null}
        note={reportingByEmail ?? undefined}
        chatTried={false}
        onClose={() => setReportingByEmail(null)}
      />
    </StandalonePage>
  );
}

export function NotFound({
  title = 'Pagina nu a fost găsită',
  description,
  action,
  testId = 'not-found-page',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
}) {
  const inShell = useShellReportProblem() !== null;
  useEffect(() => {
    document.title = 'Pagina nu a fost găsită — SSM Ușor';
  }, []);

  const card = (
    <ProblemCard
      icon={Compass}
      title={title}
      description={
        description ??
        (inShell
          ? 'Adresa nu există sau pagina a fost mutată. Verifică linkul sau pornește de la Dashboard.'
          : 'Adresa nu există sau pagina a fost mutată. Verifică linkul sau pornește de la început.')
      }
      testId={testId}
      actions={
        action ??
        (inShell ? (
          <Button size="lg" asChild>
            <Link to="/dashboard">
              <LayoutDashboard aria-hidden="true" />
              Mergi la Dashboard
            </Link>
          </Button>
        ) : (
          <Button size="lg" asChild>
            <a href="/">Înapoi la început</a>
          </Button>
        ))
      }
    />
  );

  return inShell ? card : <StandalonePage>{card}</StandalonePage>;
}

export function PageNotFound() {
  return <NotFound />;
}
