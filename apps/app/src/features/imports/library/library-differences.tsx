import { countOf, type InstructionBlock } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

import { getGetInstructionModuleQueryKey, useGetInstructionModule } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

import type { ProposedInstruction } from './library-model';

type Difference = NonNullable<ProposedInstruction['match']>['differences'][number];

const articleTexts = (blocks: readonly InstructionBlock[]) =>
  blocks.flatMap((block) => (block.kind === 'article' ? [block.paragraphs.join(' ')] : []));

function ChangedWords({ words }: { words: Extract<Difference, { kind: 'changed' }>['words'] }) {
  return (
    <p className="text-sm leading-relaxed">
      {words.map((word, index) => (
        <span key={index}>
          {index > 0 && ' '}
          {word.change === 'same' ? (
            word.text
          ) : (
            <mark
              className={cn(
                'rounded-xs px-0.5 text-inherit',
                word.change === 'added'
                  ? 'bg-success-border font-semibold'
                  : 'bg-destructive-border line-through'
              )}
            >
              <span className="sr-only">
                {word.change === 'added' ? 'Adăugat în pachet: ' : 'Doar la tine: '}
              </span>
              {word.text}
            </mark>
          )}
        </span>
      ))}
    </p>
  );
}

export function LibraryDifferences({ instruction }: { instruction: ProposedInstruction }) {
  const { request, key } = useApi();
  const match = instruction.match!;
  const removed = match.differences.some((difference) => difference.kind === 'removed');
  const library = useGetInstructionModule(match.moduleId, {
    request,
    query: {
      queryKey: key(getGetInstructionModuleQueryKey(match.moduleId)),
      enabled: removed,
    },
  });
  const packArticles = articleTexts(instruction.body.blocks);
  const libraryArticles = library.data ? articleTexts(library.data.body.blocks) : [];
  const counts = {
    added: match.differences.filter((difference) => difference.kind === 'added').length,
    removed: match.differences.filter((difference) => difference.kind === 'removed').length,
    changed: match.differences.filter((difference) => difference.kind === 'changed').length,
  };

  if (match.differences.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="library-differences">
        Articolele sunt aceleași; diferă doar spațiile, literele mari sau punctuația.
      </p>
    );
  }

  return (
    <div className="grid gap-2" data-testid="library-differences">
      <p className="text-[13px] text-muted-foreground">
        Față de „{match.title}”:{' '}
        {[
          counts.added > 0 &&
            `${countOf(counts.added, 'articol adăugat', 'articole adăugate')} în pachet`,
          counts.removed > 0 &&
            `${countOf(counts.removed, 'articol care lipsește', 'articole care lipsesc')} din pachet`,
          counts.changed > 0 && countOf(counts.changed, 'articol schimbat', 'articole schimbate'),
        ]
          .filter(Boolean)
          .join(', ')}
        .
      </p>
      <ol className="grid gap-2">
        {match.differences.map((difference, index) => (
          <li
            key={index}
            className="grid gap-1 rounded-md border bg-card px-3 py-2"
            data-testid="library-difference"
            data-kind={difference.kind}
          >
            {difference.kind === 'added' && (
              <>
                <span className="text-xs font-semibold text-success-foreground">
                  Art. {difference.article} din pachet, nou
                </span>
                <p className="text-sm leading-relaxed">
                  {packArticles[difference.article - 1] ?? ''}
                </p>
              </>
            )}
            {difference.kind === 'removed' && (
              <>
                <span className="text-xs font-semibold text-destructive">
                  Art. {difference.libraryArticle} din biblioteca ta, lipsește din pachet
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground line-through">
                  {library.isPending
                    ? 'Se încarcă…'
                    : (libraryArticles[difference.libraryArticle - 1] ?? '')}
                </p>
              </>
            )}
            {difference.kind === 'changed' && (
              <>
                <span className="text-xs font-semibold text-muted-foreground">
                  Art. {difference.article} din pachet, Art. {difference.libraryArticle} la tine
                </span>
                <ChangedWords words={difference.words} />
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
