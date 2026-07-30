import * as vscode from 'vscode';

type LocalizedValue = string | number | boolean;

export type LocalizedParams = Record<string, LocalizedValue>;

export type LocalizedEntry = {
	en: string;
	zh: string;
};

export type LocalizedBundle = Record<string, LocalizedEntry>;

let languageOverride: string | undefined;
let _cachedLanguage: string | undefined;

function getLanguageFromNlsConfig(): string | undefined {
	const rawConfig = process.env.VSCODE_NLS_CONFIG;
	if (!rawConfig) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(rawConfig) as { locale?: unknown };
		return typeof parsed.locale === 'string' && parsed.locale.trim().length > 0
			? parsed.locale
			: undefined;
	} catch {
		return undefined;
	}
}

function getCurrentLanguage(): string {
	// override（测试用）始终优先，不使用缓存
	if (languageOverride) {
		return languageOverride;
	}

	if (_cachedLanguage !== undefined) {
		return _cachedLanguage;
	}

	if (typeof vscode.env?.language === 'string' && vscode.env.language.trim().length > 0) {
		_cachedLanguage = vscode.env.language;
		return _cachedLanguage;
	}

	_cachedLanguage = getLanguageFromNlsConfig() ?? 'en';
	return _cachedLanguage;
}

export function isChineseLanguage(): boolean {
	return getCurrentLanguage().toLowerCase().startsWith('zh');
}

export function getHtmlLang(): string {
	return isChineseLanguage() ? 'zh-CN' : 'en';
}

export function localizeBundle<Bundle extends LocalizedBundle, Key extends keyof Bundle & string>(
	bundle: Bundle,
	key: Key,
	params?: LocalizedParams,
): string {
	const entry = bundle[key];
	const template = isChineseLanguage() ? entry.zh : entry.en;

	return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, token: string) => {
		if (!params || !Object.prototype.hasOwnProperty.call(params, token)) {
			return match;
		}

		return String(params[token]);
	});
}

export function __setLanguageOverrideForTests(language: string | undefined): void {
	languageOverride = language;
	_cachedLanguage = undefined; // 使缓存失效，下次调用重新检测
}