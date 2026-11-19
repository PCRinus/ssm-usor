import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Notice } from '@ssm-usor/ui/components/notice';

import { HelpLink } from '@/components/help-link';

import type { LookupState } from './use-company-lookup';

export function CompanyLookupStatus({
  lookup,
  testId,
  inactiveHelp,
}: {
  lookup: LookupState;
  testId: string;
  inactiveHelp?: HelpTopic;
}) {
  if (lookup.status === 'done') {
    return (
      <Notice
        variant={lookup.inactive ? 'warning' : 'success'}
        data-testid={testId}
        className="sm:col-span-2"
      >
        {lookup.message}
        {lookup.inactive && inactiveHelp && (
          <>
            {' '}
            <HelpLink topic={inactiveHelp}>Află mai mult</HelpLink>
          </>
        )}
      </Notice>
    );
  }
  if (lookup.status === 'error') {
    return (
      <Notice variant="warning" role="alert" data-testid={testId} className="sm:col-span-2">
        {lookup.message}
      </Notice>
    );
  }
  return null;
}
