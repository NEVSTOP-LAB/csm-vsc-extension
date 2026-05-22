/**
 * Command handler stubs for the Module Manager.
 *
 * Each class encapsulates the responsibility of a single VS Code command
 * registration so the orchestration layer (`ModuleManagerController`)
 * can be split into smaller, more focused units in the future
 * (review item 2.1).
 *
 * For now these are thin facades over the controller's methods so that
 * tests and future refactors can reach for the command-shaped API
 * without depending on the controller's internals.
 */
import { CsmModuleEntry } from '../types';
import { ModuleSortField } from '../interfaces';

export interface CommandTarget {
	loginCommand(): Promise<void>;
	logoutCommand(): Promise<void>;
	refreshCommand(): Promise<void>;
	initializeWorkspaceCommand(): Promise<void>;
	openReadmeCommand(entry?: CsmModuleEntry): Promise<void>;
	applyToWorkspaceCommand(entry?: CsmModuleEntry): Promise<void>;
	removeModuleCommand(entry?: CsmModuleEntry): Promise<void>;
	updateModuleCommand(entry?: CsmModuleEntry): Promise<void>;
	setSortOrderCommand(field?: ModuleSortField): void;
}

export class LoginCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(): Promise<void> { return this.target.loginCommand(); }
}

export class LogoutCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(): Promise<void> { return this.target.logoutCommand(); }
}

export class RefreshCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(): Promise<void> { return this.target.refreshCommand(); }
}

export class InitializeWorkspaceCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(): Promise<void> { return this.target.initializeWorkspaceCommand(); }
}

export class OpenReadmeCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(entry?: CsmModuleEntry): Promise<void> { return this.target.openReadmeCommand(entry); }
}

export class ApplyToWorkspaceCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(entry?: CsmModuleEntry): Promise<void> { return this.target.applyToWorkspaceCommand(entry); }
}

export class RemoveModuleCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(entry?: CsmModuleEntry): Promise<void> { return this.target.removeModuleCommand(entry); }
}

export class UpdateModuleCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(entry?: CsmModuleEntry): Promise<void> { return this.target.updateModuleCommand(entry); }
}

export class SetSortOrderCommand {
	constructor(private readonly target: CommandTarget) {}
	execute(field?: ModuleSortField): void { this.target.setSortOrderCommand(field); }
}
