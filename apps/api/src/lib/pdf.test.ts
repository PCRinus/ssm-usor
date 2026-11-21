import type { Context } from 'hono';
import PizZip from 'pizzip';
import { describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from './env';
import { createPdfConverter, isPdf } from './pdf';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('a PDF by its first bytes', () => {
  it('starts with the %PDF- signature', () => {
    expect(isPdf(bytes('%PDF-1.7\n'))).toBe(true);
    expect(isPdf(bytes('%PDF-'))).toBe(true);
  });

  it('is not anything shorter or anything else', () => {
    expect(isPdf(bytes(''))).toBe(false);
    expect(isPdf(bytes('%PDF'))).toBe(false);
    expect(isPdf(bytes('PK\u0003\u0004'))).toBe(false);
    expect(isPdf(bytes(' %PDF-1.7'))).toBe(false);
  });
});

describe('the files a conversion sends', () => {
  const styles =
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>' +
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="ContentsLabels1"><w:name w:val="Contents labels 1"/>' +
    '<w:basedOn w:val="TOC1"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="1596"/></w:tabs>' +
    '<w:ind w:left="1596" w:hanging="1596"/></w:pPr></w:style></w:styles>';
  const body =
    '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr>' +
    '<w:sdtContent><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
    '</w:sdtContent></w:sdt>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capitolul I. Prevederi generale</w:t></w:r></w:p>';
  const docx = (withStyles: string) => {
    const zip = new PizZip();
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
    );
    zip.file('word/styles.xml', withStyles);
    return zip.generate({ type: 'uint8array' });
  };
  const documentOf = (file: Uint8Array) => new PizZip(file).file('word/document.xml')!.asText();
  const labelled = docx(styles);
  const plain = docx(styles.replace(/<w:style[^>]*ContentsLabels1[\s\S]*?<\/w:style>/, ''));

  const sentByBinding = async () => {
    const sent: ArrayBuffer[][] = [];
    const answer = async (files: ArrayBuffer[]) => {
      sent.push(files);
      return bytes('%PDF-1.7').buffer;
    };
    const env = {
      PDF_CONVERSION: 'service',
      PDF: {
        convertDocx: (file: ArrayBuffer) => answer([file]),
        convertDocuments: answer,
      },
    };
    const converter = createPdfConverter({ env } as unknown as Context<ApiEnv>)!;
    await converter.convertDocx(labelled);
    await converter.convertDocuments([labelled, plain]);
    return sent.map((files) => files.map((file) => new Uint8Array(file)));
  };

  it('prints a contents with a label column with page references, through the binding', async () => {
    const [one, both] = await sentByBinding();
    const [single] = one!;
    const [first, annex] = both!;
    for (const file of [single!, first!]) {
      const document = documentOf(file);
      expect(document).not.toContain('Table of Contents');
      expect(document).toMatch(/PAGEREF _Toc\d+ \\h/);
      expect(document).toContain(
        '<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Capitolul I.</w:t>'
      );
    }
    expect(annex).toEqual(plain);
  });

  it('sends the same files to a converter reached by URL', async () => {
    const sent: Uint8Array[][] = [];
    const fetch = vi.fn(async (_url: URL, init: RequestInit) => {
      const form = init.body as FormData;
      sent.push(
        await Promise.all(
          form
            .getAll('files')
            .map(async (file) => new Uint8Array(await (file as Blob).arrayBuffer()))
        )
      );
      return new Response(bytes('%PDF-1.7'));
    });
    vi.stubGlobal('fetch', fetch);
    try {
      const env = { GOTENBERG_URL: 'http://converter' };
      const converter = createPdfConverter({ env } as unknown as Context<ApiEnv>)!;
      await converter.convertDocuments([labelled, plain]);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sent[0]![1]).toEqual(plain);
    expect(documentOf(sent[0]![0]!)).toMatch(/PAGEREF _Toc\d+ \\h/);
  });

  it('leaves a file without a label column as it is', async () => {
    const [, both] = await sentByBinding();
    const annex = both![1];
    expect(documentOf(annex!)).toContain('Table of Contents');
  });
});
