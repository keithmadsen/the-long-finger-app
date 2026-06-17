import { Type, type Static } from '@sinclair/typebox';

// The one and only error shape (AR-5). It is both defined here and consumed in
// Story 1.2 by the setErrorHandler plugin and the OpenAPI responses; later
// mutation endpoints inherit the same envelope.
//
// `$id: 'ErrorEnvelope'` lets @fastify/swagger register a stable, reusable
// component.
export const errorEnvelope = Type.Object(
  {
    error: Type.Object({
      code: Type.String(),
      message: Type.String(),
      details: Type.Optional(Type.Unknown()),
    }),
  },
  { $id: 'ErrorEnvelope' },
);

export type ErrorEnvelope = Static<typeof errorEnvelope>;
