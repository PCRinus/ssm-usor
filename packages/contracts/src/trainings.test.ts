import { describe, expect, it } from 'vitest';

import { trainingRequestSchema } from './trainings';

const request = {
  domain: 'ssm',
  phase: 'periodic',
  heldOn: '2022-04-11',
  trainer: { name: null, jobTitle: null },
  employeeIds: ['5f0c5e0e-2b9a-4c4e-9f53-0d6a1f4d2b11'],
};

describe('trainingRequestSchema', () => {
  it('takes a training from paper without the trainer, material or duration its sheet lacks', () => {
    const parsed = trainingRequestSchema.safeParse({ ...request, source: 'paper' });

    expect(parsed.success).toBe(true);
  });

  it('refuses a training held in the app without any of them', () => {
    const parsed = trainingRequestSchema.safeParse({ ...request, source: 'app' });

    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'durationMinutes',
      'material',
      'trainer.name',
      'trainer.jobTitle',
    ]);
  });
});
