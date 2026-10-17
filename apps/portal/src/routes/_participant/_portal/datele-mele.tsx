import { createFileRoute } from '@tanstack/react-router';

import { MyDataPage } from '@/features/my-data/my-data-page';

export const Route = createFileRoute('/_participant/_portal/datele-mele')({
  component: MyDataPage,
});
