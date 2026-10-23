import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';

import { commitSha, releaseTag } from './build-version';

export function CommitVersion({
  className,
  linked = false,
}: {
  className?: string;
  linked?: boolean;
}) {
  const tag = releaseTag();
  const version = tag ?? commitSha.slice(0, 7);
  const props = {
    'data-testid': 'commit-version',
    className: cn('text-xs text-muted-foreground', className),
    title: `Commit ${commitSha}`,
    'aria-label': `Versiunea aplicației: ${version}, commit ${commitSha}`,
  };
  const text = (
    <>
      Versiune <code aria-hidden="true">{version}</code>
    </>
  );

  if (linked && tag) {
    return (
      <Link
        to="/actualizari/$tag"
        params={{ tag }}
        {...props}
        className={cn(props.className, 'underline-offset-4 hover:text-foreground hover:underline')}
      >
        {text}
      </Link>
    );
  }
  return <span {...props}>{text}</span>;
}
