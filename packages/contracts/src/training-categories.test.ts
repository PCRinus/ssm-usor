import { describe, expect, it } from 'vitest';

import { postsAfterImport, staffCategoriesWithPosts } from './training-categories';

const cook = {
  id: 'b1c2d3e4-0000-4000-8000-000000000001',
  name: 'Bucătar',
  staffCategory: 'execution',
} as const;

describe('the posts a client holds after an import', () => {
  it("keeps a post's category when an imported one of the same name says another", () => {
    const posts = postsAfterImport(
      [cook],
      [{ name: ' bucătar ', staffCategory: 'technical_administrative' }]
    );
    expect(posts).toEqual([{ name: 'Bucătar', staffCategory: 'execution' }]);
    expect(staffCategoriesWithPosts(posts)).toEqual(['execution']);
  });

  it('takes the imported category only where the member matched the post and replaced it', () => {
    const imported = { name: 'Șef bucătar', staffCategory: 'technical_administrative' } as const;
    expect(
      postsAfterImport([cook], [{ ...imported, existingId: cook.id, replacesCategory: true }])
    ).toEqual([{ name: 'Bucătar', staffCategory: 'technical_administrative' }]);
    expect(postsAfterImport([cook], [{ ...imported, existingId: cook.id }])).toEqual([
      { name: 'Bucătar', staffCategory: 'execution' },
    ]);
    expect(postsAfterImport([cook], [{ ...imported, replacesCategory: true }])).toEqual([
      { name: 'Bucătar', staffCategory: 'execution' },
      imported,
    ]);
  });

  it('adds a post of no category as execution personnel, and a second of its name to the first', () => {
    expect(
      postsAfterImport(
        [],
        [
          { name: 'Ajutor', staffCategory: null },
          { name: 'ajutor', staffCategory: 'technical_administrative' },
        ]
      )
    ).toEqual([{ name: 'Ajutor', staffCategory: 'execution' }]);
  });
});
