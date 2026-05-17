// ---------------------------------------------------------------------------
// hoverData.ts — re-export barrel
//
// The hover database has been split into focused sub-modules under
// src/hoverData/ for better maintainability:
//
//   types.ts        — HoverEntry interface
//   operators.ts    — Communication/subscription operators, broadcast targets, variables
//   commands.ts     — Pre-definition sections and built-in commands
//   controlFlow.ts  — State prefixes, control flow, range/string operators, conditional jump
//   systemStates.ts — CSM built-in system states
//   db.ts           — Combines all entries into the HOVER_DB record
//   lookup.ts       — Lookup helpers, anchor cache, provideContentHover, buildHover
// ---------------------------------------------------------------------------

export type { HoverEntry } from './hoverData/types';
export { buildHover, provideContentHover, clearAnchorCache } from './hoverData/lookup';
