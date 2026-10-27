import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { ImportLoader, ProcessingView } from './import-processing-page';
import { ReviewHub } from './review-hub';
import type { SectionId } from './review-model';
import { ReviewSectionPage } from './review-section-page';

export function ImportPage({ importId }: { importId: string }) {
  return (
    <ImportLoader importId={importId}>
      {(detail) =>
        detail.status === 'ready' && detail.proposal ? (
          <ReviewHub key={detail.id} detail={detail} />
        ) : (
          <ProcessingView detail={detail} />
        )
      }
    </ImportLoader>
  );
}

export function ImportFilesPage({ importId }: { importId: string }) {
  return (
    <ImportLoader importId={importId}>
      {(detail) => (
        <div className="grid gap-4">
          {detail.status === 'ready' && (
            <Button asChild variant="ghost" size="sm" className="w-fit">
              <Link to="/clients/import/$importId" params={{ importId }}>
                <ArrowLeft aria-hidden="true" />
                Înapoi la propunere
              </Link>
            </Button>
          )}
          <ProcessingView detail={detail} />
        </div>
      )}
    </ImportLoader>
  );
}

export function ImportSectionPage({ importId, section }: { importId: string; section: SectionId }) {
  return (
    <ImportLoader importId={importId}>
      {(detail) =>
        detail.status === 'ready' && detail.proposal ? (
          <ReviewSectionPage key={detail.id} detail={detail} section={section} />
        ) : (
          <ProcessingView detail={detail} />
        )
      }
    </ImportLoader>
  );
}
