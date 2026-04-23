import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension Test Suite', () => {
test('Sample test', () => {
assert.strictEqual(-1, [1, 2, 3].indexOf(5));
assert.strictEqual(-1, [1, 2, 3].indexOf(0));
});
});

suite('Language Definition Tests', () => {

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
interface GrammarShape { name?: string; scopeName?: string; patterns?: unknown[] }
const grammar = JSON.parse(raw) as GrammarShape;
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

test('package.json declares no commands, menus, or snippets', () => {
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
assert.strictEqual(pkg.contributes?.commands, undefined, 'contributes.commands should not be declared');
assert.strictEqual(pkg.contributes?.menus, undefined, 'contributes.menus should not be declared');
assert.strictEqual(pkg.contributes?.snippets, undefined, 'contributes.snippets should not be declared');
});

});
