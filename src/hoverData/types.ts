// ---------------------------------------------------------------------------
// Shared type definition for the hover documentation database
// ---------------------------------------------------------------------------

export interface HoverEntry {
    /** Short one-line summary shown as header. */
    summary: string;
    /** Full markdown body (optional). */
    detail?: string;
}
