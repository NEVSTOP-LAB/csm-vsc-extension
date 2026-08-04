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
