import { describe, expect, it } from 'vitest';

import { hex, sha256 } from './hash';

describe('a SHA-256 digest', () => {
  it('is the same lowercase hex for text and for its UTF-8 bytes', async () => {
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await sha256('abc')).toBe(abc);
    expect(await sha256(new TextEncoder().encode('abc'))).toBe(abc);
    expect(await sha256('ă')).toBe(await sha256(new Uint8Array([0xc4, 0x83])));
  });

  it('reads only the bytes a view shows', async () => {
    const whole = new TextEncoder().encode('xxabcxx');
    expect(await sha256(whole.subarray(2, 5))).toBe(await sha256('abc'));
  });
});

describe('hex', () => {
  it('writes two lowercase digits a byte', () => {
    expect(hex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
    expect(hex(new Uint8Array())).toBe('');
  });
});
