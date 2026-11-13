import { afterEach, describe, expect, it } from 'vitest';

import {
  maskPersonalPatterns,
  maskReplayInput,
  maskReplayText,
  replayMask,
  replayShape,
  replayShow,
  shapeOf,
} from './replay-masking';

afterEach(() => {
  document.body.replaceChildren();
});

function mount(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const markerName = (marker: Record<string, string>) => Object.keys(marker)[0]!;

describe('the shape of an address', () => {
  it.each([
    ['Str. Mihai Eminescu nr. 12, ap. 3', 'Str. Xxxxx Xxxxxxxx nr. 00, ap. 0'],
    ['Bl. A4, sc. B, et. 2', 'Bl. X0, sc. X, et. 0'],
    ['B-dul Ștefan cel Mare 7', 'B-dul Xxxxxx xxx Xxxx 0'],
    ['Jud. Iași, Mun. Iași, Sector 3', 'Jud. Xxxx, Mun. Xxxx, Sector 0'],
    ['Județul Brașov, oraș Râșnov', 'Județul Xxxxxx, oraș Xxxxxx'],
    ['sat Valea Lungă, com. Ciorogârla', 'sat Xxxxx Xxxxx, com. Xxxxxxxxxx'],
    [
      'Șos. Pantelimon, Calea Victoriei, Aleea Teilor, Cart. Tineretului',
      'Șos. Xxxxxxxxxx, Calea Xxxxxxxxx, Aleea Xxxxxx, Cart. Xxxxxxxxxxx',
    ],
    ['Domiciliu – autobuz 135 – sediu', 'Xxxxxxxxx – xxxxxxx 000 – xxxxx'],
    ['Popa-Nan', 'Xxxx-Xxx'],
  ])('%s plays as %s', (text, shape) => {
    expect(shapeOf(text)).toBe(shape);
  });

  it('keeps the abbreviations whatever their case', () => {
    expect(shapeOf('STR. NR. BL. SC. ET. AP. BD. BDUL. SOS. JUDET ORAS COMUNA')).toBe(
      'STR. NR. BL. SC. ET. AP. BD. BDUL. SOS. JUDET ORAS COMUNA'
    );
  });
});

describe('numbers and addresses that name a person', () => {
  it.each([
    ['CNP 1850312400123', 'CNP *************'],
    ['6040229123456', '*************'],
    ['ion.pop@gmail.com', '*****************'],
    ['Scrie la maria-ana+ssm@firma.co.uk.', 'Scrie la *************************.'],
    ['0721 234 567', '**** *** ***'],
    ['+40 721 234 567', '*** *** *** ***'],
    ['0721.234.567', '************'],
    ['0040-721-234-567', '****************'],
    ['021 312 3456', '*** *** ****'],
    ['Tel. 0721234567, sună', 'Tel. **********, sună'],
    ['185 0101 123456', '*** **** ******'],
    ['CNP: 185-0101-123456.', 'CNP: ***************.'],
    ['1 850101 123456', '* ****** ******'],
    ['(021) 123 4567', '***** *** ****'],
    ['(0721) 123 456', '****** *** ***'],
    ['021/123.45.67', '*************'],
    ['+40 (0) 721 234 567', '*** *** *** *** ***'],
  ])('%s plays as %s', (text, masked) => {
    expect(maskPersonalPatterns(text)).toBe(masked);
  });

  it.each([
    'CUI 123456',
    'RO12345678',
    '12.03.2024',
    '02.03.2024',
    '0123456789012',
    '18503124001234',
    'Pagina 3 din 12',
    'Total: 1 250 lucrători',
    'J40/123/2020',
    'J40/12345/2020',
    'RO49 AAAA 1B31 0075 9384 0000',
    'RO49AAAA1B31007593840000',
    'Decizia nr. 1234/12.03.2024',
    'Valabil 02.03.2024-07.03.2024',
    'Factura 0212 3456 7890 1',
    '4111 1111 1111 1111',
    'Aviz nr. 2024-0001-000123',
  ])('leaves %s as it is', (text) => {
    expect(maskPersonalPatterns(text)).toBe(text);
  });
});

describe('text in a replay', () => {
  it('shows the app and the organization, and masks what sits inside the mask marker', () => {
    const host = mount(`
      <p id="label">Post de lucru</p>
      <p id="position">Sudor</p>
      <div ${markerName(replayMask)}><span id="name">Ion Popescu</span></div>
    `);

    expect(maskReplayText('Post de lucru', host.querySelector('#label'))).toBe('Post de lucru');
    expect(maskReplayText('Sudor', host.querySelector('#position'))).toBe('Sudor');
    expect(maskReplayText('Ion Popescu', host.querySelector('#name'))).toBe('*** *******');
  });

  it('keeps only the shape of an address', () => {
    const host = mount(`<dd ${markerName(replayShape)}><span>Str. Lungă nr. 4</span></dd>`);

    expect(maskReplayText('Str. Lungă nr. 4', host.querySelector('span'))).toBe('Str. Xxxxx nr. 0');
  });

  it('masks a CNP or a phone number that shows without a marker', () => {
    const host = mount('<p>Lucrătorul 1850312400123, tel. 0721 234 567</p>');

    expect(
      maskReplayText('Lucrătorul 1850312400123, tel. 0721 234 567', host.querySelector('p'))
    ).toBe('Lucrătorul *************, tel. **** *** ***');
  });

  it('masks the page title, which names the open record', () => {
    const title = document.createElement('title');
    document.head.append(title);

    expect(maskReplayText('Ion Popescu — SSM Ușor', title)).toBe('*** ******* * *** ****');
    title.remove();
  });

  it('masks text in a shadow root, where the support chat lives', () => {
    const host = mount('<div></div>');
    const shadow = host.attachShadow({ mode: 'open' });
    const message = document.createElement('p');
    shadow.append(message);

    expect(maskReplayText('Bună ziua', message)).toBe('**** ****');
  });
});

describe('fields in a replay', () => {
  it('masks a field without a marker', () => {
    const host = mount('<input id="search" type="search" />');

    expect(maskReplayInput('Popescu', host.querySelector('input'))).toBe('*******');
  });

  it("shows a field with the organization's data, but not a CNP typed into it", () => {
    const host = mount(`
      <div ${markerName(replayShow)}><input id="client" /></div>
    `);
    const field = host.querySelector('input');

    expect(maskReplayInput('Brutăria Popescu SRL', field)).toBe('Brutăria Popescu SRL');
    expect(maskReplayInput('1850312400123', field)).toBe('*************');
  });

  it('keeps the shape of an address field', () => {
    const host = mount(`<textarea ${markerName(replayShape)}></textarea>`);

    expect(
      maskReplayInput('Str. Mihai Eminescu nr. 12, ap. 3', host.querySelector('textarea'))
    ).toBe('Str. Xxxxx Xxxxxxxx nr. 00, ap. 0');
  });

  it('masks a field inside the mask marker even when it is marked to show', () => {
    const host = mount(`
      <div ${markerName(replayMask)}><input ${markerName(replayShow)} /></div>
    `);

    expect(maskReplayInput('Ion', host.querySelector('input'))).toBe('***');
  });

  it.each([
    `<input type="password" ${markerName(replayShow)} />`,
    `<input type="text" data-rr-is-password="true" ${markerName(replayShow)} />`,
    `<input type="text" autocomplete="current-password" ${markerName(replayShow)} />`,
  ])('always masks a password: %s', (html) => {
    const host = mount(html);

    expect(maskReplayInput('parola123', host.querySelector('input'))).toBe('*********');
  });

  it('masks a value it cannot place', () => {
    expect(maskReplayInput('Ion')).toBe('***');
  });
});
