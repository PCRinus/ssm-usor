import { createFileRoute } from '@tanstack/react-router';

import { ChoosePlanPage } from '@/features/subscription/checkout/choose-plan-page';
import { choosePlanSearch } from '@/features/subscription/checkout/choose-plan-search';

export const Route = createFileRoute('/_authenticated/organization/subscription/choose')({
  staticData: { title: 'Alege planul', fullPage: true },
  validateSearch: choosePlanSearch,
  component: ChoosePlanRoute,
});

function ChoosePlanRoute() {
  return <ChoosePlanPage search={Route.useSearch()} />;
}
