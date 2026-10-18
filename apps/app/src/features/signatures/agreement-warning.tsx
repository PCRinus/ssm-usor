import type { SigningAgreementState } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { TriangleAlert } from 'lucide-react';

import { agreementSigned } from './signature-format';

// ADR 023: an unsigned agreement warns and never blocks a signature.
export function AgreementWarning({ state }: { state: SigningAgreementState | null }) {
  if (agreementSigned(state)) return null;
  return (
    <Badge
      variant="outline"
      data-testid="agreement-warning"
      title="Angajatul nu a semnat actul adițional de semnare electronică."
      className="border-warning-border bg-warning text-warning-foreground"
    >
      <TriangleAlert aria-hidden="true" />
      Act adițional nesemnat
    </Badge>
  );
}
