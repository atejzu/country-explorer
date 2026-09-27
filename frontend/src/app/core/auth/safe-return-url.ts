/** Keep the original query/fragment, but reject ambiguous or external URL syntax. */
export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(decoded) || /\s/u.test(value)) return '/';
    // Encoded path separators (including nested encodings) are unnecessary for app routes.
    if (/%(?:25|2f|5c)/i.test(value.split(/[?#]/u)[0])) return '/';
    const path = decoded.split(/[?#;]/u)[0].replace(/\/+$/u, '');
    // Returning to an auth form would cause the anonymous-only guard to loop.
    if (path === '/login' || path === '/register') return '/';
    return value;
  } catch { return '/'; }
}
