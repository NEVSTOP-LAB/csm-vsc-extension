import { t } from './messages';

export type UserFacingErrorContext = 'refresh' | 'apply' | 'update' | 'remove' | 'config' | 'createRepo';

export function getUserFacingErrorMessage(error: unknown, context: UserFacingErrorContext): string {
	const rawMessage = error instanceof Error ? error.message : String(error);
	const segments = rawMessage.split('; ').map((segment) => segment.trim()).filter((segment) => segment.length > 0);
	if (segments.length === 0) {
		return t('unexpectedError');
	}
	return segments.map((segment) => mapUserFacingErrorSegment(segment, context)).join('; ');
}

function mapUserFacingErrorSegment(segment: string, context: UserFacingErrorContext): string {
	const modulePrefixMatch = segment.match(/^([^:]+\/[^:]+):\s+(.*)$/);
	if (modulePrefixMatch) {
		return `${modulePrefixMatch[1]}: ${mapSingleUserFacingError(modulePrefixMatch[2] ?? '', context)}`;
	}
	return mapSingleUserFacingError(segment, context);
}

function mapSingleUserFacingError(message: string, context: UserFacingErrorContext): string {
	const githubStatusMatch = message.match(/GitHub (?:API|README|star status|star|unstar|create repository|repository topics) request failed: (\d{3})/);
	if (githubStatusMatch) {
		return mapGitHubStatusToUserMessage(Number(githubStatusMatch[1]), context);
	}
	if (/Failed to parse YAML config:/i.test(message)) {
		return t('invalidYamlConfig');
	}
	if (/spawn .*ENOENT|is not recognized as an internal or external command|The system cannot find the file specified/i.test(message)) {
		return t('gitUnavailable');
	}
	if (/Authentication failed|Permission denied|could not read Username|Repository not found|access denied/i.test(message)) {
		return t('gitCannotAccessRepo');
	}
	if (/Local folder already has a different origin remote/i.test(message)) {
		return t('publishOriginConflict');
	}
	if (/Local folder is empty\. Add files before publishing\./i.test(message)) {
		return t('publishFolderEmpty');
	}
	if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(message)) {
		return t('networkRequestFailed');
	}
	return message;
}

function mapGitHubStatusToUserMessage(status: number, context: UserFacingErrorContext): string {
	switch (status) {
		case 401:
			return t('github401');
		case 403:
			return t('github403');
		case 404:
			if (context === 'refresh') {
				return t('github404Module');
			}
			if (context === 'createRepo') {
				return t('githubRequestFailed', { status });
			}
			return t('github404Readme');
		default:
			if (status === 429 || status >= 500) {
				return t('githubTemporaryUnavailable', { status });
			}
			return t('githubRequestFailed', { status });
	}
}