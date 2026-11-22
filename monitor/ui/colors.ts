// Theme-token colors for graph elements. The canvas renderer cannot resolve
// CSS custom properties, so colors are read from the theme tokens at render
// time. The fallbacks mirror theme.css and are only used where the stylesheet
// is not loaded (e.g. jsdom tests).
export const resolveToken = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export const FALLBACK_COLORS: Record<string, string> = {
  completed: "#4caf7d",
  in_progress: "#e2a336",
  frontier: "#5b9dff",
  blocked: "#8b94a3",
  failed: "#e5534b",
  cancelled: "#5a6270",
}

export const statusColor = (status: string) =>
  resolveToken(`--status-${status.replaceAll("_", "-")}`) || FALLBACK_COLORS[status] || FALLBACK_COLORS.blocked!
