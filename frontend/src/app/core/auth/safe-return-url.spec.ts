import { safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  it.each(['/account', '/countries/SVN', '/?region=Europe', '/countries/SVN?foo=bar#section', '/?search=New%20Zealand'])
    ('preserves the full safe local URL %s', url => expect(safeReturnUrl(url)).toBe(url));
  it.each([null, undefined, '', 'account', 'https://evil.example', 'http://evil.example', '//evil.example',
    'javascript:alert(1)', 'data:text/html,evil', '/\\evil.example', '\\evil.example', '/%5cevil.example',
    '/%2fevil.example', '/%252fevil.example', '/\nevil.example', '/%0aevil.example', '/%ZZ',
    '/login?returnUrl=/account', '/register', '/login;mode=1'])
    ('falls back to home for unsafe, missing or looping URL %s', url => expect(safeReturnUrl(url)).toBe('/'));
});
