import * as vscode from 'vscode';

import { CONFIG_KEYS, CONFIG_SECTIONS } from './constants';

export const DEFAULT_HIDDEN_MODULE_TOPICS = [
	'csm-modsets',
	'lv-csm-app',
	'labview-csm',
	'labview',
] as const;

function getHiddenModuleTopics(): Set<string> {
	const configuredTopics = vscode.workspace.getConfiguration(CONFIG_SECTIONS.moduleManager).get<readonly string[]>(
		CONFIG_KEYS.hiddenTopics,
		[...DEFAULT_HIDDEN_MODULE_TOPICS],
	);

	return new Set(
		(configuredTopics ?? [])
			.filter((topic): topic is string => typeof topic === 'string')
			.map((topic) => topic.trim().toLowerCase())
			.filter((topic) => topic.length > 0),
	);
}

export function getVisibleModuleTopics(topics: readonly string[] | undefined): string[] {
	const hiddenTopics = getHiddenModuleTopics();
	return (topics ?? []).filter((topic) => !hiddenTopics.has(topic.toLowerCase()));
}