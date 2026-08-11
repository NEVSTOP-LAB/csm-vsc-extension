import * as assert from 'assert';
import { GitService } from '../modules/gitService';

/**
 * GitService 环境加固测试。
 *
 * 验证所有 git 操作的环境变量：
 * - 始终复用已登录账号的凭据（token 经 GIT_ASKPASS 传入，不出现于命令行）；
 * - 始终禁止 git / Git Credential Manager 弹出交互式授权窗口，
 *   从而保证使用过程中不会激活 GitHub 权限验证窗口。
 *
 * 直接断言 buildEnv 返回的环境对象，跨平台且无需启动假 git 子进程。
 */
suite('GitService environment hardening Tests', () => {
	test('always disables git terminal prompts and GCM interaction (no token)', async () => {
		const service = new GitService();
		const env = await service.buildEnv({
			repoUrl: 'https://github.com/org/module-a',
		});

		// 复用已登录账号：git 永不进入交互式凭据提示、GCM 永不弹授权窗
		assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
		assert.strictEqual(env.GCM_INTERACTIVE, 'never');
		// 无 token 时不应注入扩展自己的 askpass / token 环境变量；
		// 继承的 GIT_ASKPASS（如 VS Code git 集成指向已登录账号）必须原样保留。
		assert.strictEqual(env.CSM_GIT_TOKEN, undefined);
		assert.strictEqual(env.CSM_GIT_USERNAME, undefined);
		assert.strictEqual(env.GIT_ASKPASS, process.env.GIT_ASKPASS);
	});

	test('passes the logged-in token via askpass for https remotes', async () => {
		const service = new GitService();
		const env = await service.buildEnv({
			authToken: 'gho_secret-token',
			repoUrl: 'https://github.com/org/module-a',
		});

		// 复用已登录账号的权限：token 经 GIT_ASKPASS 传入，不出现于命令行
		assert.ok(env.GIT_ASKPASS, 'GIT_ASKPASS should point at the askpass script');
		assert.strictEqual(env.CSM_GIT_TOKEN, 'gho_secret-token');
		assert.strictEqual(env.CSM_GIT_USERNAME, 'x-access-token');
		// 即使携带 token，同样禁止任何交互弹窗
		assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
		assert.strictEqual(env.GCM_INTERACTIVE, 'never');
	});

	test('does not configure askpass for non-https remotes but still suppresses prompts', async () => {
		const service = new GitService();
		const env = await service.buildEnv({
			authToken: 'gho_secret-token',
			repoUrl: 'local/path',
		});

		// 非 https 远程（本地/SSH）不使用 token askpass，保留继承的 GIT_ASKPASS
		assert.strictEqual(env.CSM_GIT_TOKEN, undefined);
		assert.strictEqual(env.CSM_GIT_USERNAME, undefined);
		assert.strictEqual(env.GIT_ASKPASS, process.env.GIT_ASKPASS);
		// 同样禁止交互式凭据弹窗
		assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
		assert.strictEqual(env.GCM_INTERACTIVE, 'never');
	});
});
