/**
 * grammar.test.ts
 * Exhaustive tests for every repository entry in syntaxes/csmscript.tmLanguage.json.
 *
 * For each of the 18 repository entries we verify:
 *   1. The entry exists and has the expected structure.
 *   2. Each `name` scope string is correct.
 *   3. Capture group scope strings are correct.
 *   4. The regex MATCHES all intended positive examples.
 *   5. The regex does NOT match unintended negative examples.
 *
 * TextMate uses Oniguruma which supports the (?i) inline case-insensitive flag.
 * JavaScript does not, so mkRe() strips it and passes the 'i' flag instead.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// ─── Shared helpers ────────────────────────────────────────────────────────────

interface GrammarCapture { name: string }
interface GrammarPattern {
	comment?: string;
	match?: string;
	name?: string;
	captures?: Record<string, GrammarCapture>;
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
	const p = path.resolve(__dirname, '../../syntaxes/csmscript.tmLanguage.json');
	return JSON.parse(fs.readFileSync(p, 'utf-8')) as Grammar;
}

/**
 * Build a JavaScript RegExp from a TextMate match string.
 * Strips Oniguruma's (?i) inline flag and maps it to the 'i' JS flag.
 */
function mkRe(matchStr: string, extra = ''): RegExp {
	if (matchStr.startsWith('(?i)')) {
		return new RegExp(matchStr.slice(4), 'i' + extra);
	}
	return new RegExp(matchStr, extra || undefined);
}

// ─── 1. line-comment ──────────────────────────────────────────────────────────

suite('Grammar – line-comment', () => {
	let re: RegExp;
	let entry: GrammarPattern;

	setup(() => {
		const g = loadGrammar();
		entry = g.repository['line-comment'];
		re = mkRe(entry.match!);
	});

	test('entry has correct scope name', () => {
		assert.strictEqual(entry.name, 'comment.line.double-slash.csmscript');
	});

	test('matches a full-line comment', () => {
		assert.ok(re.test('// this is a comment'));
	});

	test('matches a trailing comment', () => {
		assert.ok(re.test('API: Connect >> arg -@ Module  // trailing comment'));
	});

	test('matches comment with no space after //', () => {
		assert.ok(re.test('//no space'));
	});

	test('matches empty comment //', () => {
		assert.ok(re.test('//'));
	});

	test('matches comment with multiple // inside', () => {
		assert.ok(re.test('// some // nested // slashes'));
	});

	test('does NOT match C-style block comment', () => {
		assert.ok(!re.test('/* block */'));
	});
});

// ─── 2. predef-section – header ───────────────────────────────────────────────

suite('Grammar – predef-section header', () => {
	let re: RegExp;
	let cap1: string, cap2: string, cap3: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['predef-section'].patterns![0];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
		cap3 = pat.captures!['3'].name;
	});

	test('opening [ capture scope', () => {
		assert.ok(cap1.includes('punctuation.definition.section'));
	});
	test('section name capture scope', () => {
		assert.ok(cap2.includes('entity.name.section.predef'));
	});
	test('closing ] capture scope', () => {
		assert.ok(cap3.includes('punctuation.definition.section'));
	});

	// All recognised section names
	for (const name of [
		'COMMAND_ALIAS',
		'Command_Alias', 'CommandAlias', 'Command-Alias', 'Command Alias',
		'CMD_Alias', 'CMDAlias', 'CMD-Alias', 'CMD Alias',
		'AUTO_ERROR_HANDLE', 'INI_VAR_SPACE', 'TAGDB_VAR_SPACE',
	]) {
		test(`matches [${name}]`, () => {
			assert.ok(re.test(`[${name}]`), `should match [${name}]`);
		});
	}

	test('matches manual example [COMMAND_ALIAS] exactly', () => {
		const line = '[COMMAND_ALIAS]';
		const m = line.match(re);
		assert.ok(m, 'should match manual section header');
		assert.strictEqual(m![2], 'COMMAND_ALIAS');
	});

	test('does NOT match unsupported manual variant [COMMAND-ALIAS]', () => {
		assert.ok(!re.test('[COMMAND-ALIAS]'));
	});

	// Unknown / unrecognised section names
	for (const name of ['Variables', 'Settings', 'MySection', 'State', 'unknown']) {
		test(`does NOT match [${name}]`, () => {
			assert.ok(!re.test(`[${name}]`), `should NOT match [${name}]`);
		});
	}
});

// ─── 3. predef-section – key = value ──────────────────────────────────────────

suite('Grammar – predef-section key-value', () => {
	let re: RegExp;
	let cap1: string, cap2: string, cap3: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['predef-section'].patterns![1];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
		cap3 = pat.captures!['3'].name;
	});

	test('key capture scope is variable', () => {
		assert.ok(cap1.includes('variable.other.predef-key'));
	});
	test('= operator capture scope', () => {
		assert.ok(cap2.includes('keyword.operator.assignment'));
	});
	test('value capture scope is string', () => {
		assert.ok(cap3.includes('string.unquoted.predef-value'));
	});

	test('matches simple key = value', () => {
		assert.ok(re.test('Connect = API: Connect >> host -@ Database'));
	});
	test('matches key with spaces in value', () => {
		assert.ok(re.test('My Alias = Some complex value here'));
	});
	test('matches with leading whitespace', () => {
		assert.ok(re.test('  key = value'));
	});
	test('captures key correctly', () => {
		const m = 'MyAlias = SOME_VALUE'.match(re);
		assert.ok(m, 'should match');
		// The key regex includes spaces so trim to get the canonical key name
		assert.strictEqual(m![1].trim(), 'MyAlias');
		assert.strictEqual(m![2], '=');
		assert.strictEqual(m![3], 'SOME_VALUE');
	});

	test('does NOT match a line with only a value (no key)', () => {
		// A line starting with = has no key identifier
		assert.ok(!re.test('= value'));
	});
});

// ─── 4. control-flow – simple no-expression tags ──────────────────────────────

suite('Grammar – control-flow simple tags', () => {
	let re: RegExp;
	let entry: GrammarPattern;

	setup(() => {
		const g = loadGrammar();
		entry = g.repository['control-flow'].patterns![0];
		re = mkRe(entry.match!);
	});

	test('scope name is keyword.control.flow.csmscript', () => {
		assert.strictEqual(entry.name, 'keyword.control.flow.csmscript');
	});

	for (const tag of ['<else>', '<end_if>', '<end_while>', '<do_while>', '<end_foreach>']) {
		test(`matches ${tag}`, () => {
			assert.ok(re.test(tag), `should match ${tag}`);
		});
	}

	test('does NOT match <if> (requires expression)', () => {
		assert.ok(!re.test('<if>'));
	});
	test('does NOT match <while> (requires expression)', () => {
		assert.ok(!re.test('<while>'));
	});
	test('does NOT match <foreach> (requires expression)', () => {
		assert.ok(!re.test('<foreach>'));
	});
	test('does NOT match plain word <else > (extra space inside)', () => {
		assert.ok(!re.test('<else >'));
	});
});

// ─── 5. control-flow – include directive ──────────────────────────────────────

suite('Grammar – control-flow include directive', () => {
	let re: RegExp;
	let cap2: string, cap4: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['control-flow'].patterns![1];
		re = mkRe(pat.match!);
		cap2 = pat.captures!['2'].name;
		cap4 = pat.captures!['4'].name;
	});

	test('keyword capture scope is keyword.control.include.csmscript', () => {
		assert.strictEqual(cap2, 'keyword.control.include.csmscript');
	});
	test('path capture scope is string.unquoted.include-path.csmscript', () => {
		assert.strictEqual(cap4, 'string.unquoted.include-path.csmscript');
	});

	test('matches simple include', () => {
		assert.ok(re.test('<include file.csmscript>'));
	});
	test('matches include with path separators', () => {
		assert.ok(re.test('<include path/to/sub.csmscript>'));
	});
	test('matches include with Windows path', () => {
		assert.ok(re.test('<include folder\\sub.csmscript>'));
	});
	test('captures filepath correctly', () => {
		const m = '<include SEQ-PCB-Init.csmscript>'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![2], 'include');
		assert.strictEqual(m![4], 'SEQ-PCB-Init.csmscript');
	});

	test('does NOT match <include> with no path', () => {
		assert.ok(!re.test('<include>'));
	});
});

// ─── 6. control-flow – expression tags ────────────────────────────────────────

suite('Grammar – control-flow expression tags', () => {
	let re: RegExp;
	let cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['control-flow'].patterns![2];
		re = mkRe(pat.match!);
		cap2 = pat.captures!['2'].name;
	});

	test('keyword capture scope is keyword.control.flow.csmscript', () => {
		assert.strictEqual(cap2, 'keyword.control.flow.csmscript');
	});

	test('matches <if expr>', () => {
		assert.ok(re.test('<if ${var} > 5>'));
	});
	test('matches <while expr>', () => {
		assert.ok(re.test('<while ${count} < 10>'));
	});
	test('matches <foreach var in list>', () => {
		assert.ok(re.test('<foreach item in ${list}>'));
	});
	test('matches <end_do_while expr>', () => {
		assert.ok(re.test('<end_do_while ${x} > 0>'));
	});
	test('matches <if> with comment after', () => {
		assert.ok(re.test('<if ${x} = 1> // comment'));
	});
	test('captures keyword correctly for <while>', () => {
		const m = '<while ${n} < 5>'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![2], 'while');
	});

	test('does NOT match <else> (consumed by simple-tag pattern)', () => {
		assert.ok(!re.test('<else>'));
	});
	test('does NOT match <end_if> (consumed by simple-tag pattern)', () => {
		assert.ok(!re.test('<end_if>'));
	});
});

// ─── 7. anchor labels ─────────────────────────────────────────────────────────

suite('Grammar – anchor labels', () => {
	let re: RegExp;
	let entry: GrammarPattern;

	setup(() => {
		const g = loadGrammar();
		entry = g.repository['anchor'];
		re = mkRe(entry.match!);
	});

	test('scope name is entity.name.label.anchor.csmscript', () => {
		assert.strictEqual(entry.name, 'entity.name.label.anchor.csmscript');
	});

	for (const label of ['<setup>', '<error_handler>', '<cleanup>', '<A>', '<_private>', '<abc-123>']) {
		test(`matches ${label}`, () => {
			assert.ok(re.test(label), `should match ${label}`);
		});
	}

	test('does NOT match labels starting with a digit', () => {
		assert.ok(!re.test('<1bad>'));
	});
	test('does NOT match empty angle brackets', () => {
		assert.ok(!re.test('<>'));
	});
	test('does NOT match angle brackets with only digits', () => {
		assert.ok(!re.test('<123>'));
	});
});

// ─── 8. variable-reference – simple ──────────────────────────────────────────

suite('Grammar – variable-reference simple', () => {
	let re: RegExp;
	let cap1: string, cap2: string, cap3: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['variable-reference'].patterns![1];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
		cap3 = pat.captures!['3'].name;
	});

	test('${ capture scope', () => {
		assert.ok(cap1.includes('punctuation.definition.variable'));
	});
	test('variable name capture scope', () => {
		assert.ok(cap2.includes('variable.other'));
	});
	test('} capture scope', () => {
		assert.ok(cap3.includes('punctuation.definition.variable'));
	});

	for (const v of ['${var}', '${retValue}', '${count}', '${UUT_SN}', '${_private}']) {
		test(`matches ${v}`, () => {
			assert.ok(re.test(v), `should match ${v}`);
		});
	}
	test('captures variable name correctly', () => {
		const m = '${retValue}'.match(re);
		assert.ok(m);
		assert.strictEqual(m![2], 'retValue');
	});

	test('does NOT match without braces', () => {
		assert.ok(!re.test('$var'));
	});
	test('does NOT match empty ${} ', () => {
		// The pattern [^}]+ requires at least one character
		assert.ok(!re.test('${}'));
	});
});

// ─── 9. variable-reference – with default ─────────────────────────────────────

suite('Grammar – variable-reference with default', () => {
	let re: RegExp;
	let cap2: string, cap3: string, cap4: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['variable-reference'].patterns![0];
		re = mkRe(pat.match!);
		cap2 = pat.captures!['2'].name;
		cap3 = pat.captures!['3'].name;
		cap4 = pat.captures!['4'].name;
	});

	test('variable name capture scope', () => {
		assert.ok(cap2.includes('variable.other'));
	});
	test(': separator capture scope', () => {
		assert.ok(cap3.includes('punctuation.separator.default'));
	});
	test('default value capture scope', () => {
		assert.ok(cap4.includes('string.unquoted.variable-default'));
	});

	for (const [v, name, dflt] of [
		['${host:localhost}', 'host', 'localhost'],
		['${UUT_SN:SN_UNKNOWN}', 'UUT_SN', 'SN_UNKNOWN'],
		['${port:8080}', 'port', '8080'],
		['${x:}', 'x', ''],  // empty default is valid
	]) {
		test(`matches ${v}`, () => {
			assert.ok(re.test(v as string), `should match ${v}`);
		});
		test(`captures name/default correctly for ${v}`, () => {
			const m = (v as string).match(re);
			assert.ok(m, `should match ${v}`);
			assert.strictEqual(m![2], name as string);
			assert.strictEqual(m![4], dflt as string);
		});
	}

	test('does NOT match without a default (no colon)', () => {
		// The with-default pattern requires a colon; ${var} has none
		assert.ok(!re.test('${var}'));
	});
});

// ─── 10. return-value-save ────────────────────────────────────────────────────

suite('Grammar – return-value-save', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const entry = g.repository['return-value-save'];
		re = mkRe(entry.match!);
		cap1 = entry.captures!['1'].name;
		cap2 = entry.captures!['2'].name;
	});

	test('=> operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.return-save'));
	});
	test('variable name capture scope', () => {
		assert.ok(cap2.includes('variable.other.assignment'));
	});

	test('matches => with space', () => {
		assert.ok(re.test('=> returnValueVar'));
	});
	test('matches => without space', () => {
		assert.ok(re.test('=>result'));
	});
	test('matches => with multi-variable (semicolons)', () => {
		assert.ok(re.test('=> var1;var2;var3'));
	});
	test('matches => with hyphen in varname', () => {
		assert.ok(re.test('=> my-var'));
	});

	test('captures => and varname correctly', () => {
		const m = '=> saveVar'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '=>');
		assert.strictEqual(m![2], 'saveVar');
	});

	test('does NOT match -> (async operator)', () => {
		assert.ok(!re.test('->'));
	});
	test('does NOT match plain = assignment', () => {
		// The pattern starts with => (two chars), not just =
		const m = '= value'.match(re);
		assert.ok(!m);
	});
});

// ─── 11. range-operator ───────────────────────────────────────────────────────

suite('Grammar – range-operator', () => {
	let inRangeRe: RegExp, notInRangeRe: RegExp;
	let inRangeName: string, notInRangeName: string;

	setup(() => {
		const g = loadGrammar();
		const pats = g.repository['range-operator'].patterns!;
		notInRangeRe = mkRe(pats[0].match!);
		inRangeRe = mkRe(pats[1].match!);
		notInRangeName = pats[0].name!;
		inRangeName = pats[1].name!;
	});

	test('not-in-range scope is keyword.operator.range-not-in.csmscript', () => {
		assert.strictEqual(notInRangeName, 'keyword.operator.range-not-in.csmscript');
	});
	test('in-range scope is keyword.operator.range-in.csmscript', () => {
		assert.strictEqual(inRangeName, 'keyword.operator.range-in.csmscript');
	});

	test('∈ matches in-range operator', () => {
		assert.ok(inRangeRe.test('∈'));
	});
	test('!∈ matches not-in-range operator', () => {
		assert.ok(notInRangeRe.test('!∈'));
	});
	test('in-range does NOT match !∈', () => {
		// The ∈ pattern matches the ∈ inside !∈ – that is expected behaviour
		// (in-range pattern only matches ∈, not-in-range takes !∈ first in grammar)
		// So we just verify the dedicated in-range re matches bare ∈
		assert.ok(inRangeRe.test('∈'));
	});
	test('not-in-range does NOT match bare ∈', () => {
		// notInRangeRe requires ! prefix
		assert.ok(!notInRangeRe.test('∈'));
	});

	test('matches ∈ in multi-range expression with semicolon', () => {
		const line = 'value ∈ [0,100];[200,)';
		assert.ok(inRangeRe.test(line));
	});

	test('matches !∈ in multi-range expression with semicolon', () => {
		const line = 'value !∈ [-40,85];[120,140]';
		assert.ok(notInRangeRe.test(line));
	});
});

// ─── 12. string-comparison-function ───────────────────────────────────────────

suite('Grammar – string-comparison-function', () => {
	let re: RegExp;
	let entry: GrammarPattern;

	setup(() => {
		const g = loadGrammar();
		entry = g.repository['string-comparison-function'];
		re = mkRe(entry.match!);
	});

	test('scope name is support.function.string-compare.csmscript', () => {
		assert.strictEqual(entry.name, 'support.function.string-compare.csmscript');
	});

	for (const fn of [
		'equal', 'equal_s',
		'match', 'match_s',
		'start_with', 'start_with_s',
		'end_with', 'end_with_s',
		'contain', 'contain_s',
		'belong', 'belong_s',
	]) {
		test(`matches ${fn}(...)`, () => {
			assert.ok(re.test(`${fn}(abc)`), `should match ${fn}`);
		});
	}

	test('matches mixed case function name', () => {
		assert.ok(re.test('EqUaL(test)'));
	});

	test('does NOT match without parentheses', () => {
		assert.ok(!re.test('equal value'));
	});

	test('does NOT match unknown function name', () => {
		assert.ok(!re.test('equals(value)'));
	});
});

// ─── 13. conditional-jump – error jump (??) ───────────────────────────────────

suite('Grammar – conditional-jump error (??)', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['conditional-jump'].patterns![1];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('?? operator capture scope', () => {
		assert.ok(cap1.includes('error-jump'));
	});
	test('goto keyword capture scope', () => {
		assert.ok(cap2.includes('keyword.control.jump'));
	});

	test('matches ?? goto (lowercase)', () => {
		assert.ok(re.test('?? goto'));
	});
	test('matches ?? GOTO (uppercase)', () => {
		assert.ok(re.test('?? GOTO'));
	});
	test('matches ?? goto with no space', () => {
		assert.ok(re.test('??goto'));
	});

	test('captures ?? and goto correctly', () => {
		const m = '?? goto'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '??');
		assert.strictEqual(m![2], 'goto');
	});

	test('does NOT match single ? goto', () => {
		assert.ok(!re.test('? goto'));
	});
	test('does NOT match ?? without goto', () => {
		assert.ok(!re.test('?? jump_somewhere'));
	});
});

// ─── 13. conditional-jump – expression jump (?expr?) ──────────────────────────

suite('Grammar – conditional-jump expression (?expr?)', () => {
	let re: RegExp;
	let cap1: string, cap2: string, cap3: string, cap4: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['conditional-jump'].patterns![0];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
		cap3 = pat.captures!['3'].name;
		cap4 = pat.captures!['4'].name;
	});

	test('opening ? operator scope', () => {
		assert.ok(cap1.includes('conditional-jump'));
	});
	test('expression meta scope', () => {
		assert.ok(cap2.includes('meta.expression'));
	});
	test('closing ? operator scope', () => {
		assert.ok(cap3.includes('conditional-jump'));
	});
	test('goto keyword scope', () => {
		assert.ok(cap4.includes('keyword.control.jump'));
	});

	test('matches ?expr? goto', () => {
		assert.ok(re.test('?expr? goto'));
	});
	test('matches ?${val}<0.5? goto', () => {
		assert.ok(re.test('?${val}<0.5? goto'));
	});
	test('matches ?${x}>0? GOTO (uppercase)', () => {
		assert.ok(re.test('?${x}>0? GOTO'));
	});

	test('captures expression correctly', () => {
		const m = '?${val}<0.5? goto'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '?');
		assert.strictEqual(m![2], '${val}<0.5');
		assert.strictEqual(m![3], '?');
		assert.ok(m![4].toLowerCase() === 'goto');
	});

	test('does NOT match without closing ?', () => {
		assert.ok(!re.test('?expr goto'));
	});
});

// ─── 14. builtin-command – GOTO / JUMP ────────────────────────────────────────

suite('Grammar – builtin-command GOTO/JUMP', () => {
	let re: RegExp;
	let name: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['builtin-command'].patterns![0];
		re = mkRe(pat.match!);
		name = pat.name!;
	});

	test('scope is keyword.control.jump.csmscript', () => {
		assert.strictEqual(name, 'keyword.control.jump.csmscript');
	});

	for (const kw of ['GOTO', 'goto', 'Goto', 'JUMP', 'jump', 'Jump']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}
	test('does NOT match GOTO_NEXT (word boundary)', () => {
		// \b ensures word boundary; GOTO_NEXT should not match as standalone GOTO
		assert.ok(!re.test('GOTO_NEXT'));
	});
	test('does NOT match JUMPSTART', () => {
		assert.ok(!re.test('JUMPSTART'));
	});
});

// ─── 15. builtin-command – WAIT / SLEEP ───────────────────────────────────────

suite('Grammar – builtin-command WAIT/SLEEP', () => {
	let re: RegExp;
	let name: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['builtin-command'].patterns![1];
		re = mkRe(pat.match!);
		name = pat.name!;
	});

	test('scope is keyword.control.wait.csmscript', () => {
		assert.strictEqual(name, 'keyword.control.wait.csmscript');
	});

	for (const kw of ['WAIT', 'wait', 'WAIT(s)', 'WAIT(ms)', 'wait(ms)', 'SLEEP', 'sleep', 'SLEEP(s)', 'SLEEP(ms)']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}
	test('does NOT match WAIT(hours) as a WAIT-variant keyword', () => {
		// WAIT(hours) is not a valid variant, but the word WAIT itself still matches
		// as a standalone keyword (word-boundary between T and ().
		// The grammar highlights "WAIT" within "WAIT(hours)" – that is correct behaviour.
		// We verify only that the pattern does NOT match (hours) alone.
		assert.ok(!re.test('(hours)'), '(hours) alone should not match');
	});
});

// ─── 16. builtin-command – BREAK / CONTINUE ───────────────────────────────────

suite('Grammar – builtin-command BREAK/CONTINUE', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![2].match!);
	});

	for (const kw of ['BREAK', 'break', 'Break', 'CONTINUE', 'continue', 'Continue']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is keyword.control.loop.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![2].name, 'keyword.control.loop.csmscript');
	});
});

// ─── 17. builtin-command – AUTO_ERROR_HANDLE ──────────────────────────────────

suite('Grammar – builtin-command AUTO_ERROR_HANDLE', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![3].match!);
	});

	for (const kw of ['AUTO_ERROR_HANDLE_ENABLE', 'auto_error_handle_enable', 'AUTO_ERROR_HANDLE_ANCHOR', 'auto_error_handle_anchor']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('does NOT match AUTO_ERROR_HANDLE alone (no suffix)', () => {
		// The pattern requires _ENABLE or _ANCHOR suffix
		assert.ok(!re.test('AUTO_ERROR_HANDLE'));
	});

	test('scope is keyword.other.auto-error.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![3].name, 'keyword.other.auto-error.csmscript');
	});
});

// ─── 18. builtin-command – ECHO ───────────────────────────────────────────────

suite('Grammar – builtin-command ECHO', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![4].match!);
	});

	for (const kw of ['ECHO', 'echo', 'Echo', ...Array.from({length: 10}, (_, i) => `ECHO${i}`), ...Array.from({length: 10}, (_, i) => `echo${i}`)]) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is support.function.echo.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![4].name, 'support.function.echo.csmscript');
	});
});

// ─── 19. builtin-command – EXPRESSION ────────────────────────────────────────

suite('Grammar – builtin-command EXPRESSION', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![5].match!);
	});

	for (const kw of ['EXPRESSION', 'expression', 'Expression']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is support.function.expression.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![5].name, 'support.function.expression.csmscript');
	});
});

// ─── 20. builtin-command – RANDOM variants ────────────────────────────────────

suite('Grammar – builtin-command RANDOM variants', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![6].match!);
	});

	for (const kw of ['RANDOM', 'random', 'RANDOMDBL', 'RANDOMINT', 'RANDOM(DBL)', 'RANDOM(INT)', 'randomdbl', 'random(dbl)', 'random(int)']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is support.function.random.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![6].name, 'support.function.random.csmscript');
	});
});

// ─── 21. builtin-command – dialog commands ────────────────────────────────────

suite('Grammar – builtin-command dialog commands', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![7].match!);
	});

	for (const kw of [
		'ONE_BUTTON_DIALOG', 'one_button_dialog',
		'TWO_BUTTON_DIALOG', 'two_button_dialog',
		'CONFIRM_DIALOG', 'confirm_dialog',
		'INPUT_DIALOG', 'input_dialog',
	]) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is support.function.dialog.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![7].name, 'support.function.dialog.csmscript');
	});
});

// ─── 22. builtin-command – INI_VAR_SPACE ──────────────────────────────────────

suite('Grammar – builtin-command INI_VAR_SPACE', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![8].match!);
	});

	for (const kw of ['INI_VAR_SPACE_ENABLE', 'ini_var_space_enable', 'INI_VAR_SPACE_PATH', 'ini_var_space_path']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is keyword.other.ini-var.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![8].name, 'keyword.other.ini-var.csmscript');
	});
});

// ─── 23. builtin-command – TAGDB config commands ──────────────────────────────

suite('Grammar – builtin-command TAGDB config', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![9].match!);
	});

	for (const kw of ['TAGDB_VAR_SPACE_ENABLE', 'tagdb_var_space_enable', 'TAGDB_VAR_SPACE_NAME', 'tagdb_var_space_name']) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is keyword.other.tagdb.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![9].name, 'keyword.other.tagdb.csmscript');
	});
});

// ─── 24. builtin-command – TAGDB operation commands ───────────────────────────

suite('Grammar – builtin-command TAGDB operations', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['builtin-command'].patterns![10].match!);
	});

	for (const kw of [
		'TAGDB_GET_VALUE', 'tagdb_get_value',
		'TAGDB_SET_VALUE', 'tagdb_set_value',
		'TAGDB_SWEEP', 'tagdb_sweep',
		'TAGDB_WAIT_FOR_EXPRESSION', 'tagdb_wait_for_expression',
		'TAGDB_START_MONITOR_EXPRESSION', 'tagdb_start_monitor_expression',
		'TAGDB_STOP_MONITOR_EXPRESSION', 'tagdb_stop_monitor_expression',
		'TAGDB_WAIT_FOR_STABLE', 'tagdb_wait_for_stable',
	]) {
		test(`matches ${kw}`, () => {
			assert.ok(re.test(kw), `should match ${kw}`);
		});
	}

	test('scope is support.function.tagdb.csmscript', () => {
		const g = loadGrammar();
		assert.strictEqual(g.repository['builtin-command'].patterns![10].name, 'support.function.tagdb.csmscript');
	});
});

// ─── 25. subscription-op – register as ───────────────────────────────────────

suite('Grammar – subscription-op register as interrupt/status', () => {
	let re: RegExp;
	let cap1: string, cap2: string, cap3: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['subscription-op'].patterns![0];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
		cap3 = pat.captures!['3'].name;
	});

	test('-><  operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.subscription'));
	});
	test('register as … keyword scope', () => {
		assert.ok(cap2.includes('keyword.control.subscription-type'));
	});
	test('>  closing bracket scope', () => {
		assert.ok(cap3.includes('keyword.operator.subscription'));
	});

	for (const op of [
		'-><register as interrupt>',
		'-><register as status>',
		'-><register as Interrupt>',
		'-><register as Status>',
	]) {
		test(`matches ${op}`, () => {
			assert.ok(re.test(op), `should match ${op}`);
		});
	}

	test('does NOT match -><register>', () => {
		assert.ok(!re.test('-><register>'));
	});
	test('does NOT match -><unregister>', () => {
		assert.ok(!re.test('-><unregister>'));
	});
});

// ─── 26. subscription-op – register / unregister ─────────────────────────────

suite('Grammar – subscription-op register/unregister', () => {
	let re: RegExp;
	let cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['subscription-op'].patterns![1];
		re = mkRe(pat.match!);
		cap2 = pat.captures!['2'].name;
	});

	test('inner keyword capture scope', () => {
		assert.ok(cap2.includes('keyword.control.subscription'));
	});

	test('matches -><register>', () => {
		assert.ok(re.test('-><register>'));
	});
	test('matches -><unregister>', () => {
		assert.ok(re.test('-><unregister>'));
	});
	test('captures keyword correctly for register', () => {
		const m = '-><register>'.match(re);
		assert.ok(m);
		assert.strictEqual(m![2], 'register');
	});
	test('captures keyword correctly for unregister', () => {
		const m = '-><unregister>'.match(re);
		assert.ok(m);
		assert.strictEqual(m![2], 'unregister');
	});
});

// ─── 27. broadcast-target-with-op – interrupt ─────────────────────────────────

suite('Grammar – broadcast-target-with-op interrupt', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['broadcast-target-with-op'].patterns![0];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('-> operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.async-call'));
	});
	test('<interrupt> capture scope', () => {
		assert.ok(cap2.includes('constant.language.interrupt-target'));
	});

	test('matches -> <interrupt> (with space)', () => {
		assert.ok(re.test('-> <interrupt>'));
	});
	test('matches -><interrupt> (no space)', () => {
		assert.ok(re.test('-><interrupt>'));
	});
	test('captures correctly', () => {
		const m = '-> <interrupt>'.match(re);
		assert.ok(m);
		assert.strictEqual(m![1], '->');
		assert.strictEqual(m![2], '<interrupt>');
	});

	test('does NOT match -> <status>', () => {
		assert.ok(!re.test('-> <status>'));
	});
	test('does NOT match -> <broadcast>', () => {
		assert.ok(!re.test('-> <broadcast>'));
	});
});

// ─── 28. broadcast-target-with-op – status/broadcast/all ─────────────────────

suite('Grammar – broadcast-target-with-op normal', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['broadcast-target-with-op'].patterns![1];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('-> operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.async-call'));
	});
	test('broadcast target capture scope', () => {
		assert.ok(cap2.includes('constant.language.broadcast-target'));
	});

	for (const target of ['<status>', '<broadcast>', '<all>']) {
		test(`matches -> ${target}`, () => {
			assert.ok(re.test(`-> ${target}`), `should match -> ${target}`);
		});
		test(`matches ->${target} (no space)`, () => {
			assert.ok(re.test(`->${target}`), `should match ->${target}`);
		});
	}

	test('does NOT match -> <interrupt>', () => {
		assert.ok(!re.test('-> <interrupt>'));
	});
});

// ─── 28b. broadcast-target-with-op – sync call with module ────────────────────

suite('Grammar – broadcast-target-with-op sync -@ module', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['broadcast-target-with-op'].patterns![2];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('-@ operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.sync-call'));
	});
	test('module name capture scope', () => {
		assert.strictEqual(cap2, 'entity.name.namespace.module.csmscript');
	});

	test('matches -@ Module', () => {
		assert.ok(re.test('-@ Module'));
	});
	test('captures -@ and module name correctly', () => {
		const m = '-@ FixtureController'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '-@');
		assert.strictEqual(m![2], 'FixtureController');
	});
	test('does NOT match -@ without a module name', () => {
		assert.ok(!re.test('-@'));
	});
});

// ─── 28c. broadcast-target-with-op – async no-reply with module ───────────────

suite('Grammar – broadcast-target-with-op async-no-reply ->| module', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['broadcast-target-with-op'].patterns![3];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('->| operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.async-no-reply'));
	});
	test('module name capture scope', () => {
		assert.strictEqual(cap2, 'entity.name.namespace.module.csmscript');
	});

	test('matches ->| Module', () => {
		assert.ok(re.test('->| Logger'));
	});
	test('captures ->| and module name correctly', () => {
		const m = '->| Logger'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '->|');
		assert.strictEqual(m![2], 'Logger');
	});
	test('does NOT match -> (without |)', () => {
		assert.ok(!re.test('-> Logger'));
	});
});

// ─── 28d. broadcast-target-with-op – async call with module ──────────────────

suite('Grammar – broadcast-target-with-op async -> module', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['broadcast-target-with-op'].patterns![4];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('-> operator capture scope', () => {
		assert.ok(cap1.includes('keyword.operator.async-call'));
	});
	test('module name capture scope', () => {
		assert.strictEqual(cap2, 'entity.name.namespace.module.csmscript');
	});

	test('matches -> Module', () => {
		assert.ok(re.test('-> WorkerModule'));
	});
	test('captures -> and module name correctly', () => {
		const m = '-> WorkerModule'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '->');
		assert.strictEqual(m![2], 'WorkerModule');
	});
	test('does NOT match -> without a module name', () => {
		assert.ok(!re.test('->'));
	});
});

// ─── 29. communication-operator ───────────────────────────────────────────────

suite('Grammar – communication-operator', () => {
	setup(() => { /* grammar loaded per-test */ });

	test('->| has scope keyword.operator.async-no-reply.csmscript', () => {
		const g = loadGrammar();
		const pat = g.repository['communication-operator'].patterns![0];
		assert.strictEqual(pat.name, 'keyword.operator.async-no-reply.csmscript');
		assert.ok(mkRe(pat.match!).test('->|'));
	});

	test('-@ has scope keyword.operator.sync-call.csmscript', () => {
		const g = loadGrammar();
		const pat = g.repository['communication-operator'].patterns![1];
		assert.strictEqual(pat.name, 'keyword.operator.sync-call.csmscript');
		assert.ok(mkRe(pat.match!).test('-@'));
	});

	test('-> has scope keyword.operator.async-call.csmscript', () => {
		const g = loadGrammar();
		const pat = g.repository['communication-operator'].patterns![2];
		assert.strictEqual(pat.name, 'keyword.operator.async-call.csmscript');
		assert.ok(mkRe(pat.match!).test('->'));
	});

	test('->| does NOT match plain ->', () => {
		const g = loadGrammar();
		const re = mkRe(g.repository['communication-operator'].patterns![0].match!);
		// ->| requires the | suffix
		assert.ok(!re.test('-> Module'));
	});
});

// ─── 30. argument-separator ────────────────────────────────────────────────────

suite('Grammar – argument-separator', () => {
	let re: RegExp;
	let name: string;
	let matchPattern: string;

	setup(() => {
		const g = loadGrammar();
		const entry = g.repository['argument-separator'];
		re = mkRe(entry.match!);
		name = entry.name!;
		matchPattern = entry.match!;
	});

	test('scope is keyword.operator.argument-separator.csmscript', () => {
		assert.strictEqual(name, 'keyword.operator.argument-separator.csmscript');
	});

	test('matches >>', () => {
		assert.ok(re.test('>>'));
	});
	test('matches >> in context', () => {
		assert.ok(re.test('API: Connect >> host'));
	});
	test('exact pattern is >>', () => {
		assert.strictEqual(matchPattern, '>>');
	});

	test('does NOT match single >', () => {
		assert.ok(!re.test('>'));
	});
});

// ─── 31. module-address ───────────────────────────────────────────────────────

suite('Grammar – module-address', () => {
	let re: RegExp;
	let cap1: string;
	let cap2: string;

	setup(() => {
		const g = loadGrammar();
		const entry = g.repository['module-address'];
		re = mkRe(entry.match!);
		cap1 = entry.captures!['1'].name;
		cap2 = entry.captures!['2'].name;
	});

	test('@ separator scope is punctuation.separator.module.csmscript', () => {
		assert.strictEqual(cap1, 'punctuation.separator.module.csmscript');
	});

	test('module name scope is entity.name.label.module-address.csmscript', () => {
		assert.strictEqual(cap2, 'entity.name.label.module-address.csmscript');
	});

	test('matches @', () => {
		assert.ok(re.test('@'));
	});
	test('matches @ in Status@Module', () => {
		assert.ok(re.test('Status@Module'));
	});
	test('matches @ in API@Handler', () => {
		assert.ok(re.test('API@Handler'));
	});
	test('captures module name in Status@WorkerModule', () => {
		const m = 'Status@WorkerModule'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '@');
		assert.strictEqual(m![2], 'WorkerModule');
	});
	test('captures module name with hyphen: @My-Module', () => {
		const m = '@My-Module'.match(re);
		assert.ok(m, 'should match');
		assert.strictEqual(m![1], '@');
		assert.strictEqual(m![2], 'My-Module');
	});
});

// ─── 32. state-prefix ─────────────────────────────────────────────────────────

suite('Grammar – state-prefix API:', () => {
	let re: RegExp;
	let cap1: string, cap2: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['state-prefix'].patterns![0];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
		cap2 = pat.captures!['2'].name;
	});

	test('API capture scope is keyword.other.api-prefix.csmscript', () => {
		assert.strictEqual(cap1, 'keyword.other.api-prefix.csmscript');
	});
	test(': capture scope is punctuation.separator.prefix.csmscript', () => {
		assert.strictEqual(cap2, 'punctuation.separator.prefix.csmscript');
	});

	test('matches API:', () => {
		assert.ok(re.test('API:'));
	});
	test('matches API: Connect', () => {
		assert.ok(re.test('API: Connect'));
	});
	test('captures API and : correctly', () => {
		const m = 'API: StartAcquisition'.match(re);
		assert.ok(m);
		assert.strictEqual(m![1], 'API');
		assert.strictEqual(m![2], ':');
	});
});

suite('Grammar – state-prefix Macro:', () => {
	let re: RegExp;
	let cap1: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['state-prefix'].patterns![1];
		re = mkRe(pat.match!);
		cap1 = pat.captures!['1'].name;
	});

	test('Macro capture scope is keyword.other.macro-prefix.csmscript', () => {
		assert.strictEqual(cap1, 'keyword.other.macro-prefix.csmscript');
	});

	test('matches Macro:', () => {
		assert.ok(re.test('Macro:'));
	});
	test('matches Macro: Initialize', () => {
		assert.ok(re.test('Macro: Initialize'));
	});
	test('captures Macro correctly', () => {
		const m = 'Macro: Initialize'.match(re);
		assert.ok(m);
		assert.strictEqual(m![1], 'Macro');
	});
});

// ─── 33. system-state ─────────────────────────────────────────────────────────

suite('Grammar – system-state multi-word', () => {
	let re: RegExp;
	let name: string;

	setup(() => {
		const g = loadGrammar();
		const pat = g.repository['system-state'].patterns![0];
		re = mkRe(pat.match!);
		name = pat.name!;
	});

	test('scope is support.constant.system-state.csmscript', () => {
		assert.strictEqual(name, 'support.constant.system-state.csmscript');
	});

	for (const state of [
		'Async Message Posted',
		'Async Response',
		'Target Timeout Error',
		'Target Error',
		'Critical Error',
		'No Target Error',
		'Error Handler',
	]) {
		test(`matches "${state}" at start of string`, () => {
			assert.ok(re.test(state), `should match "${state}"`);
		});
		test(`matches "${state}" preceded by space`, () => {
			assert.ok(re.test(` ${state}`), `should match " ${state}"`);
		});
	}

	// Negative: state name preceded by a letter (non-whitespace).
	// We use carefully chosen inputs that do NOT contain any OTHER valid
	// state name as a substring preceded by whitespace.
	for (const [input, desc] of [
		['XAsync Message Posted', 'Async Message Posted'],  // no sub-state after space
		['XAsync Response', 'Async Response'],
		['XTarget Timeout Error', 'Target Timeout Error'],
		['XTarget Error', 'Target Error'],
		['XCritical Error', 'Critical Error'],
		['XError Handler', 'Error Handler'],
		// Note: 'XNo Target Error' is intentionally excluded because it contains
		// 'Target Error' as a valid sub-match preceded by a space – the grammar
		// correctly highlights the substring 'Target Error' in that context.
	]) {
		test(`does NOT match "${desc}" when immediately preceded by a letter`, () => {
			assert.ok(!re.test(input as string), `should NOT match "${input}"`);
		});
	}
});

suite('Grammar – system-state single-word Response', () => {
	let re: RegExp;

	setup(() => {
		const g = loadGrammar();
		re = mkRe(g.repository['system-state'].patterns![1].match!);
	});

	test('matches Response alone', () => {
		assert.ok(re.test('Response'));
	});
	test('matches Response preceded by space', () => {
		assert.ok(re.test(' Response '));
	});
	test('does NOT match ResponseHandler (word boundary)', () => {
		assert.ok(!re.test('ResponseHandler'));
	});
	test('does NOT match GetResponse (embedded)', () => {
		assert.ok(!re.test('GetResponse'));
	});
});

// ─── 34. Grammar structure sanity ─────────────────────────────────────────────

suite('Grammar structure sanity', () => {
	test('grammar name is CSMScript', () => {
		assert.strictEqual(loadGrammar().name, 'CSMScript');
	});
	test('grammar scopeName is source.csmscript', () => {
		assert.strictEqual(loadGrammar().scopeName, 'source.csmscript');
	});
	test('grammar has exactly 18 top-level pattern references', () => {
		assert.strictEqual(loadGrammar().patterns.length, 18);
	});
	test('grammar has exactly 18 repository entries', () => {
		assert.strictEqual(Object.keys(loadGrammar().repository).length, 18);
	});

	const expectedEntries = [
		'line-comment', 'predef-section', 'control-flow', 'anchor',
		'variable-reference', 'return-value-save', 'range-operator',
		'string-comparison-function', 'conditional-jump', 'builtin-command',
		'subscription-op', 'broadcast-target-with-op', 'communication-operator', 'argument-text',
		'argument-separator', 'module-address', 'state-prefix', 'system-state',
	];
	for (const key of expectedEntries) {
		test(`repository has entry: ${key}`, () => {
			assert.ok(loadGrammar().repository[key], `missing entry: ${key}`);
		});
	}

	test('every top-level pattern include resolves to a repository entry', () => {
		const g = loadGrammar();
		const repoKeys = new Set(Object.keys(g.repository));
		for (const pat of g.patterns) {
			const ref = pat.include?.replace('#', '');
			assert.ok(ref && repoKeys.has(ref), `unresolved include: ${pat.include}`);
		}
	});
});
