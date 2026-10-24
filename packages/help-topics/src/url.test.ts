import { describe, expect, it } from 'vitest';

import { helpTopics } from './topics';
import { helpTopicUrl } from './url';

describe('helpTopicUrl', () => {
  it('joins the origin, the page and the anchor of every topic', () => {
    for (const [topic, { path, anchor }] of Object.entries(helpTopics)) {
      expect(helpTopicUrl('https://help.ssmusor.ro', topic as keyof typeof helpTopics)).toBe(
        `https://help.ssmusor.ro${path}#${anchor}`
      );
    }
  });
});
