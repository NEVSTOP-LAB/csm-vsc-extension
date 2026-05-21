const HIDDEN_MODULE_TOPICS = new Set([
	'csm-modsets',
	'labview-csm',
]);

export function getVisibleModuleTopics(topics: readonly string[] | undefined): string[] {
	return (topics ?? []).filter((topic) => !HIDDEN_MODULE_TOPICS.has(topic.toLowerCase()));
}