import { Trans, useLingui } from '@lingui/react/macro';
import { cn } from '@ssm-usor/ui/lib/utils';

const commitSha = import.meta.env.VITE_COMMIT_SHA ?? 'local';

export function CommitVersion({ className }: { className?: string }) {
  const { t } = useLingui();
  const shortCommitSha = commitSha.slice(0, 7);

  return (
    <span
      data-testid="commit-version"
      className={cn('text-xs text-muted-foreground', className)}
      title={`Commit ${commitSha}`}
      aria-label={t`Versiunea portalului: commit ${commitSha}`}
    >
      <Trans>
        Versiune <code aria-hidden="true">{shortCommitSha}</code>
      </Trans>
    </span>
  );
}
