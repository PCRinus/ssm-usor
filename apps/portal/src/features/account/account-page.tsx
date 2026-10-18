import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { cardClass, Page, PageGrid, PageHeader } from '@/components/page';
import { useAuth } from '@/features/auth/auth-context';
import { ParticipantLanguageSwitch } from '@/features/language/language-switch';
import { useParticipations } from '@/features/participation/participation-context';
import { SignOutButton } from '@/features/participation/sign-out-button';
import { AgreementSection } from '@/features/signing/agreement-section';
import { formatSignInAddress } from '@/lib/format';
import { participationKindMessages } from '@/lib/labels';

export function AccountPage() {
  const { t, i18n } = useLingui();
  const { session } = useAuth();
  const { participations, participation } = useParticipations();
  if (!participation) return null;

  return (
    <Page testId="account-page">
      <PageHeader
        title={t`Contul meu`}
        description={t`Adresa cu care intri în portal și clientul pe care îl vezi.`}
      />
      <PageGrid>
        <div className="grid gap-4 lg:col-span-7">
          <dl className={`${cardClass} divide-y px-4 sm:px-5`}>
            <Row label={t`Intri cu`}>
              <span data-testid="account-address" className="wrap-anywhere">
                {session ? formatSignInAddress(session.user) : ''}
              </span>
            </Row>
            <Row
              label={t`Clientul`}
              action={
                participations.length > 1 && (
                  <Link
                    to="/alege"
                    data-testid="account-switch"
                    className="inline-flex min-h-11 items-center px-2 text-sm font-medium underline underline-offset-4"
                  >
                    <Trans>Schimbă clientul</Trans>
                  </Link>
                )
              }
            >
              <span data-testid="account-client">{participation.clientName}</span>
              <span className="block text-sm text-muted-foreground">
                {i18n._(participationKindMessages[participation.kind])}
              </span>
            </Row>
            <Row label={t`Prestator SSM`}>
              <span data-testid="account-provider">{participation.organizationName}</span>
            </Row>
            <div data-testid="account-language" className="flex items-center gap-3 py-2">
              <dt className="flex-1 text-sm text-muted-foreground">
                <Trans>Limba</Trans>
              </dt>
              <dd>
                <ParticipantLanguageSwitch participation={participation} />
              </dd>
            </div>
          </dl>
          <AgreementSection participation={participation} />
          <Link
            to="/informare"
            data-testid="account-privacy-notice"
            className={`${cardClass} flex min-h-14 items-center gap-3 px-4 font-medium transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:px-5`}
          >
            <ShieldCheck aria-hidden="true" className="size-5 text-muted-foreground" />
            <span className="flex-1">
              <Trans>Cum folosim datele tale</Trans>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
          </Link>
          <SignOutButton className="sm:w-60" />
        </div>
      </PageGrid>
    </Page>
  );
}

function Row({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd>{children}</dd>
      </div>
      {action}
    </div>
  );
}
