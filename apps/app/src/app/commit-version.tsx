import { cn } from '@ssm-usor/ui/lib/utils';

const commitSha = import.meta.env.VITE_COMMIT_SHA ?? 'local';

export function CommitVersion({ className }: { className?: string }) {
  const shortCommitSha = commitSha.slice(0, 7);

  return (
    <span
      data-testid="commit-version"
      className={cn('text-xs text-muted-foreground', className)}
      title={`Commit ${commitSha}`}
      aria-label={`Versiunea aplicației: commit ${commitSha}`}
    >
      Versiune <code aria-hidden="true">{shortCommitSha}</code>
    </span>
  );
}
