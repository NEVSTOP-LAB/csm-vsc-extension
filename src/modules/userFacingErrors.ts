import { t } from '../i18n';

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
	const githubStatusMatch = message.match(/GitHub (?:API|README|star status|star|unstar|create repository|repository topics|current user) request failed: (\d{3})/);
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
	// ---- 输入校验类错误（normalizeRootPath / normalizeNamespacePath）----
	if (message === 'A relative directory is required.') {
		return t('relativeDirectoryRequired');
	}
	if (message === 'Use a directory relative to the repository root.') {
		return t('directoryMustBeRelative');
	}
	if (message === 'The directory cannot be the repository root.') {
		return t('directoryCannotBeRoot');
	}
	if (message === 'The directory must stay inside the repository root.') {
		return t('directoryInsideRoot');
	}
	if (message === 'Use a namespace path relative to the module root.') {
		return t('namespaceRelativeRequired');
	}
	if (message === 'The namespace path must stay inside the module root.') {
		return t('namespaceInsideRoot');
	}
	// ---- 底层操作错误（workspaceModuleService / gitService）----
	if (message === 'git unavailable') {
		return t('gitUnavailable');
	}
	if (message === 'Unknown command failure.') {
		return t('unknownCommandFailure');
	}
	const localFolderNotDirectory = message.match(/^Local folder is not a directory: (.+)$/);
	if (localFolderNotDirectory) {
		return t('localFolderNotDirectory', { folder: localFolderNotDirectory[1] });
	}
	const publishedFolderNotDirectory = message.match(/^Published folder is not a directory: (.+)$/);
	if (publishedFolderNotDirectory) {
		return t('publishedFolderNotDirectory', { path: publishedFolderNotDirectory[1] });
	}
	if (message === 'A release must be selected to switch to release mode.') {
		return t('releaseRequiredToSwitchToRelease');
	}
	const gitRepoRootToConvert = message.match(/^Git repository root is required to convert a (.+?) to (.+?) mode\.$/);
	if (gitRepoRootToConvert) {
		return t('gitRepoRootRequiredToConvert', { method: `${gitRepoRootToConvert[1]}→${gitRepoRootToConvert[2]}` });
	}
	if (message === 'The release has no downloadable assets.') {
		return t('releaseHasNoAssets');
	}
	const copyTargetExists = message.match(/^Copy target already exists: (.+)$/);
	if (copyTargetExists) {
		return t('copyTargetExists');
	}
	const targetPathExists = message.match(/^Target path already exists: (.+)$/);
	if (targetPathExists) {
		return t('targetPathExists');
	}
	if (message === 'Target path must stay inside the repository root.') {
		return t('targetPathInsideRoot');
	}
	const convertedMissing = message.match(/^Converted module target is (?:missing|not a directory) after switching to (.+?) mode: (.+)$/);
	if (convertedMissing) {
		return t('convertedModuleTargetMissing', { method: convertedMissing[1] });
	}
	const lockStateFailed = message.match(/^Failed to update lock state for (\d+) path\(s\): (.+)$/);
	if (lockStateFailed) {
		return t('lockStateUpdateFailed', { count: Number(lockStateFailed[1]) });
	}
	const lockedRevision = message.match(/^Unable to determine the locked revision for (.+)\.$/);
	if (lockedRevision) {
		return t('unableToDetermineLockedRevision', { path: lockedRevision[1] });
	}
	const missingTagReference = message.match(/^Missing tag reference for (.+?) update\.$/);
	if (missingTagReference) {
		return t('missingTagReference', { kind: missingTagReference[1] });
	}
	if (message === 'Missing commit reference for commit update.') {
		return t('missingCommitReference');
	}
	const assetDownloadFailed = message.match(/^Failed to download release asset (.+): HTTP (\d+)$/);
	if (assetDownloadFailed) {
		return t('releaseAssetDownloadFailed', { name: assetDownloadFailed[1], status: assetDownloadFailed[2] });
	}
	const assetDownloadMissing = message.match(/^Downloaded release asset is missing: (.+)$/);
	if (assetDownloadMissing) {
		return t('releaseAssetDownloadMissing', { name: assetDownloadMissing[1] });
	}
	const latestRevision = message.match(/^Unable to determine the latest revision for branch (.+)\.$/);
	if (latestRevision) {
		return t('unableToDetermineLatestRevision', { branch: latestRevision[1] });
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