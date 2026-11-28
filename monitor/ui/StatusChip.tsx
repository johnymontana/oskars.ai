// Status chip: a gbuild node status rendered in the theme's status color
// language. The color comes from theme.css via the `data-status` attribute,
// so any status string works and the six known statuses get their colors.
import type { ReactNode } from "react"

const LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  frontier: "Ready",
  blocked: "Waiting on dependencies",
  failed: "Failed",
  pending: "Pending",
  cancelled: "Cancelled",
}

export const statusLabel = (status: string) => LABELS[status] ?? status

export function StatusChip({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className="status-chip" data-status={status}>
      {children ?? statusLabel(status)}
    </span>
  )
}
