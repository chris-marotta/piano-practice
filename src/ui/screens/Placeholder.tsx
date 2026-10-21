/** Temporary screen body until the real screen lands in a later task. */
export function Placeholder({ title }: { title: string }) {
  return (
    <section class="screen">
      <h1 class="screen__title">{title}</h1>
      <p class="muted">Coming in a later build step.</p>
    </section>
  )
}
