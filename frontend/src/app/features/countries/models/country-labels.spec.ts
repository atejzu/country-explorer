import { displayName, drivingSideLabel, regionLabel } from './country-labels';

describe('Country labels', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('localizes supported currency and language codes', () => {
    expect(displayName('currency', 'EUR', 'Euro')).toBe('evro');
    expect(displayName('language', 'sl', 'Slovenian')).toBe('slovenščina');
  });

  it('falls back to the API name, code or empty text when no display name exists', () => {
    vi.spyOn(Intl.DisplayNames.prototype, 'of').mockReturnValue(undefined);
    expect(displayName('currency', 'XXX', 'API currency')).toBe('API currency');
    expect(displayName('language', 'und', null)).toBe('und');
    expect(displayName('language', null, null)).toBe('');
  });

  it('uses the API name when a code is unsupported', () => {
    expect(displayName('currency', 'invalid-code', 'API currency')).toBe('API currency');
  });

  it('uses the API name when DisplayNames is unavailable', () => {
    // Preserve all other Intl APIs and restore the global after this test.
    vi.stubGlobal('Intl', Object.create(Intl, { DisplayNames: { value: undefined } }));
    expect(displayName('language', 'sl', 'Slovenian')).toBe('Slovenian');
  });

  it.each([
    ['left', 'levo'], ['right', 'desno'], [null, 'Ni podatka'],
    [undefined, 'Ni podatka'], ['unexpected', 'Ni podatka'],
  ])('maps driving side %s explicitly', (side, expected) => {
    expect(drivingSideLabel(side)).toBe(expected);
  });

  it('maps only supported regions', () => {
    expect(regionLabel('Europe')).toBe('Evropa');
    expect(regionLabel('Antarctic')).toBe('Antarktika');
    for (const region of [null, 'unexpected', 'toString']) expect(regionLabel(region)).toBe('Ni podatka');
  });
});
