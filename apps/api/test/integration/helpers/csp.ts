// Shared CSP assertions for the header tests (Story 3.5 AC 1). The committed
// directive set lives here once so hardening.test.ts (API surface) and
// static-serving.test.ts (static SPA surface) cannot drift apart.

/** Parse a Content-Security-Policy header into { directive: [values] }. */
export function parseCsp(header: string): Record<string, string[]> {
  return Object.fromEntries(
    header
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      }),
  );
}

// The committed directive set (Story 3.5 Dev Notes table): helmet defaults
// tightened — no 'unsafe-inline'/https: in style-src, no https:/data: in
// font-src, no data: in img-src, frame-ancestors 'none' (not 'self'), and
// upgrade-insecure-requests omitted (the container serves plain HTTP; TLS
// termination is upstream).
export const expectedAppCsp: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'"],
  'font-src': ["'self'"],
  'img-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};
