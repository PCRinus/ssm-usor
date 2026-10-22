import { type KnowledgeTest, type TrainingDomain, trainingDomains } from '@ssm-usor/contracts';

import type { PortalTestsResponse } from '@/api/generated/api';

export type AwaitingTest = { domain: TrainingDomain; test: KnowledgeTest; inProgress: boolean };

export function awaitingTestsOf(tests: PortalTestsResponse): AwaitingTest[] {
  return trainingDomains.flatMap((domain) => {
    const { status, inProgress } = tests[domain];
    if (!status.awaitingTest) return [];
    return [
      {
        domain,
        test: status.awaitingTest,
        inProgress: inProgress?.test === status.awaitingTest,
      },
    ];
  });
}
