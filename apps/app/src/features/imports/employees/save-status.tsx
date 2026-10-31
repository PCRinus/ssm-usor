import { Button } from '@ssm-usor/ui/components/button';

import { Notice } from '@/components/notice';

import type { EmployeeReview } from './use-employee-review';

export function SaveStatus({ review }: { review: EmployeeReview }) {
  if (review.conflict) {
    return (
      <Notice
        variant="destructive"
        data-testid="employee-review-conflict"
        action={
          <Button variant="outline" size="sm" onClick={() => void review.reload()}>
            Reîncarcă
          </Button>
        }
      >
        Altcineva a modificat importul între timp, așa că ultima ta schimbare nu a fost salvată.
        Reîncarcă și fă-o din nou.
      </Notice>
    );
  }
  if (review.error) {
    return (
      <Notice
        variant="destructive"
        data-testid="employee-review-save-error"
        action={
          <Button variant="outline" size="sm" onClick={review.retry}>
            Salvează din nou
          </Button>
        }
      >
        {review.error}
      </Notice>
    );
  }
  return (
    <p className="sr-only" role="status" data-testid="employee-review-saving">
      {review.saving ? 'Se salvează…' : ''}
    </p>
  );
}
