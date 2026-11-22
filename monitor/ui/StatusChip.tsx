// Status chip: a gbuild node status rendered in the theme's status color
// language. The color comes from theme.css via the `data-status` attribute,
// so any status string works and the six known statuses get their colors.
import type { ReactNode } from "react"

export function StatusChip({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className="status-chip" data-status={status}>
      {children ?? status}
    </span>
  )
}
