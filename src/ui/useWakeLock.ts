import { useEffect } from 'preact/hooks'

interface Sentinel {
  readonly released: boolean
  release(): Promise<void>
}
type WakeLockNav = Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }

/**
 * Keep the screen on while the calling component is mounted (a practice session: hands are on
 * the keys, not the screen). The browser drops the lock whenever the page is hidden, so it is
 * re-acquired when the page is visible again. Feature-detected; every failure is silent.
 */
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNav).wakeLock
    if (!wakeLock) return
    let sentinel: Sentinel | null = null
    let mounted = true
    let requesting = false

    const acquire = async (): Promise<void> => {
      if (requesting || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      requesting = true
      try {
        const s = await wakeLock.request('screen')
        if (mounted) sentinel = s
        else void s.release().catch(() => {})
      } catch {
        // Refused (low battery, no permission) or unsupported: the screen just follows auto-lock.
      } finally {
        requesting = false
      }
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [])
}
