import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveFile } from './save-file';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saveFile', () => {
  it('keeps the file available after the click, and releases it a minute later', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:saved', revokeObjectURL: revoke })
    );
    const clicked: { href: string; download: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
    });

    saveFile(new Blob(['x']), 'Copertă – Deciziile interne.docx');

    expect(clicked).toEqual([
      { href: 'blob:saved', download: 'Copertă – Deciziile interne.docx', attached: true },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(59_000);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revoke).toHaveBeenCalledWith('blob:saved');
  });
});
