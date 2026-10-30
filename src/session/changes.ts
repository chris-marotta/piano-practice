// What moved during a session, for the Done screen. Pure.
import { parseId, parseKeyId, stateFor, type Settings } from '../srs/items'
import type { ItemState } from '../srs/scheduler'
import { formatScale } from '../theory/format'
import { keyLabel } from '../theory/keyNames'
import type { RecallType } from '../theory/recall'

export interface Change {
  id: string
  /** 'E major', 'E major chords', 'E major key signature card'. */
  name: string
  direction: 'up' | 'down'
  /** 'box 3 → 4' or 'support L1 → L2'. */
  what: string
  /** 'E major ↑ box 3 → 4'. */
  text: string
}

const RECALL_NAME: Record<RecallType, string> = {
  keysig: 'key signature card',
  spell: 'spelling card',
  relative: 'relative key card',
  thumb: 'thumb notes card',
}

function itemName(id: string): string {
  const pc = parseKeyId(id)
  if (pc !== null) return `Key ${keyLabel(pc)}`
  const p = parseId(id)
  const scale = formatScale(p.ref)
  if (p.kind === 'scale') return scale
  if (p.kind === 'chords') return `${scale} chords`
  return `${scale} ${RECALL_NAME[p.recallType as RecallType]}`
}

function change(id: string, name: string, kind: 'box' | 'support', from: number, to: number): Change {
  const direction = to > from ? 'up' : 'down'
  const what = kind === 'box' ? `box ${from} → ${to}` : `support L${from} → L${to}`
  return { id, name, direction, what, text: `${name} ${direction === 'up' ? '↑' : '↓'} ${what}` }
}

const KIND_ORDER = { scale: 0, chords: 1, recall: 2, key: 3 } as const

const kindOf = (id: string): keyof typeof KIND_ORDER => (parseKeyId(id) !== null ? 'key' : parseId(id).kind)

/**
 * Box and support moves for the session's items: scales first, then chord sets, then recall
 * cards, then key names (what matters most leads), session order within each. An item with no
 * state before the session counts as new (box 1, L0); one with no state after is skipped.
 */
export function sessionChanges(
  itemIds: string[],
  before: Record<string, ItemState>,
  after: Record<string, ItemState>,
  today: string,
  settings: Settings,
): Change[] {
  const out: Change[] = []
  const ordered = [...new Set(itemIds)].sort((a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)])
  for (const id of ordered) {
    const now = after[id]
    if (!now) continue
    const was = stateFor(id, before, today, settings)
    const name = itemName(id)
    if (now.box !== was.box) out.push(change(id, name, 'box', was.box, now.box))
    if (now.support !== was.support) out.push(change(id, name, 'support', was.support, now.support))
  }
  return out
}
