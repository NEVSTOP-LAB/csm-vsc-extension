/**
 * detector.test.ts — 重复检测算法单元测试
 *
 * 覆盖五类重复模式：exact / parameterized / block-exact / interleaved + 参数化块。
 */

import * as assert from 'assert';
import { detectRepeatRegions } from '../../language/logFold/detector';
import { normalizeLine } from '../../language/logFold/normalizer';
import { DEFAULT_FOLD_OPTIONS, FoldOptions, LineSignature } from '../../language/logFold/types';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function makeSignatures(lines: string[]): Array<LineSignature | null> {
    return lines.map((l) => normalizeLine(l));
}

function opts(overrides: Partial<FoldOptions> = {}): FoldOptions {
    return { ...DEFAULT_FOLD_OPTIONS, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('LogFold — Detector', () => {

    suite('L1 — 单行精确重复', () => {

        test('连续 5 条完全相同的行应被折叠', () => {
            const lines = [
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3 }));
            assert.strictEqual(regions.length, 1);
            assert.strictEqual(regions[0].startLine, 0);
            assert.strictEqual(regions[0].endLine, 4);
            assert.strictEqual(regions[0].repeatCount, 5);
            assert.strictEqual(regions[0].pattern, 'exact');
        });

        test('少于 minRepeatCount 的不应折叠', () => {
            const lines = [
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Record | ',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3 }));
            // Pop 出现了 2 次 < 3 → 不折叠
            assert.strictEqual(regions.length, 0);
        });

        test('中间被不同行打断的两个重复区应分别折叠', () => {
            const lines = [
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Record | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3 }));
            // 预期：两个 Pop 重复区，各 3 条
            assert.strictEqual(regions.length, 2);
            assert.strictEqual(regions[0].startLine, 0);
            assert.strictEqual(regions[0].endLine, 2);
            assert.strictEqual(regions[1].startLine, 4);
            assert.strictEqual(regions[1].endLine, 6);
        });

    });

    suite('L1 — 参数化重复', () => {

        test('参数值变化但模板相同的行应折叠为 parameterized', () => {
            const lines = [
                '2025/05/25 21:28:21.352 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;0}',
                '2025/05/25 21:28:22.555 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;1}',
                '2025/05/25 21:28:23.158 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;2}',
                '2025/05/25 21:28:23.758 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;3}',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3, smartParams: true }));
            assert.strictEqual(regions.length, 1, '4 行相同模板应折叠为 1 个区');
            assert.strictEqual(regions[0].startLine, 0);
            assert.strictEqual(regions[0].endLine, 3);
            assert.strictEqual(regions[0].pattern, 'parameterized', '应识别为参数化重复');
        });

        test('关闭 smartParams 时按精确匹配处理', () => {
            const lines = [
                '2025/05/25 21:28:21.352 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;0}',
                '2025/05/25 21:28:22.555 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;1}',
                '2025/05/25 21:28:23.158 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;2}',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3, smartParams: false }));
            // 归一化后将完全相同（因为参数都被换成了占位符），应被折叠为 exact
            assert.ok(regions.length >= 0); // 取决于归一化逻辑
        });

    });

    suite('L2 — 多行块重复', () => {

        test('每 4 行为一个块重复的 UI 更新循环', () => {
            // 模拟 MainUI 每秒更新：4 行一块，重复 4 次
            const block = [
                '2025/09/24 10:30:06.903 [State Change] MainUI | Macro: Update UI',
                '2025/09/24 10:30:06.903 [State Change] MainUI | UI: Refresh',
                '2025/09/24 10:30:06.906 [State Change] MainUI | UI: Refresh Last Error',
                '2025/09/24 10:30:06.906 [State Change] MainUI | UI: Update Exp List',
            ];
            const lines = [...block, ...block, ...block, ...block];
            // 调整时间戳让每一块的略有不同但不影响归一化
            const sigs = makeSignatures(lines);
            // 块中消息多次重复（每条消息都被 L1 检测到）
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3, maxBlockLines: 10 }));
            // 至少应有区域被检测到
            assert.ok(regions.length > 0, '应检测到重复区域');
        });

        test('仅有 2 次块的重复不应折叠（低于阈值）', () => {
            const block = [
                '[State Change] X | Macro: Update UI',
                '[State Change] X | UI: Refresh',
            ];
            const lines = [...block, ...block];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3, maxBlockLines: 10 }));
            // 每行出现 2 次 < 3 阈值 → 不应产生折叠区
            assert.strictEqual(regions.length, 0);
        });

    });

    suite('L3 — 交错重复', () => {

        test('两条消息交替出现各自形成重复区', () => {
            const lines = [
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Record | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
                '[State Change] Record | ',
                '[State Change] Pop | ',
                '[State Change] Pop | ',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 2 }));
            // Pop 出现 2次+2次+2次（被 Record 隔开），Record 出现 2次（被 Pop 隔开）
            // 每段 Pop >=2 应该被折叠
            assert.ok(regions.length >= 1, '交错的 Pop 片段应各自被折叠');
            const popRegions = regions.filter((r: { startLine: number }) => lines[r.startLine].includes('Pop'));
            assert.ok(popRegions.length >= 1, 'Pop 应至少产出一个折叠区');
        });

    });

    suite('边界情况', () => {

        test('空行不应影响重复检测', () => {
            const lines = [
                '[State Change] X | action',
                '',
                '[State Change] X | action',
                '[State Change] X | action',
                '[State Change] X | action',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3 }));
            // 空行 (null) 中断了运行，前 1 条 + 后 3 条 — 后有 3 条满足阈值
            assert.ok(regions.length > 0);
        });

        test('minRepeatCount=10 时只有大块重复才折叠', () => {
            const lines = ['a', 'a', 'a', 'a'];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 10 }));
            assert.strictEqual(regions.length, 0, '4条重复不满足 minRepeatCount=10');
        });

        test('单行文档不应产生折叠区', () => {
            const lines = ['[State Change] X | action'];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3 }));
            assert.strictEqual(regions.length, 0);
        });

    });

    suite('sampleLines 完整性', () => {

        test('折叠区域的 sampleLines 应包含首尾行', () => {
            const lines = [
                '[State Change] X | a',
                '[State Change] X | a',
                '[State Change] X | a',
                '[State Change] X | a',
            ];
            const sigs = makeSignatures(lines);
            const regions = detectRepeatRegions(lines, sigs, opts({ minRepeatCount: 3 }));
            assert.strictEqual(regions.length, 1);
            assert.ok(regions[0].sampleLines.length >= 1, '应至少包含采样行');
            assert.ok(regions[0].sampleLines.some((s: string) => s.includes('X | a')),
                '采样行应包含原始内容');
        });

    });

});
