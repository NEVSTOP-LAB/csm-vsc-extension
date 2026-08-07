import * as assert from 'assert';
import { renderModuleSidebarHtml } from '../modules/moduleSidebarHtml';
import type { ModuleSidebarRenderState } from '../modules/moduleSidebarHtml';
import { DEFAULT_MODULE_SORT_STATE } from '../modules/sort';
import type { CsmModuleEntry, LocalManagedModuleEntry, LocalUnmanagedFolderEntry } from '../modules/types';

function makeModule(overrides: Partial<CsmModuleEntry> = {}): CsmModuleEntry {
    return {
        id: overrides.id ?? 1,
        owner: overrides.owner ?? 'test-owner',
        name: overrides.name ?? 'test-module',
        description: overrides.description ?? '',
        topics: overrides.topics ?? [],
        visibility: overrides.visibility ?? 'public',
        defaultBranch: overrides.defaultBranch ?? 'main',
        repoUrl: overrides.repoUrl ?? 'https://github.com/test-owner/test-module',
        updatedAt: overrides.updatedAt,
        starred: overrides.starred,
        readme: overrides.readme,
    };
}

function makeManaged(overrides: Partial<LocalManagedModuleEntry> = {}): LocalManagedModuleEntry {
    return {
        id: overrides.id ?? 'm1',
        kind: 'managed',
        owner: overrides.owner ?? 'test-owner',
        name: overrides.name ?? 'test-module',
        path: overrides.path ?? 'csm/test-module',
        source: overrides.source ?? 'https://github.com/test-owner/test-module',
        method: overrides.method ?? 'copy',
        branch: overrides.branch ?? 'main',
        ref: overrides.ref ?? 'abc123',
        repoUrl: overrides.repoUrl ?? 'https://github.com/test-owner/test-module',
        description: overrides.description ?? '',
        visibility: overrides.visibility ?? 'public',
        topics: overrides.topics ?? [],
        moduleEntry: overrides.moduleEntry ?? makeModule(),
        moduleKey: overrides.moduleKey ?? 'test-owner/test-module',
        stale: overrides.stale ?? false,
    };
}

function makeUnmanaged(overrides: Partial<LocalUnmanagedFolderEntry> = {}): LocalUnmanagedFolderEntry {
    return {
        id: overrides.id ?? 'u1',
        kind: 'unmanaged',
        name: overrides.name ?? 'folder-a',
        path: overrides.path ?? 'csm/folder-a',
    };
}

function makeState(overrides: Partial<ModuleSidebarRenderState> = {}): ModuleSidebarRenderState {
    return {
        signedIn: false,
        canInitializeWorkspace: false,
        managedModules: [],
        unmanagedFolders: [],
        workspaceLabel: 'test-workspace',
        moduleRoot: 'csm',
        gitAvailable: true,
        filterQuery: '',
        includeAppliedModules: false,
        scope: 'all',
        modules: [],
        state: 'ready',
        message: '',
        selectedModuleKeys: new Set(),
        appliedModuleKeys: new Set(),
        introTipVisible: false,
        offlineMode: false,
        sortState: DEFAULT_MODULE_SORT_STATE,
        staleModuleKeys: new Set(),
        renderLimit: 100,
        initialRenderLimit: 100,
        ...overrides,
    };
}

suite('moduleSidebarHtml — 区域折叠（issue #80）', () => {

    test('All 范围下本地与在线区域均渲染可折叠标题栏，默认展开', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeManaged()],
            modules: [makeModule()],
        }));
        const toggles = html.match(/<button[^>]*data-role="section-toggle"[^>]*>/g);
        assert.ok(toggles, '应渲染 section-toggle 标题栏');
        assert.strictEqual(toggles!.length, 2, '本地与在线区域各一个可折叠标题栏');
        assert.ok(html.includes('class="section-toggle" data-role="section-toggle" aria-expanded="true"'), '默认展开（aria-expanded="true"）');
        assert.ok(!html.includes('list-section collapsed'), '默认不折叠');
    });

    test('标题栏含 chevron 图标与计数 meta（折叠后保留信息）', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeManaged()],
            modules: [makeModule()],
        }));
        assert.ok(html.includes('section-chevron'), '标题栏应有 chevron 图标');
        const metaCount = html.match(/<span class="section-meta">/g);
        assert.strictEqual(metaCount?.length, 2, '两个标题栏均保留计数 meta');
    });

    test('Workspace 单范围仍显示可折叠标题栏', () => {
        const html = renderModuleSidebarHtml(makeState({
            scope: 'workspace',
            managedModules: [makeManaged()],
            modules: [makeModule()],
        }));
        const toggles = html.match(/<button[^>]*data-role="section-toggle"[^>]*>/g);
        assert.strictEqual(toggles?.length, 1, '只看本地时仍有一个可折叠标题栏');
        assert.ok(html.includes('aria-expanded="true"'), '默认展开');
    });

    test('Catalog 单范围仍显示可折叠标题栏', () => {
        const html = renderModuleSidebarHtml(makeState({
            scope: 'catalog',
            modules: [makeModule()],
        }));
        const toggles = html.match(/<button[^>]*data-role="section-toggle"[^>]*>/g);
        assert.strictEqual(toggles?.length, 1, '只看在线时仍有一个可折叠标题栏');
        assert.ok(html.includes('aria-expanded="true"'), '默认展开');
    });

    test('空内容时不渲染可折叠区域', () => {
        const html = renderModuleSidebarHtml(makeState({
            moduleRoot: undefined,
            modules: [],
        }));
        const toggles = html.match(/<button[^>]*data-role="section-toggle"[^>]*>/g);
        assert.ok(!toggles || toggles.length === 0, '无内容时不渲染区域标题栏');
    });

    test('Show More 按钮渲染在在线区域内部（折叠时随区域隐藏）', () => {
        const modules = Array.from({ length: 150 }, (_, index) => makeModule({ id: index + 1, name: `module-${index}` }));
        const html = renderModuleSidebarHtml(makeState({
            modules,
            renderLimit: 100,
            initialRenderLimit: 100,
        }));
        const showMoreIndex = html.indexOf('data-action="showMore"');
        assert.ok(showMoreIndex >= 0, '超量模块时应渲染 Show More 按钮');
        // 在线区域是最后一个 list-section，showMore 必须位于其内部（其后首个 </section> 之前）
        const catalogSectionStart = html.lastIndexOf('<section class="list-section"');
        assert.ok(catalogSectionStart >= 0, '应渲染在线区域');
        const catalogSectionEnd = html.indexOf('</section>', catalogSectionStart);
        assert.ok(catalogSectionEnd > showMoreIndex, 'Show More 位于在线区域内部，折叠时随区域隐藏');
    });

    test('折叠 CSS 规则存在（隐藏区域内容）', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeManaged()],
            modules: [makeModule()],
        }));
        assert.ok(html.includes('.list-section.collapsed .list {'), '折叠后隐藏区域内容');
        assert.ok(html.includes('.list-section.collapsed .section-toggle .section-chevron {'), '折叠后 chevron 旋转');
    });
});
suite('moduleSidebarHtml — 本地已管理卡片摘要', () => {

    test('描述为空时不渲染「已从…建立跟踪」摘要与空 summary 区域', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeManaged()],
        }));
        assert.ok(!html.includes('Tracked from'), '不再显示 Tracked from 占位文案');
        const localCardStart = html.indexOf('data-role="local-module-card"');
        assert.ok(localCardStart >= 0, '应渲染本地已管理卡片');
        const localCard = html.slice(localCardStart);
        assert.ok(!localCard.includes('class="summary"'), '描述为空时省略 summary 区域');
        assert.ok(localCard.includes('Path: csm&#47;test-module'), '卡片底部保留路径信息');
    });

    test('描述非空时正常渲染描述摘要', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeManaged({ description: 'Shared HAL module' })],
        }));
        const localCardStart = html.indexOf('data-role="local-module-card"');
        assert.ok(localCardStart >= 0, '应渲染本地已管理卡片');
        const localCard = html.slice(localCardStart);
        assert.ok(localCard.includes('class="summary"'), '描述非空时渲染 summary 区域');
        assert.ok(localCard.includes('Shared HAL module'), '描述作为摘要展示');
    });
});
suite('moduleSidebarHtml — 本地模块卡片（method: local）', () => {

    function makeLocal(overrides: Partial<LocalManagedModuleEntry> = {}): LocalManagedModuleEntry {
        return {
            id: overrides.id ?? 'local-1',
            kind: 'local',
            owner: '',
            name: overrides.name ?? 'folder-a',
            path: overrides.path ?? 'csm/folder-a',
            source: '',
            method: 'local',
            branch: '',
            ref: '',
            repoUrl: '',
            description: '',
            visibility: 'public',
            topics: [],
            moduleEntry: makeModule({ owner: '', name: overrides.name ?? 'folder-a', repoUrl: '' }),
            stale: overrides.stale ?? false,
            locked: overrides.locked,
            labviewVersion: overrides.labviewVersion,
        };
    }

    test('渲染 Local 徽章、方法徽章与路径，不渲染 GitHub/更新按钮', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeLocal()],
        }));
        const localCardStart = html.indexOf('data-role="local-module-card"');
        assert.ok(localCardStart >= 0, '应渲染本地模块卡片');
        const localCard = html.slice(localCardStart);
        assert.ok(localCard.includes('>Local<'), '应渲染 Local 徽章');
        assert.ok(localCard.includes('>Local</span>'), '方法徽章显示 Local');
        assert.ok(localCard.includes('Path: csm&#47;folder-a'), '卡片底部保留路径信息');
        assert.ok(!localCard.includes('data-action="updateLocalModule"'), '本地模块不提供更新按钮');
        assert.ok(!localCard.includes('data-action="switchLocalModuleMethod"'), '本地模块不提供切换按钮');
        assert.ok(!localCard.includes('data-action="openRepository"'), '本地模块不提供 GitHub 打开按钮');
        assert.ok(localCard.includes('data-action="openLocalFolder"'), '本地模块提供打开目录按钮');
        assert.ok(localCard.includes('data-action="toggleLocalModuleLock"'), '本地模块提供锁定/解锁按钮');
    });

    test('本地模块卡片 data-vscode-context 标记 workspaceCardKind=local 与 localItemId', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeLocal({ id: 'local-7' })],
        }));
        const localCardStart = html.indexOf('data-role="local-module-card"');
        const localCard = html.slice(localCardStart);
        const contextStart = localCard.indexOf('data-vscode-context="');
        const contextEnd = localCard.indexOf('"', contextStart + 'data-vscode-context="'.length);
        const context = localCard.slice(contextStart, contextEnd);
        assert.ok(context.includes('&quot;workspaceCardKind&quot;:&quot;local&quot;'), 'context 标记为 local 卡片类型');
        assert.ok(context.includes('&quot;localItemId&quot;:&quot;local-7&quot;'), 'context 携带 localItemId');
        assert.ok(!context.includes('moduleKey'), '本地模块 context 不含 moduleKey');
    });

    test('本地模块支持 LabVIEW 版本徽章（与已管理一致）', () => {
        const html = renderModuleSidebarHtml(makeState({
            managedModules: [makeLocal({ labviewVersion: 'lv2020' })],
        }));
        assert.ok(html.includes('lv2020'), '应渲染 LabVIEW 版本徽章');
    });

    test('未管理卡片提供「记录为本地模块」按钮', () => {
        const html = renderModuleSidebarHtml(makeState({
            unmanagedFolders: [makeUnmanaged()],
        }));
        const localCardStart = html.indexOf('data-role="local-module-card"');
        assert.ok(localCardStart >= 0, '应渲染未管理卡片');
        const localCard = html.slice(localCardStart);
        assert.ok(localCard.includes('data-action="recordLocalModule"'), '未管理卡片提供记录为本地模块按钮');
    });
});