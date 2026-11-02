import type { InstructionDomain } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import type { ImportDetail } from '@/api/generated/api';

import { ImportLoader, ProcessingView } from './import-processing-page';
import { ConfirmedImportHub } from './library/confirmed-hub';
import { LibraryTaskPage } from './library/library-task-page';
import { ReviewHub } from './review-hub';
import type { SectionId } from './review-model';
import { ReviewSectionPage } from './review-section-page';

const hasLibraryTasks = (detail: ImportDetail) =>
  detail.status === 'confirmed' && detail.libraryParts.length > 0;

export function ImportPage({ importId }: { importId: string }) {
  return (
    <ImportLoader importId={importId}>
      {(detail) =>
        detail.status === 'ready' && detail.proposal ? (
          <ReviewHub key={detail.id} detail={detail} />
        ) : hasLibraryTasks(detail) ? (
          <ConfirmedImportHub key={detail.id} detail={detail} />
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
          {(detail.status === 'ready' || hasLibraryTasks(detail)) && (
            <Button asChild variant="ghost" size="sm" className="w-fit">
              <Link to="/clienti/import/$importId" params={{ importId }}>
                <ArrowLeft aria-hidden="true" />
                {detail.status === 'ready' ? 'Înapoi la propunere' : 'Înapoi la import'}
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

export function ImportLibraryPage({
  importId,
  domain,
}: {
  importId: string;
  domain: InstructionDomain;
}) {
  return (
    <ImportLoader importId={importId}>
      {(detail) =>
        (detail.status === 'ready' && detail.proposal) || detail.status === 'confirmed' ? (
          <LibraryTaskPage key={`${detail.id}-${domain}`} detail={detail} domain={domain} />
        ) : (
          <ProcessingView detail={detail} />
        )
      }
    </ImportLoader>
  );
}
