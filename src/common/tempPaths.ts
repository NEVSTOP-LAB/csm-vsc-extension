// ---------------------------------------------------------------------------
// common/tempPaths.ts — 统一的临时目录路径工具
// ---------------------------------------------------------------------------
// 所有需要创建临时文件/目录的代码都应该通过此模块获取临时根目录，
// 严禁直接使用 os.tmpdir()。
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 缓存的临时根目录路径。
 * 首次调用时自动探测，后续直接返回缓存值。
 */
let cachedTempRoot: string | null = null;

/**
 * 获取临时文件根目录。
 *
 * 探测逻辑：
 * 1. 从当前文件所在目录向上查找 package.json，作为项目根目录。
 * 2. 如果项目根目录下存在 `src/` 目录（开发环境），使用 `<项目根>/tmp/`。
 * 3. 否则（生产/打包环境），使用系统临时目录 `os.tmpdir()`。
 *
 * 这样在本地开发时所有临时文件集中在 `tmp/` 下，便于查看和管理；
 * 在用户安装的扩展中则继续使用系统临时目录。
 *
 * @returns 临时根目录的绝对路径，保证以路径分隔符结尾。
 */
export function getTempRoot(): string {
    if (cachedTempRoot !== null) {
        return cachedTempRoot;
    }

    // 向上查找 package.json，定位项目根目录
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
        try {
            const pkgPath = path.join(dir, 'package.json');
            if (fs.existsSync(pkgPath)) {
                // 检查是否为开发环境（存在 src/ 目录）
                const srcDir = path.join(dir, 'src');
                if (fs.existsSync(srcDir)) {
                    cachedTempRoot = path.join(dir, 'tmp');
                } else {
                    // 生产环境（安装的扩展），使用系统临时目录
                    cachedTempRoot = os.tmpdir();
                }
                return cachedTempRoot;
            }
        } catch {
            // 权限不足等情况，继续向上查找
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }

    // 找不到 package.json，回退到系统临时目录
    cachedTempRoot = os.tmpdir();
    return cachedTempRoot;
}

/**
 * 重置缓存的临时根目录（仅用于测试）。
 */
export function resetTempRootCache(): void {
    cachedTempRoot = null;
}
