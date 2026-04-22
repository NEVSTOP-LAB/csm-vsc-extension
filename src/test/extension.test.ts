import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

// ─── Shared test helpers ──────────────────────────────────────────────────────

interface GrammarPattern {
	match?: string;
	name?: string;
	begin?: string;
	end?: string;
	captures?: Record<string, { name: string }>;
	beginCaptures?: Record<string, { name: string }>;
	endCaptures?: Record<string, { name: string }>;
	contentName?: string;
	patterns?: GrammarPattern[];
	include?: string;
}

interface Grammar {
	name: string;
	scopeName: string;
	patterns: GrammarPattern[];
	repository: Record<string, GrammarPattern>;
}

function loadGrammar(): Grammar {
	const grammarPath = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
	return JSON.parse(fs.readFileSync(grammarPath, 'utf-8')) as Grammar;
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('Language Definition Tests', () => {

	test('language-configuration.json exists', () => {
		const configPath = path.resolve(__dirname, '../../language-configuration.json');
		assert.ok(fs.existsSync(configPath), 'language-configuration.json should exist');
	});

	test('language-configuration.json is valid JSON', () => {
		const configPath = path.resolve(__dirname, '../../language-configuration.json');
		const content = fs.readFileSync(configPath, 'utf-8');
		let parsed: unknown;
		assert.doesNotThrow(() => {
			parsed = JSON.parse(content);
		}, 'language-configuration.json should be valid JSON');
		assert.ok(parsed !== null && typeof parsed === 'object', 'should be a JSON object');
	});

	test('language-configuration.json has line comment and no block comment', () => {
		const configPath = path.resolve(__dirname, '../../language-configuration.json');
		const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		assert.ok(config.comments, 'should have comments field');
		assert.strictEqual(config.comments.lineComment, '//', 'line comment should be //');
		assert.strictEqual(config.comments.blockComment, undefined, 'CSMScript has no block comments');
	});

	test('language-configuration.json has auto-closing pairs for <>, ${}, quotes', () => {
		const configPath = path.resolve(__dirname, '../../language-configuration.json');
		const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		assert.ok(Array.isArray(config.autoClosingPairs), 'should have autoClosingPairs array');
		const opens = config.autoClosingPairs.map((p: { open: string }) => p.open);
		assert.ok(opens.includes('<'), 'should auto-close < to >');
		assert.ok(opens.includes('${'), 'should auto-close ${ to }');
		assert.ok(opens.includes('"'), 'should auto-close double quotes');
	});

	test('csmscript.tmLanguage.json exists', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
		assert.ok(fs.existsSync(grammarPath), 'csmscript.tmLanguage.json should exist');
	});

	test('csmscript.tmLanguage.json is valid JSON', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
		const content = fs.readFileSync(grammarPath, 'utf-8');
		let parsed: unknown;
		assert.doesNotThrow(() => {
			parsed = JSON.parse(content);
		}, 'csmscript.tmLanguage.json should be valid JSON');
		assert.ok(parsed !== null && typeof parsed === 'object', 'should be a JSON object');
	});

	test('csmscript.tmLanguage.json has required fields', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		assert.strictEqual(grammar.name, 'CSMScript', 'grammar name should be CSMScript');
		assert.strictEqual(grammar.scopeName, 'source.csmscript', 'scopeName should be source.csmscript');
		assert.ok(Array.isArray(grammar.patterns), 'patterns should be an array');
		assert.ok(grammar.repository, 'repository should exist');
	});

	test('csmscript.tmLanguage.json contains CSMScript-specific patterns', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		assert.ok(grammar.repository['line-comment'], 'line-comment repository entry should exist');
		assert.ok(grammar.repository['subscription-op'], 'subscription-op repository entry should exist');
		assert.ok(grammar.repository['communication-operator'], 'communication-operator repository entry should exist');
		assert.ok(grammar.repository['argument-separator'], 'argument-separator (>>) repository entry should exist');
		assert.ok(grammar.repository['state-prefix'], 'state-prefix repository entry should exist');
		assert.ok(grammar.repository['system-state'], 'system-state repository entry should exist');
		assert.ok(grammar.repository['control-flow'], 'control-flow repository entry should exist');
		assert.ok(grammar.repository['anchor'], 'anchor repository entry should exist');
		assert.ok(grammar.repository['builtin-command'], 'builtin-command repository entry should exist');
		assert.ok(grammar.repository['variable-reference'], 'variable-reference repository entry should exist');
		assert.ok(grammar.repository['return-value-save'], 'return-value-save repository entry should exist');
		assert.ok(grammar.repository['range-operator'], 'range-operator repository entry should exist');
		assert.ok(grammar.repository['conditional-jump'], 'conditional-jump repository entry should exist');
		assert.ok(grammar.repository['predef-section'], 'predef-section repository entry should exist');
	});

	test('csmscript.tmLanguage.json argument-separator matches >>', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		const sep = grammar.repository['argument-separator'];
		assert.ok(sep.match, 'argument-separator should have a match pattern');
		assert.strictEqual(sep.match, '>>', 'argument-separator should match >>');
	});

	test('csmscript.tmLanguage.json argument-text scopes parameters between >> and send operators', () => {
		const grammar = loadGrammar();
		const argText = grammar.repository['argument-text'];
		assert.ok(argText, 'argument-text repository entry should exist');
		assert.ok(
			argText.contentName?.includes('string.unquoted.argument.csmscript'),
			'argument-text should mark arguments with string scope'
		);
		assert.ok(typeof argText.begin === 'string' && argText.begin.includes('>>'), 'argument-text should start after >>');
		assert.ok(typeof argText.end === 'string' && argText.end.includes('-@'), 'argument-text should end before send operators');
		const includes = (argText.patterns ?? []).map((p) => p.include);
		assert.ok(includes.includes('#anchor'), 'argument-text should include anchor pattern so <anchor> stays highlighted');
		assert.ok(includes.includes('#control-flow'), 'argument-text should include control-flow pattern to preserve tags like <end_if>');
	});

	test('package.json registers CSMScript language with .csmscript only', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const languages: Array<{ id: string; aliases: string[]; extensions: string[] }> = pkg.contributes?.languages ?? [];
		const csmLang = languages.find((l) => l.id === 'csmscript');
		assert.ok(csmLang, 'csmscript language should be registered in package.json');
		assert.ok(csmLang.extensions.includes('.csmscript'), '.csmscript extension should be registered');
		assert.strictEqual(csmLang.extensions.length, 1, 'only .csmscript extension should be registered');
		assert.deepStrictEqual(csmLang.aliases, ['CSMScript'], 'alias should be CSMScript only');
	});

	test('package.json registers CSMScript grammar', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const grammars: Array<{ language: string; scopeName: string; path: string }> = pkg.contributes?.grammars ?? [];
		const csmGrammar = grammars.find((g) => g.language === 'csmscript');
		assert.ok(csmGrammar, 'csmscript grammar should be registered in package.json');
		assert.strictEqual(csmGrammar.scopeName, 'source.csmscript', 'scopeName should be source.csmscript');
		assert.ok(csmGrammar.path.includes('csmscript.tmLanguage.json'), 'grammar path should point to tmLanguage.json');
	});

	test('package.json styles CSMScript argument text as italic without underline', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const rules: Array<{ scope?: string | string[]; settings?: { fontStyle?: string } }> =
			pkg.contributes?.configurationDefaults?.['editor.tokenColorCustomizations']?.textMateRules ?? [];
		const argRule = rules.find((r) => {
			if (Array.isArray(r.scope)) { return r.scope.includes('string.unquoted.argument.csmscript'); }
			return r.scope === 'string.unquoted.argument.csmscript';
		});
		assert.ok(argRule, 'textMateRules should contain styling for argument text');
		const fontStyle = argRule?.settings?.fontStyle ?? '';
		assert.ok(fontStyle.includes('italic'), 'argument text should be italic');
		assert.ok(!fontStyle.includes('underline'), 'argument text should not be underlined');
	});

	test('package.json styles csmlog argument key:value prefix as bold italic underline', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const rules: Array<{ scope?: string | string[]; settings?: { fontStyle?: string } }> =
			pkg.contributes?.configurationDefaults?.['editor.tokenColorCustomizations']?.textMateRules ?? [];
		const keyRule = rules.find((r) => {
			if (Array.isArray(r.scope)) {
				return r.scope.includes('variable.other.argument-key.csmlog')
					&& r.scope.includes('punctuation.separator.argument-key.csmlog');
			}
			return false;
		});
		assert.ok(keyRule, 'textMateRules should contain styling for csmlog argument key/value prefix');
		const fontStyle = keyRule?.settings?.fontStyle ?? '';
		assert.ok(fontStyle.includes('bold'), 'argument key:value prefix should be bold');
		assert.ok(fontStyle.includes('italic'), 'argument key:value prefix should be italic');
		assert.ok(fontStyle.includes('underline'), 'argument key:value prefix should be underlined');
	});

	test('package.json styles csmlog <- origin text distinctly from argument text', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const rules: Array<{ scope?: string | string[]; settings?: { fontStyle?: string; foreground?: string } }> =
			pkg.contributes?.configurationDefaults?.['editor.tokenColorCustomizations']?.textMateRules ?? [];

		const findRule = (scopeName: string) => rules.find((r) => {
			if (Array.isArray(r.scope)) { return r.scope.includes(scopeName); }
			return r.scope === scopeName;
		});

		const argRule = findRule('string.unquoted.argument.csmscript');
		const originOpRule = findRule('keyword.operator.direction.origin.csmlog');
		const originTextRule = findRule('variable.other.log-origin.csmlog');

		assert.ok(argRule, 'argument text rule should exist');
		assert.ok(originOpRule, 'csmlog <- operator rule should exist');
		assert.ok(originTextRule, 'csmlog origin text rule should exist');

		const argColor = argRule?.settings?.foreground ?? '';
		const originOpColor = originOpRule?.settings?.foreground ?? '';
		const originTextColor = originTextRule?.settings?.foreground ?? '';
		assert.notStrictEqual(originOpColor, argColor, '<- operator color should differ from argument color');
		assert.notStrictEqual(originTextColor, argColor, 'origin text color should differ from argument color');

		const originOpStyle = originOpRule?.settings?.fontStyle ?? '';
		const originTextStyle = originTextRule?.settings?.fontStyle ?? '';
		assert.ok(originOpStyle.includes('bold'), '<- operator should use bold style for stronger distinction');
		assert.ok(!originTextStyle.includes('italic'), 'origin text should not use italic style');
	});

	test('package.json styles event header modules as event-color with underline', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const rules: Array<{ scope?: string | string[]; settings?: { fontStyle?: string; foreground?: string } }> =
			pkg.contributes?.configurationDefaults?.['editor.tokenColorCustomizations']?.textMateRules ?? [];

		const findRule = (scopeName: string) => rules.find((r) => r.scope === scopeName);

		const pairs: Array<{ eventScope: string; moduleScope: string }> = [
			{ eventScope: 'invalid.illegal.event-type.error.csmlog', moduleScope: 'entity.name.namespace.module.error.csmlog' },
			{ eventScope: 'markup.changed.event-type.userlog.csmlog', moduleScope: 'entity.name.namespace.module.userlog.csmlog' },
			{ eventScope: 'keyword.control.event-type.lifecycle.csmlog', moduleScope: 'entity.name.namespace.module.lifecycle.csmlog' },
			{ eventScope: 'storage.type.event-type.register.csmlog', moduleScope: 'entity.name.namespace.module.register.csmlog' },
			{ eventScope: 'keyword.control.event-type.interrupt.csmlog', moduleScope: 'entity.name.namespace.module.interrupt.csmlog' },
			{ eventScope: 'keyword.other.event-type.message.csmlog', moduleScope: 'entity.name.namespace.module.message.csmlog' },
			{ eventScope: 'entity.name.tag.event-type.status.csmlog', moduleScope: 'entity.name.namespace.module.status.csmlog' },
			{ eventScope: 'support.type.event-type.other.csmlog', moduleScope: 'entity.name.namespace.module.other.csmlog' }
		];

		for (const pair of pairs) {
			const eventRule = findRule(pair.eventScope);
			const moduleRule = findRule(pair.moduleScope);
			assert.ok(eventRule, `${pair.eventScope} rule should exist`);
			assert.ok(moduleRule, `${pair.moduleScope} rule should exist`);

			const eventColor = eventRule?.settings?.foreground ?? '';
			const moduleColor = moduleRule?.settings?.foreground ?? '';
			const moduleStyle = moduleRule?.settings?.fontStyle ?? '';

			assert.strictEqual(moduleColor, eventColor, `${pair.moduleScope} color should match ${pair.eventScope}`);
			assert.ok(moduleStyle.includes('underline'), `${pair.moduleScope} should keep underline`);
		}

		const stateModuleRule = findRule('meta.log.event-type.state.module.csmlog');
		assert.ok(stateModuleRule, 'state header module rule should exist');
		const stateStyle = stateModuleRule?.settings?.fontStyle ?? '';
		assert.ok(stateStyle.includes('underline'), 'state header module should keep underline');
	});

	test('csmlog.tmLanguage.json exists', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		assert.ok(fs.existsSync(grammarPath), 'csmlog.tmLanguage.json should exist');
	});

	test('csmlog.tmLanguage.json is valid JSON', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const content = fs.readFileSync(grammarPath, 'utf-8');
		let parsed: unknown;
		assert.doesNotThrow(() => {
			parsed = JSON.parse(content);
		}, 'csmlog.tmLanguage.json should be valid JSON');
		assert.ok(parsed !== null && typeof parsed === 'object', 'should be a JSON object');
	});

	test('csmlog.tmLanguage.json has required fields', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		assert.strictEqual(grammar.name, 'CSMLog', 'grammar name should be CSMLog');
		assert.strictEqual(grammar.scopeName, 'source.csmlog', 'scopeName should be source.csmlog');
		assert.ok(Array.isArray(grammar.patterns), 'patterns should be an array');
		assert.ok(grammar.repository, 'repository should exist');
	});

	test('csmlog.tmLanguage.json contains required patterns', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		assert.ok(grammar.repository['config-line'], 'config-line repository entry should exist');
		assert.ok(grammar.repository['log-line'], 'log-line repository entry should exist');
		assert.ok(grammar.repository['log-entry-error'], 'log-entry-error repository entry should exist');
		assert.ok(grammar.repository['log-entry-filelogger'], 'log-entry-filelogger repository entry should exist');
		assert.ok(grammar.repository['log-entry-userlog'], 'log-entry-userlog repository entry should exist');
		assert.ok(grammar.repository['log-entry-lifecycle'], 'log-entry-lifecycle repository entry should exist');
		assert.ok(grammar.repository['log-entry-register'], 'log-entry-register repository entry should exist');
		assert.ok(grammar.repository['log-entry-interrupt'], 'log-entry-interrupt repository entry should exist');
		assert.ok(grammar.repository['log-entry-message'], 'log-entry-message repository entry should exist');
		assert.ok(grammar.repository['log-entry-status'], 'log-entry-status repository entry should exist');
		assert.ok(grammar.repository['log-entry-filtered-state'], 'log-entry-filtered-state repository entry should exist');
		assert.ok(grammar.repository['log-entry-state'], 'log-entry-state repository entry should exist');
		assert.ok(grammar.repository['log-entry-other'], 'log-entry-other repository entry should exist');
		assert.ok(grammar.repository['log-argument-key-pair'], 'log-argument-key-pair repository entry should exist');
		assert.ok(grammar.repository['log-origin-with-detail'], 'log-origin-with-detail repository entry should exist');
	});

	test('csmlog.tmLanguage.json log-argument-key-pair matches key:value prefixes', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		const entry = grammar.repository['log-argument-key-pair'];
		assert.ok(entry, 'log-argument-key-pair should exist');
		const re = new RegExp(entry.match);
		assert.ok(re.test('index:'), 'should match plain key:value prefix');
		assert.ok(re.test('timestamp:'), 'should match timestamp key prefix');
		assert.ok(re.test('{index:'), 'should match key:value prefix inside braces');
		assert.ok(re.test(';Argument:'), 'should match key:value prefix after separator');
		assert.ok(!re.test('50ms'), 'should not match plain value text without colon');
	});

	test('csmlog.tmLanguage.json log-entry-filtered-state matches <...>[State Change] compact lines', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		const entry = grammar.repository['log-entry-filtered-state'];
		assert.ok(entry, 'log-entry-filtered-state should exist');
		const re = new RegExp(entry.match);
		assert.ok(re.test('2026/03/11 18:07:53.052 <Start Filter>[State Change]App | '), 'should match filter-marker compact state line');
		assert.ok(re.test('2026/03/11 18:07:53.052 [18:07:53.050] <Start Filter>[State Change]App | '), 'should match filter-marker line with relative timestamp');
		assert.ok(!re.test('2026/03/20 17:32:59.426 [State Change] AI | Macro: Initialize'), 'should not match standard state line without filter marker');
	});

	test('csmlog.tmLanguage.json log-entry-filelogger matches file logger lines', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		const entry = grammar.repository['log-entry-filelogger'];
		assert.ok(entry, 'log-entry-filelogger should exist');
		const re = new RegExp(entry.match);
		assert.ok(re.test('2026/03/11 18:09:47.330  System started successfully'), 'should match file logger with double space');
		assert.ok(re.test('2026/03/11 18:09:47.330  信息内容'), 'should match file logger with Chinese content');
		assert.ok(!re.test('2026/03/20 17:32:59.425 [17:32:59.425] [State Change] AI | content'), 'should not match normal log line with single space');
		assert.ok(!re.test('2026/03/06 08:45:48.554  [08:45:48.554] [State Change] AI | content'), 'should not match normal log line even when two spaces precede [relative timestamp]');
		assert.ok(!re.test('2026/03/06 08:45:48.554  [State Change] AI | content'), 'should not match normal log line even when two spaces precede [EventType]');
	});

	test('csmlog.tmLanguage.json log-origin-with-detail matches <- origin lines', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));
		const entry = grammar.repository['log-origin-with-detail'];
		assert.ok(entry, 'log-origin-with-detail should exist');
		const re = new RegExp(entry.match);
		assert.ok(re.test('VI Reference <- -SendMsgAPI2BA5CB1425E8'), 'should match <- origin pattern');
		assert.ok(re.test('Target Error <- MeasureModule'), 'should match <- with module name');
	});

	test('csmlog.tmLanguage.json all log-entry rules tolerate missing relative timestamp', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));

		// Lines WITHOUT relative timestamp [HH:MM:SS.mmm]
		const noRelTs: Array<[string, string]> = [
			['log-entry-error',     '2026/03/11 18:09:40.589 [Error] AI |'],
			['log-entry-register',  '2026/03/11 18:09:40.589 [Register] Measure |'],
			['log-entry-interrupt', '2026/03/11 18:09:40.589 [Interrupt] AI |'],
			['log-entry-message',   '2026/03/11 18:09:40.589 [Sync Message] Mod |'],
			['log-entry-status',    '2026/03/11 18:09:40.589 [Status] Measure |'],
			['log-entry-userlog',   '2026/03/11 18:09:40.589 [User Log] Runner |'],
			['log-entry-state',     '2026/03/11 18:09:40.589 [State Change] AI |'],
		];
		for (const [rule, line] of noRelTs) {
			const re = new RegExp(grammar.repository[rule].match);
			assert.ok(re.test(line), `${rule} should match without relative timestamp: "${line}"`);
		}

		// Lines WITH relative timestamp (existing behaviour must be unchanged)
		const withRelTs: Array<[string, string]> = [
			['log-entry-error',     '2026/03/20 17:33:05.270 [17:33:05.270] [Error] AI |'],
			['log-entry-register',  '2026/03/20 17:33:05.261 [17:33:05.261] [Register] Measure |'],
			['log-entry-interrupt', '2026/03/20 17:33:05.263 [17:33:05.263] [Interrupt] AI |'],
			['log-entry-message',   '2026/03/20 17:32:59.426 [17:32:59.425] [Sync Message] Mod |'],
			['log-entry-status',    '2026/03/20 17:33:05.264 [17:33:05.264] [Status] Measure |'],
			['log-entry-userlog',   '2026/03/20 17:33:05.260 [17:33:05.260] [User Log] Runner |'],
			['log-entry-state',     '2026/03/20 17:32:59.426 [17:32:59.425] [State Change] AI |'],
		];
		for (const [rule, line] of withRelTs) {
			const re = new RegExp(grammar.repository[rule].match);
			assert.ok(re.test(line), `${rule} should still match with relative timestamp: "${line}"`);
		}
	});

	test('csmlog timestamp scopes follow event-type-specific scope mapping', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/csmlog.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));

		const errorCaps = grammar.repository['log-entry-error'].captures;
		assert.strictEqual(errorCaps['1'].name, 'comment.line.timestamp.date.error.csmlog');
		assert.strictEqual(errorCaps['2'].name, 'comment.line.timestamp.time.error.csmlog');
		assert.strictEqual(errorCaps['4'].name, 'entity.name.namespace.module.error.csmlog');

		const userLogCaps = grammar.repository['log-entry-userlog'].captures;
		assert.strictEqual(userLogCaps['4'].name, 'entity.name.namespace.module.userlog.csmlog');

		const lifecycleCaps = grammar.repository['log-entry-lifecycle'].captures;
		assert.strictEqual(lifecycleCaps['4'].name, 'entity.name.namespace.module.lifecycle.csmlog');

		const registerCaps = grammar.repository['log-entry-register'].captures;
		assert.strictEqual(registerCaps['4'].name, 'entity.name.namespace.module.register.csmlog');

		const interruptCaps = grammar.repository['log-entry-interrupt'].captures;
		assert.strictEqual(interruptCaps['4'].name, 'entity.name.namespace.module.interrupt.csmlog');

		const messageCaps = grammar.repository['log-entry-message'].captures;
		assert.strictEqual(messageCaps['1'].name, 'comment.line.timestamp.date.message.csmlog');
		assert.strictEqual(messageCaps['2'].name, 'comment.line.timestamp.time.message.csmlog');
		assert.strictEqual(messageCaps['4'].name, 'entity.name.namespace.module.message.csmlog');

		const statusCaps = grammar.repository['log-entry-status'].captures;
		assert.strictEqual(statusCaps['4'].name, 'entity.name.namespace.module.status.csmlog');

		const stateCaps = grammar.repository['log-entry-state'].captures;
		assert.strictEqual(stateCaps['1'].name, 'meta.log.event-type.state.csmlog');
		assert.strictEqual(stateCaps['2'].name, 'meta.log.event-type.state.csmlog');
		assert.strictEqual(stateCaps['4'].name, 'meta.log.event-type.state.module.csmlog');

		const filteredStateCaps = grammar.repository['log-entry-filtered-state'].captures;
		assert.strictEqual(filteredStateCaps['3'].name, 'meta.log.event-type.state.csmlog');
		assert.strictEqual(filteredStateCaps['5'].name, 'meta.log.event-type.state.module.csmlog');

		const otherCaps = grammar.repository['log-entry-other'].captures;
		assert.strictEqual(otherCaps['4'].name, 'entity.name.namespace.module.other.csmlog');
	});

	test('package.json registers csmlog language with .csmlog only', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const languages: Array<{ id: string; aliases: string[]; extensions: string[] }> = pkg.contributes?.languages ?? [];
		const csmlogLang = languages.find((l) => l.id === 'csmlog');
		assert.ok(csmlogLang, 'csmlog language should be registered in package.json');
		assert.ok(csmlogLang.extensions.includes('.csmlog'), '.csmlog extension should be registered');
		assert.strictEqual(csmlogLang.extensions.length, 1, 'only .csmlog extension should be registered');
		assert.deepStrictEqual(csmlogLang.aliases, ['CSMLog'], 'alias should be CSMLog only');
	});

	test('package.json registers csmlog grammar', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const grammars: Array<{ language: string; scopeName: string; path: string }> = pkg.contributes?.grammars ?? [];
		const csmlogGrammar = grammars.find((g) => g.language === 'csmlog');
		assert.ok(csmlogGrammar, 'csmlog grammar should be registered in package.json');
		assert.strictEqual(csmlogGrammar.scopeName, 'source.csmlog', 'scopeName should be source.csmlog');
		assert.ok(csmlogGrammar.path.includes('csmlog.tmLanguage.json'), 'grammar path should point to csmlog.tmLanguage.json');
	});

	test('package.json registers .lvcsm extension as lvcsm language', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const languages: Array<{ id: string; extensions?: string[] }> = pkg.contributes?.languages ?? [];
		const lvcsmLang = languages.find((l) => l.id === 'lvcsm');
		assert.ok(lvcsmLang, 'lvcsm language entry should be registered in package.json');
		assert.ok(lvcsmLang.extensions?.includes('.lvcsm'), '.lvcsm extension should be registered under lvcsm language');
	});

	test('package.json registers lvcsm grammar', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const grammars: Array<{ language: string; scopeName?: string; path?: string }> = pkg.contributes?.grammars ?? [];
		const lvcsmGrammar = grammars.find((g) => g.language === 'lvcsm');
		assert.ok(lvcsmGrammar, 'lvcsm grammar should be registered in package.json');
		assert.ok(
			typeof lvcsmGrammar?.scopeName === 'string' && lvcsmGrammar.scopeName.length > 0,
			'lvcsm grammar should have a non-empty scopeName'
		);
		assert.ok(
			typeof lvcsmGrammar?.path === 'string' && lvcsmGrammar.path.includes('lvcsm.tmLanguage.json'),
			'lvcsm grammar path should point to lvcsm.tmLanguage.json'
		);
	});

	test('lvcsm.tmLanguage.json contains required fields', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/lvcsm.tmLanguage.json');
		assert.ok(fs.existsSync(grammarPath), 'lvcsm.tmLanguage.json should exist in syntaxes directory');
		const raw = fs.readFileSync(grammarPath, 'utf-8');
		const grammar = JSON.parse(raw) as Partial<Grammar>;
		assert.ok(
			typeof grammar.name === 'string' && grammar.name.length > 0,
			'lvcsm.tmLanguage.json should define a non-empty "name"'
		);
		assert.ok(
			typeof grammar.scopeName === 'string' && grammar.scopeName.length > 0,
			'lvcsm.tmLanguage.json should define a non-empty "scopeName"'
		);
		assert.ok(
			Array.isArray(grammar.patterns),
			'lvcsm.tmLanguage.json should define a "patterns" array'
		);
	});

	test('package.json registers configurationDefaults for lvcsm', () => {
		const pkgPath = path.resolve(__dirname, '../../package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
		const configurationDefaults = pkg.contributes?.configurationDefaults ?? {};
		const lvcsmDefaults = configurationDefaults['[lvcsm]'];
		assert.ok(lvcsmDefaults, 'configurationDefaults for [lvcsm] should be registered in package.json');
		assert.ok(
			Object.prototype.hasOwnProperty.call(lvcsmDefaults, 'files.autoGuessEncoding'),
			'[lvcsm] configurationDefaults should define files.autoGuessEncoding'
		);
	});
});

suite('Grammar Pattern Tests', () => {


	function includesRef(patterns: Array<{ include?: string }>, ref: string): boolean {
		return patterns.some((p) => p.include === ref);
	}

	test('top-level patterns include control-flow and anchor', () => {
		const grammar = loadGrammar();
		assert.ok(includesRef(grammar.patterns, '#control-flow'), 'top-level patterns should include #control-flow');
		assert.ok(includesRef(grammar.patterns, '#anchor'), 'top-level patterns should include #anchor');
		assert.ok(includesRef(grammar.patterns, '#builtin-command'), 'top-level patterns should include #builtin-command');
		assert.ok(includesRef(grammar.patterns, '#variable-reference'), 'top-level patterns should include #variable-reference');
		assert.ok(includesRef(grammar.patterns, '#return-value-save'), 'top-level patterns should include #return-value-save');
		assert.ok(includesRef(grammar.patterns, '#range-operator'), 'top-level patterns should include #range-operator');
		assert.ok(includesRef(grammar.patterns, '#conditional-jump'), 'top-level patterns should include #conditional-jump');
		assert.ok(includesRef(grammar.patterns, '#predef-section'), 'top-level patterns should include #predef-section');
	});

	test('control-flow repository has simple flow, include and expression patterns', () => {
		const grammar = loadGrammar();
		const cf = grammar.repository['control-flow'];
		assert.ok(cf, 'control-flow repository entry should exist');
		assert.ok(Array.isArray(cf.patterns), 'control-flow should have patterns array');
		assert.strictEqual(cf.patterns.length, 3, 'control-flow should have 3 sub-patterns');

		const simplePattern = cf.patterns[0];
		assert.ok(simplePattern.match, 'first sub-pattern should have a match');
		assert.ok(simplePattern.match.includes('end_if'), 'first sub-pattern should include end_if');
		assert.ok(simplePattern.match.includes('else'), 'first sub-pattern should include else');
		assert.ok(simplePattern.match.includes('end_while'), 'first sub-pattern should include end_while');
		assert.ok(simplePattern.match.includes('do_while'), 'first sub-pattern should include do_while');
		assert.ok(simplePattern.match.includes('end_foreach'), 'first sub-pattern should include end_foreach');

		const includePattern = cf.patterns[1];
		assert.ok(includePattern.match, 'second sub-pattern should have a match');
		assert.ok(includePattern.match.includes('include'), 'second sub-pattern should be include directive');

		const exprPattern = cf.patterns[2];
		assert.ok(exprPattern.match, 'third sub-pattern should have a match');
		assert.ok(exprPattern.match.includes('if'), 'third sub-pattern should include if');
		assert.ok(exprPattern.match.includes('while'), 'third sub-pattern should include while');
		assert.ok(exprPattern.match.includes('foreach'), 'third sub-pattern should include foreach');
	});

	test('anchor repository entry matches <word> labels', () => {
		const grammar = loadGrammar();
		const anchor = grammar.repository['anchor'];
		assert.ok(anchor, 'anchor repository entry should exist');
		assert.ok(anchor.match, 'anchor should have a match pattern');
		assert.strictEqual(anchor.name, 'entity.name.label.anchor.csmscript', 'anchor scope name should be entity.name.label.anchor.csmscript');

		const re = new RegExp(anchor.match);
		assert.ok(re.test('<setup>'), 'anchor should match <setup>');
		assert.ok(re.test('<error_handler>'), 'anchor should match <error_handler>');
		assert.ok(re.test('<cleanup>'), 'anchor should match <cleanup>');
	});

	test('builtin-command repository entry exists with all required sub-groups', () => {
		const grammar = loadGrammar();
		const bc = grammar.repository['builtin-command'];
		assert.ok(bc, 'builtin-command repository entry should exist');
		assert.ok(Array.isArray(bc.patterns), 'builtin-command should have patterns array');

		const allMatch = bc.patterns!.map((p) => p.match ?? '').join(' ');
		assert.ok(allMatch.includes('GOTO'), 'should include GOTO');
		assert.ok(allMatch.includes('WAIT'), 'should include WAIT');
		assert.ok(allMatch.includes('BREAK'), 'should include BREAK');
		assert.ok(allMatch.includes('CONTINUE'), 'should include CONTINUE');
		assert.ok(allMatch.includes('ECHO'), 'should include ECHO');
		assert.ok(allMatch.includes('EXPRESSION'), 'should include EXPRESSION');
		assert.ok(allMatch.includes('RANDOM'), 'should include RANDOM');
		assert.ok(allMatch.includes('ONE_BUTTON_DIALOG'), 'should include ONE_BUTTON_DIALOG');
		assert.ok(allMatch.includes('TWO_BUTTON_DIALOG'), 'should include TWO_BUTTON_DIALOG');
		assert.ok(allMatch.includes('CONFIRM_DIALOG'), 'should include CONFIRM_DIALOG');
		assert.ok(allMatch.includes('INPUT_DIALOG'), 'should include INPUT_DIALOG');
		assert.ok(allMatch.includes('AUTO_ERROR_HANDLE_ENABLE'), 'should include AUTO_ERROR_HANDLE_ENABLE');
		assert.ok(allMatch.includes('AUTO_ERROR_HANDLE_ANCHOR'), 'should include AUTO_ERROR_HANDLE_ANCHOR');
		assert.ok(allMatch.includes('INI_VAR_SPACE_ENABLE'), 'should include INI_VAR_SPACE_ENABLE');
		assert.ok(allMatch.includes('TAGDB_VAR_SPACE_ENABLE'), 'should include TAGDB_VAR_SPACE_ENABLE');
		assert.ok(allMatch.includes('TAGDB_VAR_SPACE_NAME'), 'should include TAGDB_VAR_SPACE_NAME');
		assert.ok(allMatch.includes('TAGDB_GET_VALUE'), 'should include TAGDB_GET_VALUE');
		assert.ok(allMatch.includes('TAGDB_SET_VALUE'), 'should include TAGDB_SET_VALUE');
		assert.ok(allMatch.includes('TAGDB_SWEEP'), 'should include TAGDB_SWEEP');
		assert.ok(allMatch.includes('TAGDB_WAIT_FOR_EXPRESSION'), 'should include TAGDB_WAIT_FOR_EXPRESSION');
		assert.ok(allMatch.includes('TAGDB_START_MONITOR_EXPRESSION'), 'should include TAGDB_START_MONITOR_EXPRESSION');
		assert.ok(allMatch.includes('TAGDB_STOP_MONITOR_EXPRESSION'), 'should include TAGDB_STOP_MONITOR_EXPRESSION');
		assert.ok(allMatch.includes('TAGDB_WAIT_FOR_STABLE'), 'should include TAGDB_WAIT_FOR_STABLE');
	});
});

suite('Variable Reference Tests', () => {


	test('variable-reference repository entry exists with two sub-patterns', () => {
		const grammar = loadGrammar();
		const vr = grammar.repository['variable-reference'];
		assert.ok(vr, 'variable-reference repository entry should exist');
		assert.ok(Array.isArray(vr.patterns!), 'variable-reference should have patterns array');
		assert.strictEqual(vr.patterns!.length, 2, 'variable-reference should have 2 sub-patterns (with default and simple)');
	});

	test('variable-reference patterns capture ${var} and ${var:default}', () => {
		const grammar = loadGrammar();
		const vr = grammar.repository['variable-reference'];
		const withDefault = vr.patterns![0];
		const simple = vr.patterns![1];

		assert.ok(withDefault.match!.includes(':'), 'first pattern should handle colon separator for default value');
		assert.ok(withDefault.captures!['2'].name.includes('variable'), 'capture 2 should be variable scope');
		assert.ok(withDefault.captures!['4'].name.includes('string'), 'capture 4 should be string scope (default value)');

		assert.ok(simple.match, 'simple pattern should have a match');
		assert.ok(simple.captures!['2'].name.includes('variable'), 'capture 2 should be variable scope');
	});
});


suite('Return Value and Range Operator Tests', () => {

test('return-value-save repository entry exists', () => {
const grammar = loadGrammar();
const rv = grammar.repository['return-value-save'];
assert.ok(rv, 'return-value-save repository entry should exist');
assert.ok(rv.match, 'return-value-save should have a match pattern');
assert.ok(rv.match.includes('=>'), 'return-value-save should match => operator');
assert.ok(rv.captures!['1'].name.includes('return-save'), 'capture 1 should be return-save operator scope');
assert.ok(rv.captures!['2'].name.includes('variable'), 'capture 2 should be variable scope');
});

test('range-operator repository entry exists with ∈ and !∈', () => {
const grammar = loadGrammar();
const ro = grammar.repository['range-operator'];
assert.ok(ro, 'range-operator repository entry should exist');
assert.ok(Array.isArray(ro.patterns), 'range-operator should have patterns array');
assert.strictEqual(ro.patterns.length, 2, 'range-operator should have 2 sub-patterns');
assert.ok(ro.patterns[0].match!.includes('!∈'), 'first pattern should match !∈ (not-in-range)');
assert.ok(ro.patterns[1].match === '∈', 'second pattern should match ∈ (in-range)');
assert.ok(ro.patterns[0].name!.includes('range-not-in'), 'not-in-range scope should include range-not-in');
assert.ok(ro.patterns[1].name!.includes('range-in'), 'in-range scope should include range-in');
});
});

suite('Conditional Jump Tests', () => {

test('conditional-jump repository entry exists with 2 sub-patterns', () => {
const grammar = loadGrammar();
const cj = grammar.repository['conditional-jump'];
assert.ok(cj, 'conditional-jump repository entry should exist');
assert.ok(Array.isArray(cj.patterns), 'conditional-jump should have patterns array');
assert.strictEqual(cj.patterns!.length, 2, 'conditional-jump should have 2 sub-patterns');
});

test('conditional-jump patterns distinguish ?? (error) from ?expr? (conditional)', () => {
const grammar = loadGrammar();
const cj = grammar.repository['conditional-jump'];
const condPattern = cj.patterns![0];
const errorPattern = cj.patterns![1];

assert.ok(condPattern.match!.includes('[^?]'), 'first pattern captures expression between ? ... ?');
assert.ok(condPattern.captures!['1'].name.includes('conditional-jump'), 'first capture should be conditional-jump operator');
assert.ok(condPattern.captures!['2'].name.includes('expression'), 'second capture should be expression');

assert.ok(errorPattern.match!.includes('\\?\\?'), 'second pattern should match ??');
assert.ok(errorPattern.captures!['1'].name.includes('error-jump'), 'error-jump capture should have error-jump scope');
});
});

suite('Pre-definition Section Tests', () => {

test('predef-section repository entry exists with 2 sub-patterns', () => {
const grammar = loadGrammar();
const ps = grammar.repository['predef-section'];
assert.ok(ps, 'predef-section repository entry should exist');
assert.ok(Array.isArray(ps.patterns), 'predef-section should have patterns array');
assert.strictEqual(ps.patterns!.length, 2, 'predef-section should have 2 sub-patterns (header and key-value)');
});

test('predef-section header pattern recognizes known sections', () => {
const grammar = loadGrammar();
const ps = grammar.repository['predef-section'];
const headerPattern = ps.patterns![0];
assert.ok(headerPattern.match, 'section header pattern should have a match');
assert.ok(headerPattern.match!.includes('CommandAlias'), 'should recognize CommandAlias');
assert.ok(headerPattern.match!.includes('CMD-Alias'), 'should recognize CMD-Alias');
assert.ok(headerPattern.match!.includes('AUTO_ERROR_HANDLE'), 'should recognize AUTO_ERROR_HANDLE');
assert.ok(headerPattern.match!.includes('INI_VAR_SPACE'), 'should recognize INI_VAR_SPACE');
assert.ok(headerPattern.match!.includes('TAGDB_VAR_SPACE'), 'should recognize TAGDB_VAR_SPACE');
assert.ok(headerPattern.captures!['2'].name.includes('entity.name.section'), 'section name capture should use entity.name.section scope');
});

test('predef-section key-value pattern captures key, = and value', () => {
const grammar = loadGrammar();
const ps = grammar.repository['predef-section'];
const kvPattern = ps.patterns![1];
assert.ok(kvPattern.match, 'key-value pattern should have a match');
assert.ok(kvPattern.captures!['1'].name.includes('variable'), 'capture 1 should be variable (key)');
assert.ok(kvPattern.captures!['2'].name.includes('assignment'), 'capture 2 should be assignment operator');
assert.ok(kvPattern.captures!['3'].name.includes('string'), 'capture 3 should be string (value)');
});
});

suite('Grammar Integration Smoke Tests', () => {

function matchesFirst(patternMatch: string, text: string): boolean {
try {
// Strip Oniguruma inline flags (e.g. (?i)) which are not supported by JS RegExp;
// we already pass the 'i' flag explicitly so case-insensitivity is preserved.
const jsPattern = patternMatch.replace(/^\(\?[imsx]+\)/, '');
return new RegExp(jsPattern, 'i').test(text);
} catch {
return false;
}
}

test('control-flow simple tags match correctly', () => {
const grammar = loadGrammar();
const cf = grammar.repository['control-flow'];
const simpleRe = new RegExp(cf.patterns![0].match!);
assert.ok(simpleRe.test('<else>'), '<else> should match simple control-flow');
assert.ok(simpleRe.test('<end_if>'), '<end_if> should match simple control-flow');
assert.ok(simpleRe.test('<end_while>'), '<end_while> should match simple control-flow');
assert.ok(simpleRe.test('<do_while>'), '<do_while> should match simple control-flow');
assert.ok(simpleRe.test('<end_foreach>'), '<end_foreach> should match simple control-flow');
assert.ok(!simpleRe.test('<if var>5>'), '<if var>5> should NOT match simple control-flow');
});

test('control-flow include directive matches paths', () => {
const grammar = loadGrammar();
const cf = grammar.repository['control-flow'];
const includeRe = new RegExp(cf.patterns![1].match!);
assert.ok(includeRe.test('<include SEQ-PCB-Init.csmscript>'), 'should match include directive');
assert.ok(includeRe.test('<include path/to/sub.csmscript>'), 'should match include with path');
});

test('anchor pattern matches label identifiers', () => {
const grammar = loadGrammar();
const re = new RegExp(grammar.repository['anchor'].match!);
assert.ok(re.test('<setup>'), 'should match <setup>');
assert.ok(re.test('<error_handler>'), 'should match <error_handler>');
assert.ok(re.test('<cleanup-123>'), 'should match <cleanup-123>');
});

test('builtin commands match case-insensitively', () => {
const grammar = loadGrammar();
const bc = grammar.repository['builtin-command'];
const allPatterns = bc.patterns!.map((p) => p.match!);
assert.ok(allPatterns.some((m) => matchesFirst(m, 'GOTO')), 'GOTO should match');
assert.ok(allPatterns.some((m) => matchesFirst(m, 'goto')), 'goto should match (case-insensitive)');
assert.ok(allPatterns.some((m) => matchesFirst(m, 'WAIT(ms)')), 'WAIT(ms) should match');
assert.ok(allPatterns.some((m) => matchesFirst(m, 'ECHO0')), 'ECHO0 should match');
assert.ok(allPatterns.some((m) => matchesFirst(m, 'TAGDB_SWEEP')), 'TAGDB_SWEEP should match');
});

test('variable-reference patterns match ${var} and ${var:default}', () => {
const grammar = loadGrammar();
const vr = grammar.repository['variable-reference'];
const withDefaultRe = new RegExp(vr.patterns![0].match!);
const simpleRe = new RegExp(vr.patterns![1].match!);
assert.ok(withDefaultRe.test('${UUT_SN:SN_UNKNOWN}'), 'should match ${UUT_SN:SN_UNKNOWN}');
assert.ok(simpleRe.test('${var}'), 'should match ${var}');
assert.ok(simpleRe.test('${retValue}'), 'should match ${retValue}');
});

test('return-value-save pattern matches => varname', () => {
const grammar = loadGrammar();
const re = new RegExp(grammar.repository['return-value-save'].match!);
assert.ok(re.test('=> returnValueVar'), 'should match => returnValueVar');
assert.ok(re.test('=> var1;var2;var3'), 'should match => var1;var2;var3 (multi-var)');
});

test('range-operator patterns match ∈ and !∈', () => {
const grammar = loadGrammar();
const ro = grammar.repository['range-operator'];
assert.ok(new RegExp(ro.patterns![0].match!).test('!∈'), '!∈ should match not-in-range');
assert.ok(new RegExp(ro.patterns![1].match!).test('∈'), '∈ should match in-range');
});

test('conditional-jump patterns match ?? goto and ?expr? goto', () => {
const grammar = loadGrammar();
const cj = grammar.repository['conditional-jump'];
assert.ok(new RegExp(cj.patterns![0].match!, 'i').test('?${val}<0.5? goto'), '?expr? goto should match');
assert.ok(new RegExp(cj.patterns![1].match!, 'i').test('?? goto'), '?? goto should match');
});

test('predef-section header matches known section names', () => {
const grammar = loadGrammar();
const ps = grammar.repository['predef-section'];
const re = new RegExp(ps.patterns![0].match!);
assert.ok(re.test('[CommandAlias]'), 'should match [CommandAlias]');
assert.ok(re.test('[CMD-Alias]'), 'should match [CMD-Alias]');
assert.ok(re.test('[AUTO_ERROR_HANDLE]'), 'should match [AUTO_ERROR_HANDLE]');
assert.ok(re.test('[INI_VAR_SPACE]'), 'should match [INI_VAR_SPACE]');
assert.ok(re.test('[TAGDB_VAR_SPACE]'), 'should match [TAGDB_VAR_SPACE]');
});
});
