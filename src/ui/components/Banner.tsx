import { notice, persistent } from '../state'

const NOT_PERSISTENT = "Progress won't be saved on this device."

/**
 * Storage messages. A load notice shows until dismissed; after that (or when a later save fails)
 * a permanent one-line warning remains while storage is not persisting.
 */
export function Banner() {
  const message = notice.value
  if (message !== null) {
    return (
      <div class="banner" role="status">
        <span class="banner__mark" aria-hidden="true" />
        <p class="banner__text">{message}</p>
        <button type="button" class="btn btn--quiet banner__dismiss" onClick={() => (notice.value = null)}>
          Dismiss
        </button>
      </div>
    )
  }
  if (!persistent.value) {
    return (
      <div class="banner" role="status">
        <span class="banner__mark" aria-hidden="true" />
        <p class="banner__text">{NOT_PERSISTENT}</p>
      </div>
    )
  }
  return null
}
