// Pure hash-route helpers (no window access) so they can be unit tested in node.

export type Route = 'today' | 'session' | 'library' | 'progress' | 'settings' | 'placement'

export const ROUTES: readonly Route[] = ['today', 'session', 'library', 'progress', 'settings', 'placement']

const isRoute = (p: string): p is Route => (ROUTES as readonly string[]).includes(p)

/** '#/today' -> 'today'. */
export function parseHash(hash: string): string {
  return hash.replace(/^#\/?/, '').replace(/\/+$/, '')
}

/** Until placement is done every path resolves to 'placement'; afterwards unknown paths go to 'today'. */
export function resolveRoute(path: string, placed: boolean): Route {
  if (!placed) return 'placement'
  return isRoute(path) ? path : 'today'
}
