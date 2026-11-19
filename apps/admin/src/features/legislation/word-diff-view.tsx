import { type DiffSegment, wordDiff } from '@ssm-usor/document-engine/token-diff';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Fragment } from 'react';

// Past this many cells the table outgrows a tab's patience; an article is a few hundred words.
const maxCells = 4_000_000;

const deletedClass =
  'rounded-xs bg-red-100 text-red-900 line-through decoration-red-700/70 dark:bg-red-950 dark:text-red-200';
const insertedClass =
  'rounded-xs bg-emerald-100 text-emerald-950 no-underline font-medium dark:bg-emerald-950 dark:text-emerald-100';

const edges = /^(\s*)([\s\S]*?)(\s*)$/;

// A margin, not a space, keeps a replaced word off its replacement: the law's text gains no
// character.
function followsRemoved(parts: DiffSegment[], index: number) {
  const previous = parts[index - 1];
  return (
    previous?.kind === 'deleted' && !/\s$/.test(previous.text) && !/^\s/.test(parts[index]!.text)
  );
}

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
  const parts = wordDiff(before, after, { maxCells });
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
      {parts.map((part, index) => {
        if (part.kind === 'same') return <span key={index}>{part.text}</span>;
        const [, opening, words, closing] = edges.exec(part.text)!;
        // Struck spacing would lay out a break the new text no longer has.
        if (!words) return part.kind === 'inserted' ? <span key={index}>{part.text}</span> : null;
        return (
          <Fragment key={index}>
            {opening}
            {part.kind === 'deleted' ? (
              <del className={deletedClass}>
                <span className="sr-only">Removed: </span>
                {words}
              </del>
            ) : (
              <ins className={cn(insertedClass, followsRemoved(parts, index) && 'ml-1')}>
                <span className="sr-only">Added: </span>
                {words}
              </ins>
            )}
            {closing}
          </Fragment>
        );
      })}
    </p>
  );
}
