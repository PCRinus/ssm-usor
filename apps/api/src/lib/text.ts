export const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

// What a file system accepts; the dash of a cover's title becomes a plain hyphen.
export const fileNameOf = (title: string) =>
  title
    .replace(/[–—]/g, '-')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
