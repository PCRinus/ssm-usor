import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { Notice } from '@/components/notice';

export function OffersPlanNotice({
  children,
  testId = 'offers-plan-notice',
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Notice
      variant="info"
      data-testid={testId}
      title="Ofertele fac parte din planul Profesional"
      action={
        <Button asChild variant="outline" size="sm" className="bg-card">
          <Link to="/organizatie/abonament" data-testid="offers-plan-subscription">
            Vezi abonamentul
          </Link>
        </Button>
      }
    >
      {children}
    </Notice>
  );
}
