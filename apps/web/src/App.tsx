import { useEffect, useState } from 'react'
import type { Todo } from '@tlf/contracts'

// Walking-skeleton App: do exactly one thing — fetch GET /todos on mount and
// render the (empty) result. This proves the full round-trip
// (browser → Vite proxy → Fastify → repository → SQLite → back), AC 4.
//
// A plain fetch is correct here. TanStack Query, hooks, primitives, and
// recipes are Stories 1.4–1.7 — deliberately absent. (Design tokens land in
// Story 1.3 via styles/global.css, imported in main.tsx.)
//
// No user-facing heading element is rendered: v1 has no heading hierarchy
// (the list is the only content) — see ux-design-specification.md.
function App() {
  // Typed from the shared contract to prove the cross-app import compiles
  // (Story 1.2, AC 1). Rendering stays skeleton-thin — the list UI is Story 1.6.
  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/todos')
      .then((res) => {
        if (!res.ok) throw new Error(`GET /todos failed: ${res.status}`)
        return res.json()
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) {
          throw new Error('GET /todos returned an invalid response shape')
        }
        setTodos(data)
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoaded(true))
  }, [])

  return (
    <main>
      {!loaded && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {loaded && !error && todos.length === 0 && <p>No tasks yet.</p>}
      {todos.length > 0 && (
        <ul>
          {todos.map((_, index) => (
            <li key={index}>task</li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
