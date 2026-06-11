/**
 * performance.test.ts — 性能测试（100K 行 ≤ 1000ms）
 */

import * as assert from 'assert';
import { detectRepeatRegions } from '../../logFold/detector';
import { normalizeLine } from '../../logFold/normalizer';
import { DEFAULT_FOLD_OPTIONS, LineSignature } from '../../logFold/types';

suite('LogFold — Performance', () => {

    test('100K 行文档应在 1000ms 内完成检测', function (): void {
        this.timeout(10000); // Mocha timeout: 10s (以防万一)

        const n = 100_000;
        const lines: string[] = [];

        // 构造混合内容：~70% 重复行 + 30% 不同内容
        const uniqueMessages = [
            '2025/01/01 00:00:00.000 [State Change] ModuleA | Macro: Initialize',
            '2025/01/01 00:00:01.000 [State Change] ModuleA | Data: Initialize',
            '2025/01/01 00:00:02.000 [State Change] ModuleA | Initialize Core Data',
            '2025/01/01 00:00:03.000 [State Change] ModuleA | Data: Update Indicators',
            '2025/01/01 00:00:04.000 [State Change] ModuleB | Action: Refresh Check <- <loop>',
            '2025/01/01 00:00:05.000 [Register] ModuleB | Process Started@* >> API: Start',
            '2025/01/01 00:00:06.000 [User Log] tcp-client | Try to Connect PXI >> {localhost;6340;0}',
            '2025/01/01 00:00:07.000 [Status] ModuleC | Error Occurred >> [Error: -200088]',
            '2025/01/01 00:00:08.000 [Register] Framework | TCP Connected@* >> API: 允许开始测试',
            '2025/01/01 00:00:09.000 [Module Created] UI.Dashboard',
        ];

        for (let i = 0; i < n; i++) {
            // ~80% 重复模式, 20% 其他内容
            // 200 行块: 180 行相同 + 20 行不同 → 大量重复区
            if (i % 200 < 180) {
                // 每 200 行中有 180 行是重复的 3 种模板之一
                const t = Math.floor((i % 200) / 60);
                if (t === 0) {
                    lines.push(`2025/01/01 00:00:${String(i % 60).padStart(2, '0')}.000 [State Change] Pop | `);
                } else if (t === 1) {
                    lines.push(`2025/01/01 00:00:${String(i % 60).padStart(2, '0')}.000 [State Change] Record | `);
                } else {
                    lines.push(`2025/01/01 00:00:${String(i % 60).padStart(2, '0')}.000 [State Change] AlarmTrig | Alarm: StartAlarm`);
                }
            } else {
                lines.push(uniqueMessages[i % uniqueMessages.length] + ` #${i}`);
            }
        }

        // 预热：先算一次让 JIT 优化
        const warmSigs: Array<LineSignature | null> = [];
        for (let i = 0; i < Math.min(1000, lines.length); i++) {
            warmSigs.push(normalizeLine(lines[i]));
        }

        // ---- 开始计时 ----
        const start = performance.now();

        const signatures: Array<LineSignature | null> = [];
        for (const line of lines) {
            signatures.push(normalizeLine(line));
        }
        const regions = detectRepeatRegions(lines, signatures, DEFAULT_FOLD_OPTIONS);

        const elapsed = performance.now() - start;
        // ---- 计时结束 ----

        assert.ok(regions.length > 0, `应检测到至少一个重复区，实际: ${regions.length}`);
        assert.ok(
            elapsed <= 1000,
            `处理 ${n} 行应 ≤ 1000ms，实际: ${elapsed.toFixed(1)}ms`,
        );

        console.log(
            `[perf] ${n.toLocaleString()} 行 → ${elapsed.toFixed(1)}ms, ` +
            `${regions.length} 个折叠区`,
        );
    });

});
