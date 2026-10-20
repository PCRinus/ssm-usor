import { createFileRoute } from '@tanstack/react-router';

import { TestPage } from '@/features/tests/test-page';

export const Route = createFileRoute('/_participant/_portal/instruiri/test/$domain/$test')({
  component: TestRoute,
});

function TestRoute() {
  const { domain, test } = Route.useParams();
  return <TestPage domain={domain} test={test} />;
}
