import * as assert from 'assert';
import { GitService } from '../modules/gitService';

/**
 * GitService 环境加固测试。
 *
 * 验证所有 git 操作的环境变量与命令行参数：
 * - 始终复用已登录账号的凭据（token 经 GIT_ASKPASS 传入，不出现于命令行）；
 * - 注入 token 时用 `-c credential.helper=` 清空 credential helper（GCM 等），
 *   确保 git 一定使用扩展注入的 token，而不是 GCM 缓存的另一账号凭据；
 * - 未注入 token 时用扩展自己的“非交互式失败 askpass”覆盖继承的 askpass
 *   （如 VS Code 注入的交互式 askpass，凭据缺失时会弹登录/凭据 UI）。
 *   从而保证使用过程中不会激活 GitHub 权限验证窗口。
 *
 * 直接断言 buildEnv / getEffectiveArgs 的返回值，跨平台且无需启动假 git 子进程。
 */
suite('GitService environment hardening Tests', () => {
	const INTERACTIVE_SENTINEL = 'interactive-sentinel-askpass';
	const originalAskpass = process.env.GIT_ASKPASS;

	setup(() => {
		// 哨兵：模拟 VS Code git 集成注入的“会交互”的 askpass
		process.env.GIT_ASKPASS = INTERACTIVE_SENTINEL;
	});

	teardown(() => {
		if (typeof originalAskpass === 'undefined') {
			delete process.env.GIT_ASKPASS;
		} else {
			process.env.GIT_ASKPASS = originalAskpass;
		}
	});

	test('无 token 时覆盖继承的交互式 askpass 为失败脚本，且禁用一切交互弹窗', async () => {
		const service = new GitService();
		const env = await service.buildEnv({
			repoUrl: 'https://github.com/org/module-a',
		});

		// 覆盖（而非保留）继承的 askpass：GIT_ASKPASS 指向扩展的失败脚本
		assert.notStrictEqual(env.GIT_ASKPASS, INTERACTIVE_SENTINEL);
		assert.ok(env.GIT_ASKPASS, 'GIT_ASKPASS should be overridden');
		// 未注入 token 时不设置 token 环境变量
		assert.strictEqual(env.CSM_GIT_TOKEN, undefined);
		assert.strictEqual(env.CSM_GIT_USERNAME, undefined);
		// git 永不进入终端提示、GCM 永不弹授权窗
		assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
		assert.strictEqual(env.GCM_INTERACTIVE, 'never');
	});

	test('注入 token 时经 askpass 传 token，且清空 credential.helper 保证使用该 token', async () => {
		const service = new GitService();
		const env = await service.buildEnv({
			authToken: 'gho_secret-token',
			repoUrl: 'https://github.com/org/module-a',
		});
		const args = await service.getEffectiveArgs(
			{ authToken: 'gho_secret-token', repoUrl: 'https://github.com/org/module-a' },
			['clone', '--depth', '1', 'https://github.com/org/module-a', 'src'],
		);

		// token 经 GIT_ASKPASS 传入，不出现于命令行
		assert.ok(env.GIT_ASKPASS, 'GIT_ASKPASS should point at the token askpass script');
		assert.strictEqual(env.CSM_GIT_TOKEN, 'gho_secret-token');
		assert.strictEqual(env.CSM_GIT_USERNAME, 'x-access-token');
		// 命令行最前注入 -c credential.helper=（清空 GCM 等缓存凭据源）
		assert.deepStrictEqual(args.slice(0, 3), ['-c', 'credential.helper=', 'clone']);
		// 即使携带 token，同样禁止任何交互弹窗
		assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
		assert.strictEqual(env.GCM_INTERACTIVE, 'never');
	});

	test('非 https 远程不注入 token askpass，但仍覆盖 askpass 并禁用交互弹窗', async () => {
		const service = new GitService();
		const env = await service.buildEnv({
			authToken: 'gho_secret-token',
			repoUrl: 'local/path',
		});
		const args = await service.getEffectiveArgs(
			{ authToken: 'gho_secret-token', repoUrl: 'local/path' },
			['clone', '--depth', '1', 'local/path', 'src'],
		);

		// 非 https 远程不使用 token，不注入 -c credential.helper=
		assert.strictEqual(env.CSM_GIT_TOKEN, undefined);
		assert.strictEqual(env.CSM_GIT_USERNAME, undefined);
		assert.deepStrictEqual(args, ['clone', '--depth', '1', 'local/path', 'src']);
		// 但同样覆盖继承的 askpass 为失败脚本（非哨兵）
		assert.notStrictEqual(env.GIT_ASKPASS, INTERACTIVE_SENTINEL);
		assert.ok(env.GIT_ASKPASS, 'GIT_ASKPASS should be overridden');
		// 同样禁止交互式凭据弹窗
		assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
		assert.strictEqual(env.GCM_INTERACTIVE, 'never');
	});
});
