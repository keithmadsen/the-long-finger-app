import { QueryClient } from '@tanstack/react-query'

/*
 * The app-wide TanStack Query client (server-state library per architecture.md
 * Frontend Architecture — verified v5). One singleton owns the cache the whole
 * app shares; every read/mutation keys off it.
 *
 * Defaults that matter here:
 *  - refetchOnWindowFocus: true — there is no server push (NG-5), so refocusing
 *    a backgrounded tab is when we reconcile multi-tab staleness.
 *  - retry: 1 — one quiet retry before a transient blip surfaces as isError and
 *    the load-failed state (AC 6). Tests construct their OWN client with
 *    retry: false so negative paths fail fast and deterministically.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  })
}

// App-wide singleton. main.tsx feeds this to <QueryClientProvider>; tests never
// import it — they build a throwaway client (retry: false) per render.
export const queryClient = createQueryClient()
