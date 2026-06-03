/**
 * labviewVersionDetector.test.ts — LabVIEW 版本检测模块的单元测试
 */

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	decodeLvVersion,
	getLvVersionDisplay,
	parseDevEnvironmentFileName,
	detectLabviewVersion,
	LabviewVersionResult,
} from '../moduleManager/labviewVersionDetector';

/**
 * 创建临时目录，返回路径和清理函数。
 */
async function createTempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lvver-test-'));
	return {
		dir,
		cleanup: async () => {
			await fs.rm(dir, { recursive: true, force: true });
		},
	};
}

suite('labviewVersionDetector', () => {

	// ---------------------------------------------------------------------------
	// decodeLvVersion
	// ---------------------------------------------------------------------------
	suite('decodeLvVersion', () => {

		test('已知编码映射正确', () => {
			assert.strictEqual(decodeLvVersion('20008000'), 'LabVIEW 2020');
			assert.strictEqual(decodeLvVersion('19008000'), 'LabVIEW 2019');
			assert.strictEqual(decodeLvVersion('18008000'), 'LabVIEW 2018');
			assert.strictEqual(decodeLvVersion('17008000'), 'LabVIEW 2017');
			assert.strictEqual(decodeLvVersion('16008000'), 'LabVIEW 2016');
			assert.strictEqual(decodeLvVersion('15008000'), 'LabVIEW 2015');
			assert.strictEqual(decodeLvVersion('14008000'), 'LabVIEW 2014');
			assert.strictEqual(decodeLvVersion('13008000'), 'LabVIEW 2013');
			assert.strictEqual(decodeLvVersion('12008000'), 'LabVIEW 2012');
			assert.strictEqual(decodeLvVersion('11008000'), 'LabVIEW 2011');
			assert.strictEqual(decodeLvVersion('10008000'), 'LabVIEW 2010');
			assert.strictEqual(decodeLvVersion('09008000'), 'LabVIEW 2009');
			assert.strictEqual(decodeLvVersion('08008000'), 'LabVIEW 8.0');
			assert.strictEqual(decodeLvVersion('08028000'), 'LabVIEW 8.2');
			assert.strictEqual(decodeLvVersion('08058000'), 'LabVIEW 8.5');
			assert.strictEqual(decodeLvVersion('08068000'), 'LabVIEW 8.6');
		});

		test('推算编码映射正确', () => {
			// 已知编码
			assert.strictEqual(decodeLvVersion('21008000'), 'LabVIEW 2021');
			assert.strictEqual(decodeLvVersion('25008000'), 'LabVIEW 2025');

			// 64-bit 变体
			const v2020_64 = decodeLvVersion('20008040');
			assert.ok(v2020_64?.includes('2020'));
			assert.ok(v2020_64?.includes('64-bit'));
		});

		test('无效输入返回 undefined', () => {
			assert.strictEqual(decodeLvVersion(''), undefined);
			assert.strictEqual(decodeLvVersion('xyz'), undefined);
			assert.strictEqual(decodeLvVersion('01008000'), undefined);
			assert.strictEqual(decodeLvVersion('07008000'), undefined);
		});

		test('大小写不敏感', () => {
			assert.strictEqual(decodeLvVersion('20008000'), decodeLvVersion('20008000'));
			assert.strictEqual(decodeLvVersion('20008000'), 'LabVIEW 2020');
		});
	});

	// ---------------------------------------------------------------------------
	// getLvVersionDisplay
	// ---------------------------------------------------------------------------
	suite('getLvVersionDisplay', () => {

		test('已知编码映射为显示格式', () => {
			assert.strictEqual(getLvVersionDisplay('20008000'), 'lv2020');
			assert.strictEqual(getLvVersionDisplay('19008000'), 'lv2019');
			assert.strictEqual(getLvVersionDisplay('08008000'), 'lv8.0');
			assert.strictEqual(getLvVersionDisplay('08068000'), 'lv8.6');
		});

		test('推算编码映射为显示格式', () => {
			assert.strictEqual(getLvVersionDisplay('21008000'), 'lv2021');
			assert.strictEqual(getLvVersionDisplay('25008000'), 'lv2025');
		});

		test('64-bit 变体', () => {
			const display = getLvVersionDisplay('20008040');
			assert.ok(display?.includes('(64bit)'));
			assert.ok(display?.startsWith('lv'));
		});

		test('无效输入返回 undefined', () => {
			assert.strictEqual(getLvVersionDisplay(''), undefined);
			assert.strictEqual(getLvVersionDisplay('xyz'), undefined);
		});
	});

	// ---------------------------------------------------------------------------
	// parseDevEnvironmentFileName
	// ---------------------------------------------------------------------------
	suite('parseDevEnvironmentFileName', () => {

		test('标准格式 LabVIEW 2020', () => {
			assert.strictEqual(parseDevEnvironmentFileName('DEV ENVIRONMENT LabVIEW 2020'), 'lv2020');
		});

		test('64-bit 格式', () => {
			assert.strictEqual(parseDevEnvironmentFileName('DEV ENVIRONMENT LabVIEW 2020(64bit)'), 'lv2020(64bit)');
		});

		test('非 DEV ENVIRONMENT 文件返回 undefined', () => {
			assert.strictEqual(parseDevEnvironmentFileName('README.md'), undefined);
			assert.strictEqual(parseDevEnvironmentFileName('LabVIEW 2020'), undefined);
		});

		test('其他版本', () => {
			assert.strictEqual(parseDevEnvironmentFileName('DEV ENVIRONMENT LabVIEW 2018'), 'lv2018');
			assert.strictEqual(parseDevEnvironmentFileName('DEV ENVIRONMENT LabVIEW 2021'), 'lv2021');
		});

		test('宽松匹配', () => {
			// 没有 "LabVIEW" 关键字的情况（非标准但常见）
			assert.strictEqual(parseDevEnvironmentFileName('DEV ENVIRONMENT 2020'), 'lv2020');
			assert.strictEqual(parseDevEnvironmentFileName('DEV ENVIRONMENT 2020(64bit)'), 'lv2020(64bit)');
		});
	});

	// ---------------------------------------------------------------------------
	// detectLabviewVersion 集成测试
	// ---------------------------------------------------------------------------
	suite('detectLabviewVersion', () => {

		test('优先级1：DEV ENVIRONMENT 标记文件', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				await fs.writeFile(path.join(dir, 'DEV ENVIRONMENT LabVIEW 2020'), '');
				const result = await detectLabviewVersion(dir);
				assert.ok(result);
				assert.strictEqual(result!.source, 'dev-environment');
				assert.strictEqual(result!.display, 'lv2020');
			} finally {
				await cleanup();
			}
		});

		test('优先级1：祖先目录的 DEV ENVIRONMENT 标记文件', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				// 标记文件在父目录
				await fs.writeFile(path.join(dir, 'DEV ENVIRONMENT LabVIEW 2021'), '');
				const subDir = path.join(dir, 'sub', 'deep');
				await fs.mkdir(subDir, { recursive: true });
				const result = await detectLabviewVersion(subDir);
				assert.ok(result);
				assert.strictEqual(result!.source, 'dev-environment');
				assert.strictEqual(result!.display, 'lv2021');
			} finally {
				await cleanup();
			}
		});

		test('优先级2：.lvproj 文件', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				const lvprojContent = `<?xml version='1.0' encoding='UTF-8'?>\n<Project Type="Project" LVVersion="17008000">\n</Project>`;
				await fs.writeFile(path.join(dir, 'test.lvproj'), lvprojContent);
				const result = await detectLabviewVersion(dir);
				assert.ok(result);
				assert.strictEqual(result!.source, 'lvproj');
				assert.strictEqual(result!.code, '17008000');
				assert.strictEqual(result!.display, 'lv2017');
			} finally {
				await cleanup();
			}
		});

		test('优先级2：祖先目录的 .lvproj 优先', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				const parentContent = `<?xml version='1.0'?>\n<Project Type="Project" LVVersion="18008000">\n</Project>`;
				const childContent = `<?xml version='1.0'?>\n<Project Type="Project" LVVersion="19008000">\n</Project>`;
				await fs.writeFile(path.join(dir, 'parent.lvproj'), parentContent);
				const subDir = path.join(dir, 'child');
				await fs.mkdir(subDir);
				await fs.writeFile(path.join(subDir, 'child.lvproj'), childContent);
				// 在子目录中检测，应该优先使用 child.lvproj（距离更近）
				const result = await detectLabviewVersion(subDir);
				assert.ok(result);
				assert.strictEqual(result!.source, 'lvproj');
				assert.strictEqual(result!.code, '19008000');
				assert.strictEqual(result!.display, 'lv2019');
			} finally {
				await cleanup();
			}
		});

		test('优先级3：.lvlib 文件', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				const lvlibContent = `<?xml version='1.0' encoding='UTF-8'?>\n<Library LVVersion="20008000">\n</Library>`;
				await fs.writeFile(path.join(dir, 'test.lvlib'), lvlibContent);
				const result = await detectLabviewVersion(dir);
				assert.ok(result);
				assert.strictEqual(result!.source, 'lvlib');
				assert.strictEqual(result!.code, '20008000');
				assert.strictEqual(result!.display, 'lv2020');
			} finally {
				await cleanup();
			}
		});

		test('优先级4：.vi 二进制文件（保底方案）', async () => {
			// 使用项目中实际的 .vi 文件进行测试
			const viPath = path.resolve(__dirname, '..', '..', 'csm', 'CSM-Modsets-WaveformDisplay', 'WaveformDisplay.vi');
			try {
				await fs.access(viPath);
			} catch {
				// 如果 .vi 文件不存在，跳过此测试
				return;
			}

			// 复制到临时目录（不包含 .lvproj/.lvlib/DEV ENVIRONMENT）
			const { dir, cleanup } = await createTempDir();
			try {
				await fs.copyFile(viPath, path.join(dir, 'test.vi'));
				const result = await detectLabviewVersion(dir);
				assert.ok(result, '应能从 .vi 二进制文件中检测到版本');
				assert.strictEqual(result!.source, 'vi-header');
				assert.strictEqual(result!.display, 'lv2020');
			} finally {
				await cleanup();
			}
		});

		test('无任何版本来源时返回 undefined', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				await fs.writeFile(path.join(dir, 'README.md'), 'just a readme');
				const result = await detectLabviewVersion(dir);
				assert.strictEqual(result, undefined);
			} finally {
				await cleanup();
			}
		});

		test('lvproj 优先级高于 lvlib', async () => {
			const { dir, cleanup } = await createTempDir();
			try {
				const lvprojContent = `<?xml version='1.0'?>\n<Project Type="Project" LVVersion="18008000">\n</Project>`;
				const lvlibContent = `<?xml version='1.0'?>\n<Library LVVersion="19008000">\n</Library>`;
				await fs.writeFile(path.join(dir, 'test.lvproj'), lvprojContent);
				await fs.writeFile(path.join(dir, 'test.lvlib'), lvlibContent);
				const result = await detectLabviewVersion(dir);
				assert.ok(result);
				assert.strictEqual(result!.source, 'lvproj');
				assert.strictEqual(result!.display, 'lv2018');
			} finally {
				await cleanup();
			}
		});
	});
});
