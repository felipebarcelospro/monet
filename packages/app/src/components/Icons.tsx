import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CircleDot,
  FileText,
  Inbox,
  PenLine,
  SquareKanban,
  UserRound,
} from 'lucide-react'

/** The icon and colour of each known note type. */
const TYPES: Record<string, { icon: LucideIcon; tone: Tone }> = {
  note: { icon: FileText, tone: 'neutral' },
  inbox: { icon: Inbox, tone: 'blue' },
  project: { icon: SquareKanban, tone: 'amber' },
  area: { icon: CircleDot, tone: 'violet' },
  person: { icon: UserRound, tone: 'rose' },
  meeting: { icon: CalendarDays, tone: 'blue' },
  daily: { icon: Calendar, tone: 'green' },
  resource: { icon: BookOpen, tone: 'teal' },
  essay: { icon: PenLine, tone: 'red' },
}

/** The colour families a chip can use. */
export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'rose' | 'teal' | 'neutral'

/** The icon of a type, with a sensible fallback. */
export function typeIcon(type: string | undefined): LucideIcon {
  if (!type) return FileText
  return TYPES[type]?.icon ?? FileText
}

/** The colour of a type. */
export function typeTone(type: string | undefined): Tone {
  if (!type) return 'neutral'
  return TYPES[type]?.tone ?? 'neutral'
}

/** The colour of a status. */
export function statusTone(status: string | undefined): Tone {
  switch (status) {
    case 'active':
      return 'green'
    case 'inbox':
      return 'blue'
    case 'done':
      return 'neutral'
    case 'archived':
      return 'amber'
    case 'someday':
      return 'violet'
    default:
      return 'neutral'
  }
}

/** The CSS custom property of a tone. */
export function toneColor(tone: Tone): string {
  return tone === 'neutral' ? 'var(--ink-3)' : `var(--${tone})`
}
