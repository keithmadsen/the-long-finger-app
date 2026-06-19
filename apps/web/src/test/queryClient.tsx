import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

/*
 * Test-only TanStack Query plumbing. Every render/hook that touches the query is
 * wrapped in a FRESH client per call with retry: false, so negative paths fail
 * fast and deterministically and no cache leaks across tests (story Task 7).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

export function renderWithClient(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient(),
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  return { client, ...render(ui, { wrapper: Wrapper }) }
}
