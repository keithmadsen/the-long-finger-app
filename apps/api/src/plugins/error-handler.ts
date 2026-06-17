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
    const statusCode = error.validation ? 400 : (error.statusCode ?? 500);

    if (statusCode >= 500) {
      // Log the real error server-side; never expose it in the response body.
      request.log.error(error);
    }

    const code = codeForStatus(statusCode);
    const message = statusCode >= 500 ? 'Internal Server Error' : (error.message || code);

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
    const envelope: ErrorEnvelope = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method}:${request.url} not found`,
      },
    };

    reply.status(404).send(envelope);
  });
}
