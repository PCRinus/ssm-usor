import { useRouteContext } from '@tanstack/react-router';

import { getGetEvaluationProfileQueryKey, useGetEvaluationProfile } from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';
import { measureCountLabel } from '@/features/risk-evaluations/factor-list';

import { factorsLabel, type RiskSheet } from './risks-model';

function Item({
  tone,
  title,
  children,
}: {
  tone: 'added' | 'removed' | 'changed';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className="grid gap-1 rounded-md border bg-card px-3 py-2"
      data-testid="risk-difference"
      data-kind={tone}
    >
      <span
        className={
          tone === 'added'
            ? 'text-xs font-semibold text-success-foreground'
            : tone === 'removed'
              ? 'text-xs font-semibold text-destructive'
              : 'text-xs font-semibold text-muted-foreground'
        }
      >
        {title}
      </span>
      {children}
    </li>
  );
}

const classes = (gravity: number | null, probability: number | null) =>
  `gravitate ${gravity ?? '–'}, probabilitate ${probability ?? '–'}`;

export function RiskDifferences({ sheet }: { sheet: RiskSheet }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const match = sheet.match!;
  const changed = match.pairs.filter((pair) => pair.otherClasses || pair.otherMeasures);
  const library = useGetEvaluationProfile(match.evaluationId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEvaluationProfileQueryKey(match.evaluationId), session?.user.id],
      enabled: match.onlyInLibrary.length > 0 || changed.length > 0,
    },
  });
  const packFactor = new Map(sheet.factors.map((factor) => [factor.key, factor]));
  const libraryFactor = new Map(
    (library.data?.profile.factors ?? []).map((factor) => [factor.id, factor])
  );
  const loading = library.isPending ? 'Se încarcă…' : '';

  if (match.onlyInPack.length === 0 && match.onlyInLibrary.length === 0 && changed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="risk-differences">
        Aceiași factori, cu aceleași clase și măsuri; diferă doar scrierea descrierilor.
      </p>
    );
  }

  return (
    <div className="grid gap-2" data-testid="risk-differences">
      <p className="text-[13px] text-muted-foreground">
        Față de „{match.name}”:{' '}
        {[
          match.onlyInPack.length > 0 && `${factorsLabel(match.onlyInPack.length)} doar în pachet`,
          match.onlyInLibrary.length > 0 &&
            `${factorsLabel(match.onlyInLibrary.length)} doar în evaluarea ta`,
          changed.length > 0 && `${factorsLabel(changed.length)} cu alte clase sau măsuri`,
        ]
          .filter(Boolean)
          .join(', ')}
        .
      </p>
      <ul className="grid gap-2">
        {match.onlyInPack.map((key) => (
          <Item key={key} tone="added" title="Doar în pachet">
            <p className="text-sm leading-relaxed">{packFactor.get(key)?.description}</p>
          </Item>
        ))}
        {match.onlyInLibrary.map((id) => (
          <Item key={id} tone="removed" title="Doar în evaluarea ta">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {libraryFactor.get(id)?.description ?? loading}
            </p>
          </Item>
        ))}
        {changed.map((pair) => {
          const pack = packFactor.get(pair.factor);
          const mine = libraryFactor.get(pair.libraryFactor);
          return (
            <Item key={pair.factor} tone="changed" title="Cu alte clase sau măsuri">
              <p className="text-sm leading-relaxed">{pack?.description}</p>
              {pair.otherClasses && (
                <p className="text-[13px] text-muted-foreground">
                  În pachet: {classes(pack?.gravityClass ?? null, pack?.probabilityClass ?? null)}
                  {mine
                    ? `; la tine: ${classes(mine.gravityClass, mine.probabilityClass)}`
                    : loading && `; ${loading}`}
                  .
                </p>
              )}
              {pair.otherMeasures && (
                <p className="text-[13px] text-muted-foreground">
                  Alte măsuri: {measureCountLabel(pack?.measures.length ?? 0).toLowerCase()} în
                  pachet
                  {mine ? `, ${measureCountLabel(mine.measures.length).toLowerCase()} la tine` : ''}
                  .
                </p>
              )}
            </Item>
          );
        })}
      </ul>
    </div>
  );
}
