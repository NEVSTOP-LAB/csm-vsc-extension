// ---------------------------------------------------------------------------
// src/i18n/index.ts — 本地化模块统一入口
//
// 所有本地化基础设施与用户可见文案集中在本目录，便于统一管理：
//   core.ts      — 本地化基础设施（语言检测、{en, zh} bundle 参数替换）
//   messages.ts  — 模块管理（CSM Modules 侧边栏）UI 文案与辅助函数
//   logFold.ts   — CSMLog 日志折叠功能 UI 文案
//   language.ts  — 语言功能 UI 文案（outline 符号名、文件徽章 tooltip）
//
// 注意：根目录曾存在废弃的 src/i18n.ts 单文件 barrel，已删除；
// 此处目录版 `src/i18n/` 是唯一入口。
// ---------------------------------------------------------------------------

export * from './core';
export {
	ModuleManagerMessageKey,
	t,
	getApplyMethodLabel,
	formatRelativeDate,
	getVisibilityLabel,
	getVisibilityTag,
} from './messages';
export { t as tLogFold } from './logFold';
export { getSymbolMessage, getFileBadgeMessage } from './language';
