import { countOf } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';

import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import { formatRoDate } from '@/lib/dates';

import { legalChangeAnchor, openChangeSentence, portalPage } from './legislation-labels';
import { actState, actStateLabels, type WatchedAct } from './watched-act-list';

export function ActName({ act }: { act: WatchedAct }) {
  return (
    <>
      {act.portalId ? (
        <a
          href={portalPage(act.portalId)}
          target="_blank"
          rel="noreferrer"
          data-testid="watched-act-name"
          className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          {act.name}
          <ExternalLink
            className="size-3.5 text-muted-foreground"
            aria-label="(se deschide pe Portalul Legislativ)"
          />
        </a>
      ) : (
        <span data-testid="watched-act-name" className="font-medium">
          {act.name}
        </span>
      )}
      {act.subject && (
        <CellNote data-testid="watched-act-subject" className="line-clamp-2" title={act.subject}>
          {act.subject}
        </CellNote>
      )}
    </>
  );
}

export function ActStatus({ act }: { act: WatchedAct }) {
  const state = actState(act);
  if (state === 'open') {
    const sentence = act.openChange && openChangeSentence(act.openChange.outcome);
    return (
      <>
        <Badge
          data-testid="watched-act-status"
          variant="secondary"
          className="border-warning-border bg-warning text-warning-foreground"
        >
          {actStateLabels.open}
        </Badge>
        {sentence && act.openChange && (
          <CellNote>
            <Link
              to="/legislatie/modificari"
              hash={legalChangeAnchor(act.openChange.id)}
              data-testid="watched-act-change"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {sentence}
            </Link>
          </CellNote>
        )}
      </>
    );
  }
  if (state === 'repealed') {
    return (
      <Badge data-testid="watched-act-status" variant="destructive">
        {actStateLabels.repealed}
      </Badge>
    );
  }
  return <span data-testid="watched-act-status">{actStateLabels[state]}</span>;
}

export function ConsolidatedForm({ act }: { act: WatchedAct }) {
  const read = act.portalStatus !== null;
  return (
    <>
      <span className="tabular-nums">
        {act.lastConsolidatedOn ? (
          formatRoDate(act.lastConsolidatedOn)
        ) : read ? (
          'Forma de bază'
        ) : (
          <CellEmpty />
        )}
      </span>
      {act.openChange && (
        <CellNote data-testid="watched-act-verified" className="tabular-nums">
          documentele:{' '}
          {act.verifiedConsolidatedOn ? formatRoDate(act.verifiedConsolidatedOn) : 'forma de bază'}
        </CellNote>
      )}
    </>
  );
}

export function CitedIn({ act }: { act: WatchedAct }) {
  const { documents, quotes } = act.citedIn;
  if (documents === 0) return <CellEmpty />;
  return (
    <>
      <span className="tabular-nums">{countOf(documents, 'document', 'documente')}</span>
      <CellNote className="tabular-nums">
        {quotes > 0 ? countOf(quotes, 'preluare', 'preluări') : 'doar trimiteri'}
      </CellNote>
    </>
  );
}
