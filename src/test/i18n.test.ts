import * as assert from 'assert';
import { isChineseLanguage, localizeBundle, __setLanguageOverrideForTests } from '../i18n';
import type { LocalizedBundle } from '../i18n';

suite('i18n — language detection', () => {

    teardown(() => {
        // 重置语言覆盖，避免影响其他测试
        __setLanguageOverrideForTests(undefined);
    });

    test('默认返回非中文（模拟 VSCODE_NLS_CONFIG 为英文）', () => {
        __setLanguageOverrideForTests(undefined);
        // 在测试环境中 vscode.env.language 可能未设置，
        // 回退到 VSCODE_NLS_CONFIG 或 'en'
        assert.strictEqual(isChineseLanguage(), false);
    });

    test('zh-cn 覆盖返回中文', () => {
        __setLanguageOverrideForTests('zh-cn');
        assert.strictEqual(isChineseLanguage(), true);
    });

    test('zh-tw 覆盖返回中文', () => {
        __setLanguageOverrideForTests('zh-tw');
        assert.strictEqual(isChineseLanguage(), true);
    });

    test('en 覆盖返回英文', () => {
        __setLanguageOverrideForTests('en');
        assert.strictEqual(isChineseLanguage(), false);
    });

    test('en-us 覆盖返回英文', () => {
        __setLanguageOverrideForTests('en-us');
        assert.strictEqual(isChineseLanguage(), false);
    });
});

suite('i18n — localizeBundle', () => {
    const testBundle = {
        greeting: { en: 'Hello', zh: '你好' },
        farewell: { en: 'Goodbye', zh: '再见' },
        withParam: { en: 'Hello, {name}!', zh: '你好，{name}！' },
        multiParam: { en: '{greeting}, {name}!', zh: '{greeting}，{name}！' },
    } as const satisfies LocalizedBundle;

    teardown(() => {
        __setLanguageOverrideForTests(undefined);
    });

    suite('中文环境', () => {
        setup(() => {
            __setLanguageOverrideForTests('zh-cn');
        });

        test('简单键返回中文', () => {
            assert.strictEqual(localizeBundle(testBundle, 'greeting'), '你好');
        });

        test('另一个键返回中文', () => {
            assert.strictEqual(localizeBundle(testBundle, 'farewell'), '再见');
        });

        test('参数替换', () => {
            assert.strictEqual(
                localizeBundle(testBundle, 'withParam', { name: 'World' }),
                '你好，World！',
            );
        });

        test('多参数替换', () => {
            assert.strictEqual(
                localizeBundle(testBundle, 'multiParam', { greeting: 'Hi', name: 'Tom' }),
                'Hi，Tom！',
            );
        });

        test('缺少参数时保留占位符', () => {
            assert.strictEqual(
                localizeBundle(testBundle, 'withParam'),
                '你好，{name}！',
            );
        });

        test('多余参数不影响输出', () => {
            assert.strictEqual(
                localizeBundle(testBundle, 'greeting', { extra: 'ignored' }),
                '你好',
            );
        });
    });

    suite('英文环境', () => {
        setup(() => {
            __setLanguageOverrideForTests('en');
        });

        test('简单键返回英文', () => {
            assert.strictEqual(localizeBundle(testBundle, 'greeting'), 'Hello');
        });

        test('参数替换返回英文模板', () => {
            assert.strictEqual(
                localizeBundle(testBundle, 'withParam', { name: 'World' }),
                'Hello, World!',
            );
        });
    });
});
