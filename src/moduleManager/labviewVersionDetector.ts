/**
 * labviewVersionDetector.ts — 按优先级检测模块的 LabVIEW 开发版本
 *
 * 解析优先级：
 * 1. 目录标记文件 "DEV ENVIRONMENT LabVIEW XXXX[(64bit)]"（距离最近者优先）
 * 2. .lvproj 项目文件中的 LVVersion 属性（距离最近者优先）
 * 3. .lvlib 库文件中的 LVVersion 属性（距离最近者优先）
 * 4. .vi 二进制文件头中的版本信息（保底方案）
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * LabVIEW LVVersion 编码 → 可读版本字符串的映射表。
 *
 * 编码规则：十六进制字符串 "YYMMPPSS"
 *   YY = 主版本（08=8.x, 09=2009, 10=2010, ..., 25=2025）
 *   MM = 次版本（00=.0, 02=.2, 05=.5, 06=.6 等）
 *   PP = 平台标识（80=32-bit）
 *   SS = 服务包/build
 */
const LV_VERSION_MAP: Record<string, string> = {
    // 8.x 系列
    '08008000': 'LabVIEW 8.0',
    '08028000': 'LabVIEW 8.2',
    '08058000': 'LabVIEW 8.5',
    '08068000': 'LabVIEW 8.6',
    // 2009+
    '09008000': 'LabVIEW 2009',
    '10008000': 'LabVIEW 2010',
    '11008000': 'LabVIEW 2011',
    '12008000': 'LabVIEW 2012',
    '13008000': 'LabVIEW 2013',
    '14008000': 'LabVIEW 2014',
    '15008000': 'LabVIEW 2015',
    '16008000': 'LabVIEW 2016',
    '17008000': 'LabVIEW 2017',
    '18008000': 'LabVIEW 2018',
    '19008000': 'LabVIEW 2019',
    '20008000': 'LabVIEW 2020',
    '21008000': 'LabVIEW 2021',
    '22008000': 'LabVIEW 2022',
    '23008000': 'LabVIEW 2023',
    '24008000': 'LabVIEW 2024',
    '25008000': 'LabVIEW 2025',
};

/**
 * LVVersion 编码 → 显示格式（如 lv2020, lv2020(64bit)）
 */
const LV_DISPLAY_MAP: Record<string, string> = {
    // 8.x 系列
    '08008000': 'lv8.0',
    '08028000': 'lv8.2',
    '08058000': 'lv8.5',
    '08068000': 'lv8.6',
    // 2009+
    '09008000': 'lv2009',
    '10008000': 'lv2010',
    '11008000': 'lv2011',
    '12008000': 'lv2012',
    '13008000': 'lv2013',
    '14008000': 'lv2014',
    '15008000': 'lv2015',
    '16008000': 'lv2016',
    '17008000': 'lv2017',
    '18008000': 'lv2018',
    '19008000': 'lv2019',
    '20008000': 'lv2020',
    '21008000': 'lv2021',
    '22008000': 'lv2022',
    '23008000': 'lv2023',
    '24008000': 'lv2024',
    '25008000': 'lv2025',
};

/** "DEV ENVIRONMENT" 标记文件的文件名前缀 */
const DEV_ENV_PREFIX = 'DEV ENVIRONMENT';

/** 支持的 LVVersion 字节模式匹配正则 */
const LV_VERSION_PATTERN = /\b[0-9a-fA-F]{8}\b/;

/**
 * BCD（Binary-Coded Decimal）解码：将一个十六进制字节解码为十进制数。
 * 例如 0x20 → 20, 0x14 → 14, 0x08 → 8。
 */
function bcdDecode(hexByte: number): number {
    return ((hexByte >> 4) * 10) + (hexByte & 0x0F);
}

/**
 * 将 LVVersion 编码字符串解码为可读版本。
 * 优先查表，查不到则尝试根据编码规则推算。
 */
export function decodeLvVersion(lvVersionHex: string): string | undefined {
    const key = lvVersionHex.toUpperCase();
    if (LV_VERSION_MAP[key]) {
        return LV_VERSION_MAP[key];
    }

    // 尝试根据编码规则推算
    if (!/^[0-9a-fA-F]{8}$/.test(lvVersionHex)) {
        return undefined;
    }

    const yy = bcdDecode(parseInt(key.substring(0, 2), 16));
    const mm = bcdDecode(parseInt(key.substring(2, 4), 16));
    const is64Bit = (parseInt(key.substring(6, 8), 16) & 0x40) !== 0;

    if (yy < 8 || yy > 99) {
        return undefined;
    }

    const yearLabel = yy <= 8 ? `${yy}` : `20${yy.toString().padStart(2, '0')}`;
    const minorLabel = mm > 0 ? `.${mm}` : '';
    const bitLabel = is64Bit ? ' (64-bit)' : '';

    return `LabVIEW ${yearLabel}${minorLabel}${bitLabel}`;
}

/**
 * 将 LVVersion 编码转换为显示格式（如 lv2020）。
 */
export function getLvVersionDisplay(lvVersionHex: string): string | undefined {
    const key = lvVersionHex.toUpperCase();
    if (LV_DISPLAY_MAP[key]) {
        return LV_DISPLAY_MAP[key];
    }

    // 根据编码规则推算
    if (!/^[0-9a-fA-F]{8}$/.test(lvVersionHex)) {
        return undefined;
    }

    const yy = bcdDecode(parseInt(key.substring(0, 2), 16));
    const mm = bcdDecode(parseInt(key.substring(2, 4), 16));
    const is64Bit = (parseInt(key.substring(6, 8), 16) & 0x40) !== 0;

    if (yy < 8 || yy > 99) {
        return undefined;
    }

    let display: string;
    if (yy <= 9) {
        display = `lv${yy}.${mm}`;
    } else {
        display = `lv20${yy.toString().padStart(2, '0')}`;
    }

    if (is64Bit) {
        display += '(64bit)';
    }

    return display;
}

/**
 * 从目录标记文件名中解析 LabVIEW 版本显示字符串。
 *
 * 支持格式：
 *   "DEV ENVIRONMENT LabVIEW 2020"      → "lv2020"
 *   "DEV ENVIRONMENT LabVIEW 2020(64bit)" → "lv2020(64bit)"
 */
export function parseDevEnvironmentFileName(fileName: string): string | undefined {
    if (!fileName.startsWith(DEV_ENV_PREFIX)) {
        return undefined;
    }

    const suffix = fileName.slice(DEV_ENV_PREFIX.length).trim();

    // 匹配 "LabVIEW XXXX" 或 "LabVIEW XXXX(64bit)"
    const match = suffix.match(/^LabVIEW\s+(\d+(?:\.\d+)?)(?:\((\d+)bit\))?$/i);
    if (!match) {
        // 宽松匹配：尝试提取版本号
        const looseMatch = suffix.match(/(\d+(?:\.\d+)?)/);
        if (!looseMatch) {
            return undefined;
        }
        const version = looseMatch[1];
        const is64Bit = /64\s*bit/i.test(suffix);
        if (version.includes('.')) {
            return `lv${version}${is64Bit ? '(64bit)' : ''}`;
        }
        return `lv${version}${is64Bit ? '(64bit)' : ''}`;
    }

    const version = match[1];
    const is64Bit = match[2] === '64';

    if (version.includes('.')) {
        return `lv${version}${is64Bit ? '(64bit)' : ''}`;
    }
    return `lv${version}${is64Bit ? '(64bit)' : ''}`;
}

/**
 * 从 XML 内容中提取 LVVersion 属性值。
 * 支持 .lvproj 的 `<Project LVVersion="...">` 和 .lvlib 的 `<Library LVVersion="...">`。
 */
function extractLvVersionFromXml(xmlContent: string): string | undefined {
    const match = xmlContent.match(/LVVersion\s*=\s*"([0-9A-Fa-f]{8})"/);
    if (!match) {
        return undefined;
    }
    return match[1];
}

/**
 * 从 VI 二进制文件中提取 LVVersion。
 *
 * VI 文件使用 RSRC（Macintosh 资源分支）容器格式。
 * 通过解析 LVINLBVW 资源块并在其中扫描 LVVersion 字节模式来获取版本。
 */
async function extractLvVersionFromVi(viPath: string): Promise<string | undefined> {
    try {
        const fd = await fs.open(viPath, 'r');
        try {
            const headerBuf = Buffer.alloc(24);
            const { bytesRead } = await fd.read(headerBuf, 0, 24, 0);
            if (bytesRead < 24) {
                return undefined;
            }

            // 验证 RSRC 魔数 + LVINLBVW 类型
            const magic = headerBuf.toString('ascii', 0, 4);
            if (magic !== 'RSRC') {
                return undefined;
            }

            const typeStr = headerBuf.toString('ascii', 8, 16);
            if (typeStr !== 'LVINLBVW') {
                return undefined;
            }

            // 解析资源数据长度（offset 0x14, big-endian uint32）
            const dataLen = headerBuf.readUInt32BE(0x14);

            // 资源数据从 offset 0x18 开始
            const dataOffset = 0x18;
            const readLen = Math.min(dataLen + 64, 64 * 1024); // 最多读 64KB

            const dataBuf = Buffer.alloc(readLen);
            const { bytesRead: dataBytesRead } = await fd.read(dataBuf, 0, readLen, dataOffset);

            // 在资源数据中扫描 LVVersion 字节模式
            // 格式：BYTE0 BYTE1 0x80 BYTE3（其中 BYTE3 为 0x00 或 0x40）
            for (let i = 0; i < dataBytesRead - 3; i++) {
                const byte0 = dataBuf[i];
                const byte1 = dataBuf[i + 1];
                const byte2 = dataBuf[i + 2];
                const byte3 = dataBuf[i + 3];

                // LVVersion 特征：第3字节为 0x80，第4字节为 0x00 或 0x40
                // 第1字节在有效版本范围内（0x08-0x30）
                if (byte2 === 0x80
                    && (byte3 === 0x00 || byte3 === 0x40)
                    && byte0 >= 0x08 && byte0 <= 0x30
                    && byte1 >= 0x00 && byte1 <= 0x30) {
                    const lvVerHex = byte0.toString(16).padStart(2, '0')
                        + byte1.toString(16).padStart(2, '0')
                        + byte2.toString(16).padStart(2, '0')
                        + byte3.toString(16).padStart(2, '0');
                    if (LV_VERSION_MAP[lvVerHex.toUpperCase()] || decodeLvVersion(lvVerHex)) {
                        return lvVerHex;
                    }
                }
            }

            return undefined;
        } finally {
            await fd.close();
        }
    } catch {
        return undefined;
    }
}

/**
 * 在指定目录下查找第一个匹配 glob 模式的文件。
 */
async function findFirstFile(dirPath: string, pattern: RegExp): Promise<string | undefined> {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && pattern.test(entry.name)) {
                return path.join(dirPath, entry.name);
            }
        }
    } catch {
        // 目录不可读，跳过
    }
    return undefined;
}

/**
 * 从当前目录向上遍历祖先目录，查找"DEV ENVIRONMENT"标记文件。
 * 返回距离当前目录最近的匹配结果。
 */
async function findDevEnvironmentFile(moduleDirPath: string): Promise<string | undefined> {
    let currentDir = path.resolve(moduleDirPath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const result = await findFirstFile(currentDir, /^DEV ENVIRONMENT/i);
        if (result) {
            return result;
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) {
            break;
        }
        currentDir = parent;
    }

    // 检查根目录
    const rootResult = await findFirstFile(root, /^DEV ENVIRONMENT/i);
    return rootResult;
}

/**
 * 从当前目录向上遍历，查找最近的 .lvproj 文件并提取 LVVersion。
 */
async function findLvprojVersion(moduleDirPath: string): Promise<string | undefined> {
    let currentDir = path.resolve(moduleDirPath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const lvprojPath = await findFirstFile(currentDir, /\.lvproj$/i);
        if (lvprojPath) {
            try {
                const content = await fs.readFile(lvprojPath, 'utf-8');
                const version = extractLvVersionFromXml(content);
                if (version) {
                    return version;
                }
            } catch {
                // 读取失败，继续向上查找
            }
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) {
            break;
        }
        currentDir = parent;
    }

    // 检查根目录
    const rootLvproj = await findFirstFile(root, /\.lvproj$/i);
    if (rootLvproj) {
        try {
            const content = await fs.readFile(rootLvproj, 'utf-8');
            return extractLvVersionFromXml(content);
        } catch {
            // 忽略
        }
    }

    return undefined;
}

/**
 * 从当前目录向上遍历，查找最近的 .lvlib 文件并提取 LVVersion。
 */
async function findLvlibVersion(moduleDirPath: string): Promise<string | undefined> {
    let currentDir = path.resolve(moduleDirPath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
        const lvlibPath = await findFirstFile(currentDir, /\.lvlib$/i);
        if (lvlibPath) {
            try {
                const content = await fs.readFile(lvlibPath, 'utf-8');
                const version = extractLvVersionFromXml(content);
                if (version) {
                    return version;
                }
            } catch {
                // 读取失败，继续向上查找
            }
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) {
            break;
        }
        currentDir = parent;
    }

    // 检查根目录
    const rootLvlib = await findFirstFile(root, /\.lvlib$/i);
    if (rootLvlib) {
        try {
            const content = await fs.readFile(rootLvlib, 'utf-8');
            return extractLvVersionFromXml(content);
        } catch {
            // 忽略
        }
    }

    return undefined;
}

/**
 * 在目录中查找 .vi 文件并通过二进制头解析版本。
 */
async function findViVersion(moduleDirPath: string): Promise<string | undefined> {
    try {
        const entries = await fs.readdir(moduleDirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && /\.vi$/i.test(entry.name)) {
                const viPath = path.join(moduleDirPath, entry.name);
                const version = await extractLvVersionFromVi(viPath);
                if (version) {
                    return version;
                }
            }
        }
    } catch {
        // 目录不可读
    }
    return undefined;
}

export interface LabviewVersionResult {
    /** LVVersion 原始编码（如 "20008000"） */
    code: string;
    /** 显示用格式（如 "lv2020", "lv2020(64bit)"） */
    display: string;
    /** 解析来源 */
    source: 'dev-environment' | 'lvproj' | 'lvlib' | 'vi-header';
}

/**
 * 按优先级检测模块目录的 LabVIEW 开发版本。
 *
 * @param moduleDirAbsPath 模块目录的绝对路径
 * @returns 检测到的版本信息，未检测到则返回 undefined
 */
export async function detectLabviewVersion(moduleDirAbsPath: string): Promise<LabviewVersionResult | undefined> {
    // 优先级 1：DEV ENVIRONMENT 标记文件
    const devEnvPath = await findDevEnvironmentFile(moduleDirAbsPath);
    if (devEnvPath) {
        const fileName = path.basename(devEnvPath);
        const display = parseDevEnvironmentFileName(fileName);
        if (display) {
            // DEV ENVIRONMENT 文件不提供 LVVersion 编码，仅提供显示名
            return { code: '', display, source: 'dev-environment' };
        }
    }

    // 优先级 2：.lvproj 文件
    const lvprojVersion = await findLvprojVersion(moduleDirAbsPath);
    if (lvprojVersion) {
        const display = getLvVersionDisplay(lvprojVersion);
        if (display) {
            return { code: lvprojVersion, display, source: 'lvproj' };
        }
    }

    // 优先级 3：.lvlib 文件
    const lvlibVersion = await findLvlibVersion(moduleDirAbsPath);
    if (lvlibVersion) {
        const display = getLvVersionDisplay(lvlibVersion);
        if (display) {
            return { code: lvlibVersion, display, source: 'lvlib' };
        }
    }

    // 优先级 4：.vi 二进制头
    const viVersion = await findViVersion(moduleDirAbsPath);
    if (viVersion) {
        const display = getLvVersionDisplay(viVersion);
        if (display) {
            return { code: viVersion, display, source: 'vi-header' };
        }
    }

    return undefined;
}

/**
 * 从 GitHub topics 列表中提取 LabVIEW 版本显示名。
 *
 * 匹配模式：
 *   "labview-2020" / "labview2020" → "lv2020"
 *   "lv2020" / "lv-2020" → "lv2020"
 *   "LabVIEW 2020" → "lv2020"
 *
 * @param topics GitHub 仓库的 topics 列表
 * @returns 版本显示名（如 "lv2020"），未匹配则返回 undefined
 */
export function extractVersionFromTopics(topics: string[]): string | undefined {
    if (!topics || topics.length === 0) {
        return undefined;
    }

    for (const topic of topics) {
        const normalized = topic.toLowerCase().replace(/[\s_-]+/g, '');

        // 匹配 "lv2020", "lv2020(64bit)", "labview2020" 等
        const match = normalized.match(/^(?:labview|lv)(\d{4})(?:\((\d+)bit\))?$/);
        if (match) {
            const year = match[1];
            const bits = match[2];
            if (bits === '64') {
                return `lv${year}(64bit)`;
            }
            return `lv${year}`;
        }

        // 匹配 "lv8.0", "lv8.6" 等经典版本
        const classicMatch = normalized.match(/^(?:labview|lv)(\d+\.\d+)$/);
        if (classicMatch) {
            return `lv${classicMatch[1]}`;
        }
    }

    return undefined;
}
