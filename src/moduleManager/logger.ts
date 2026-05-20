import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from './constants';

export type Logger = vscode.LogOutputChannel;

let sharedLogger: Logger | undefined;

export function getLogger(): Logger {
	if (!sharedLogger) {
		sharedLogger = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME, { log: true });
	}
	return sharedLogger;
}

/**
 * Test-only helper: lets specs install a stubbed logger and reset it afterwards.
 */
export function __setLoggerForTests(logger: Logger | undefined): void {
	sharedLogger = logger;
}

/**
 * Wrap an async command handler so unhandled errors are logged and surfaced as a toast,
 * instead of being silently swallowed by `void`.
 */
export function wrapCommand<T extends unknown[]>(
	commandName: string,
	fn: (...args: T) => Promise<void> | void,
	logger: Logger = getLogger(),
): (...args: T) => Promise<void> {
	return async (...args: T) => {
		try {
			await fn(...args);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unexpected error';
			logger.error(`[${commandName}] ${message}`);
			if (error instanceof Error && error.stack) {
				logger.error(error.stack);
			}
			void vscode.window.showErrorMessage(`CSM Module Manager: ${message}`);
		}
	};
}
