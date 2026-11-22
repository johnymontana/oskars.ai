// Shared property-value rendering for the side panels: null/undefined show as
// an em dash, everything else as JSON.
export const formatValue = (value: unknown) => (value === null || value === undefined ? "—" : JSON.stringify(value))
