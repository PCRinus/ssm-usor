import { cn } from '@ssm-usor/ui/lib/utils';

import { wordDiff } from './word-diff';

const deletedClass =
  'rounded-xs bg-red-100 text-red-900 line-through decoration-red-700/70 dark:bg-red-950 dark:text-red-200';
const insertedClass =
  'rounded-xs bg-emerald-100 text-emerald-950 no-underline font-medium dark:bg-emerald-950 dark:text-emerald-100';

export function WordDiff({
  before,
  after,
  className,
  testId,
}: {
  before: string | null;
  after: string | null;
  className?: string;
  testId?: string;
}) {
  const text = cn('text-sm leading-relaxed whitespace-pre-line break-words', className);
  if (before === null && after === null) {
    return <p className={cn(text, 'text-muted-foreground')}>Neither form has this unit.</p>;
  }
  if (before === null || after === null) {
    const only = (before ?? after)!;
    return (
      <p data-testid={testId} className={text}>
        {before === null ? (
          <ins className={insertedClass}>{only}</ins>
        ) : (
          <del className={deletedClass}>{only}</del>
        )}
      </p>
    );
  }
  const parts = wordDiff(before, after);
  if (!parts) {
    return (
      <div data-testid={testId} className="space-y-2">
        <p className={text}>
          <del className={deletedClass}>{before}</del>
        </p>
        <p className={text}>
          <ins className={insertedClass}>{after}</ins>
        </p>
      </div>
    );
  }
  return (
    <p data-testid={testId} className={text}>
      {parts.map((part, index) =>
        part.kind === 'same' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index}>
            {part.deleted && (
              <del className={deletedClass}>
                <span className="sr-only">Removed: </span>
                {part.deleted}
              </del>
            )}
            {part.deleted && part.inserted && ' '}
            {part.inserted && (
              <ins className={insertedClass}>
                <span className="sr-only">Added: </span>
                {part.inserted}
              </ins>
            )}
          </span>
        )
      )}
    </p>
  );
}
