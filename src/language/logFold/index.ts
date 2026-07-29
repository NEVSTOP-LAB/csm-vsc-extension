// ---------------------------------------------------------------------------
// src/language/logFold/index.ts — 日志折叠模块入口
// ---------------------------------------------------------------------------

export { LineSignature, FoldRegion, RepeatPattern, FoldOptions, DEFAULT_FOLD_OPTIONS } from './types';
export { normalizeLine } from './normalizer';
export { detectRepeatRegions } from './detector';
export { CSMLogFoldingRangeProvider } from './foldingProvider';
export {
    createDecorationTypes,
    disposeDecorationTypes,
    applyDecorations,
    clearDecorations,
    DecorationTypes,
} from './decorations';
