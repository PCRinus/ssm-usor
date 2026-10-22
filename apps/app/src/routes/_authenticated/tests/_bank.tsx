import { createFileRoute } from '@tanstack/react-router';

import { TestBankLayout } from '@/features/knowledge-tests/test-bank-layout';

export const Route = createFileRoute('/_authenticated/tests/_bank')({
  component: TestBankLayout,
});
