import { describe, expect, it } from 'vitest';

import { inPathOrder } from './path-order';

describe('the order files are shown in', () => {
  it('reads an uploaded numbered folder 1.2 before 1.10, whatever order the server sends', () => {
    const sent = [
      'Fișe/Fișa 2.1.jpg',
      'Fișe 2/Fișa 1.jpg',
      'Fișe/Fișa 1.10.jpg',
      'Fișe/fișa 10.1.jpg',
      'Fișe/Fișa 1.2.jpg',
    ].map((uploadPath, at) => ({ id: `f${at}`, uploadPath }));

    expect(inPathOrder(sent).map((file) => file.uploadPath)).toEqual([
      'Fișe/Fișa 1.2.jpg',
      'Fișe/Fișa 1.10.jpg',
      'Fișe/Fișa 2.1.jpg',
      'Fișe/fișa 10.1.jpg',
      'Fișe 2/Fișa 1.jpg',
    ]);
    expect(sent[0]!.uploadPath).toBe('Fișe/Fișa 2.1.jpg');
  });
});
