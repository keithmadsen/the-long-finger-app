import type { FastifyError, FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@tlf/contracts';

// Transport-level status → uniform error code. Domain 404s (e.g. PATCH on a
// missing id) are decided by the handlers in later stories; this plugin owns
// only the envelope SHAPE, not domain decisions.
function codeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    default:
      return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR';
  }
}

// Installs the single error/not-found handler that emits the uniform
// errorEnvelope `{ error: { code, message, details? } }` on every non-2xx
// (AR-5). The validation-400 branch is wired-but-dormant until Story 1.7
// supplies a body to validate. 5xx bodies never leak the raw error message or
// a stack trace — the real error is logged via pino, not returned.
//
// Called directly on the root app (not via app.register) so the handlers cover
// every route on the instance, including those registered after this call.
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Never trust an error's statusCode blindly: a buggy throw can carry a
    // non-error status (e.g. 200) or an out-of-range value, which would
    // otherwise be echoed back as the response status. Only accept a valid
    // HTTP error status (4xx/5xx); anything else falls back to 500.
    const rawStatus = error.validation ? 400 : (error.statusCode ?? 500);
    const statusCode =
      Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

    const code = codeForStatus(statusCode);
    const message = statusCode >= 500 ? 'Internal Server Error' : (error.message || code);

    if (statusCode >= 500) {
      // Log the real error server-side; never expose it in the response body.
      request.log.error(error);
    } else {
      // Recoverable 4xx log at warn (Story 3.5 AC 4, the committed level
      // table). Only safe fields: NEVER `error.validation` (it can embed the
      // submitted value — the envelope may carry details to the client, but
      // the log must not) and never the request body.
      request.log.warn({ statusCode, code }, message);
    }

    const envelope: ErrorEnvelope = {
      error: {
        code,
        message,
        ...(error.validation ? { details: error.validation } : {}),
      },
    };

    reply.status(statusCode).send(envelope);
  });

  app.setNotFoundHandler((request, reply) => {
    const message = `Route ${request.method}:${request.url} not found`;

    // Same warn-level "recoverable" signal as the error handler's 4xx branch
    // (Story 3.5 AC 4). Method/url only — never payload content.
    request.log.warn({ statusCode: 404, code: 'NOT_FOUND' }, message);

    const envelope: ErrorEnvelope = {
      error: {
        code: 'NOT_FOUND',
        message,
      },
    };

    reply.status(404).send(envelope);
  });
}
