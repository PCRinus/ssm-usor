import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

import { PageHeader } from '@/components/page';

import { useParticipation } from './participation-context';
import { PrivacyNoticeText } from './privacy-notice';

export function PrivacyNoticePage() {
  const participation = useParticipation();
  return (
    <main data-testid="privacy-notice-page">
      <Link
        to="/contul-meu"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 pt-4 text-sm font-medium"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Contul meu
      </Link>
      <PageHeader title="Cum folosim datele tale" />
      <PrivacyNoticeText participation={participation} />
    </main>
  );
}
