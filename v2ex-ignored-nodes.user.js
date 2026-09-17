// ==UserScript==
// @name         V2EX 已忽略节点列表
// @namespace    https://github.com/cyzg90
// @version      1.0.0
// @description  在 V2EX 忽略设置页面扫描并显示当前账号已忽略的节点
// @author       cyzg90
// @license      MIT
// @homepageURL  https://github.com/cyzg90/v2ex-ignored-nodes
// @supportURL   https://github.com/cyzg90/v2ex-ignored-nodes/issues
// @match        https://v2ex.com/settings/block*
// @match        https://www.v2ex.com/settings/block*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.0.0';

    // 每个 worker 两次请求之间的间隔
    const REQUEST_GAP = 900;

    // 全量扫描并发数量
    const WORKERS = 2;

    const STORAGE_KEY = 'v2ex_ignored_nodes_v1';

    let running = false;
    let stopRequested = false;

    // 页面首次进入时校验缓存中的已忽略节点。
    // refreshing 用于避免自动校验与全量扫描同时运行。
    let refreshingIgnored = false;

    const sleep = ms =>
        new Promise(resolve => setTimeout(resolve, ms));

    // =========================================================
    // 数据
    // =========================================================

    function defaultState() {
        return {
            version: VERSION,

            // API 获取到的全部节点
            nodes: [],

            // 已经检查过的节点名
            checked: {},

            // 已忽略节点
            ignored: {},

            startedAt: null,
            updatedAt: null,
            completedAt: null
        };
    }

    function loadState() {
        try {
            const raw =
                localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return defaultState();
            }

            const state =
                JSON.parse(raw);

            return {
                ...defaultState(),
                ...state,

                version: VERSION,

                checked:
                    state.checked || {},

                ignored:
                    state.ignored || {},

                nodes:
                    Array.isArray(state.nodes)
                        ? state.nodes
                        : []
            };

        } catch (err) {
            console.warn(
                '[V2EX Ignored] 缓存读取失败',
                err
            );

            return defaultState();
        }
    }

    function saveState() {
        state.version = VERSION;
        state.updatedAt = Date.now();

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );
    }

    let state = loadState();

    // =========================================================
    // DOM
    // =========================================================

    function createPanel() {
        const main =
            document.querySelector('#Main');

        if (!main) {
            console.error(
                '[V2EX Ignored] 找不到 #Main'
            );

            return null;
        }

        document
            .querySelector('#v2ex-ignored-panel')
            ?.remove();

        const panel =
            document.createElement('div');

        panel.id =
            'v2ex-ignored-panel';

        panel.className = 'box';

        panel.style.marginBottom =
            '20px';

        panel.innerHTML = `
            <div class="cell">
                <strong>已忽略节点</strong>

                <span
                    id="v2ex-ignored-summary"
                    class="fade"
                    style="margin-left: 8px;"
                ></span>
            </div>

            <div class="cell">
                <input
                    id="v2ex-ignored-start"
                    class="super normal button"
                    type="button"
                    value="开始扫描"
                >

                <input
                    id="v2ex-ignored-stop"
                    class="super normal button"
                    type="button"
                    value="停止"
                    style="
                        display: none;
                        margin-left: 6px;
                    "
                >

                <input
                    id="v2ex-ignored-reset"
                    class="super normal button"
                    type="button"
                    value="重新扫描"
                    style="margin-left: 6px;"
                >

                <span
                    id="v2ex-ignored-status"
                    class="fade"
                    style="margin-left: 10px;"
                ></span>
            </div>

            <div
                id="v2ex-ignored-progress-wrap"
                class="cell"
                style="display:none;"
            >
                <div
                    style="
                        height: 8px;
                        background: rgba(128,128,128,.2);
                        border-radius: 4px;
                        overflow: hidden;
                    "
                >
                    <div
                        id="v2ex-ignored-progress"
                        style="
                            height: 100%;
                            width: 0%;
                            background: #778087;
                            transition: width .2s;
                        "
                    ></div>
                </div>
            </div>

            <div id="v2ex-ignored-list"></div>
        `;

        main.prepend(panel);

        return panel;
    }

    const panel =
        createPanel();

    if (!panel) {
        return;
    }

    const startButton =
        panel.querySelector(
            '#v2ex-ignored-start'
        );

    const stopButton =
        panel.querySelector(
            '#v2ex-ignored-stop'
        );

    const resetButton =
        panel.querySelector(
            '#v2ex-ignored-reset'
        );

    const statusElement =
        panel.querySelector(
            '#v2ex-ignored-status'
        );

    const summaryElement =
        panel.querySelector(
            '#v2ex-ignored-summary'
        );

    const listElement =
        panel.querySelector(
            '#v2ex-ignored-list'
        );

    const progressWrap =
        panel.querySelector(
            '#v2ex-ignored-progress-wrap'
        );

    const progressElement =
        panel.querySelector(
            '#v2ex-ignored-progress'
        );

    // =========================================================
    // HTML 转义
    // =========================================================

    function escapeHtml(value) {
        const div =
            document.createElement('div');

        div.textContent =
            String(value ?? '');

        return div.innerHTML;
    }

    // =========================================================
    // 状态统计
    // =========================================================

    function getStats() {
        const total =
            state.nodes.length;

        const checked =
            Object.keys(
                state.checked
            ).length;

        const ignored =
            Object.keys(
                state.ignored
            ).length;

        return {
            total,
            checked,
            ignored,

            remaining:
                Math.max(
                    0,
                    total - checked
                )
        };
    }

    // =========================================================
    // 渲染
    // =========================================================

    function render() {
        const stats =
            getStats();

        summaryElement.textContent =
            `共 ${stats.ignored} 个`;

        if (stats.total > 0) {
            const percent =
                Math.min(
                    100,
                    stats.checked /
                    stats.total *
                    100
                );

            progressWrap.style.display =
                '';

            progressElement.style.width =
                `${percent}%`;
        } else {
            progressWrap.style.display =
                'none';
        }

        if (state.completedAt) {
            statusElement.textContent =
                `扫描完成：${stats.checked}/${stats.total}`;
        } else if (
            stats.total &&
            stats.checked
        ) {
            statusElement.textContent =
                `进度 ${stats.checked}/${stats.total}，` +
                `剩余 ${stats.remaining}`;
        } else {
            statusElement.textContent =
                '尚未扫描';
        }

        const ignoredNodes =
            Object
                .values(state.ignored)
                .sort((a, b) =>
                    (a.title || a.name)
                        .localeCompare(
                            b.title || b.name,
                            'zh-CN'
                        )
                );

        if (!ignoredNodes.length) {
            listElement.innerHTML = `
                <div class="cell fade">
                    ${
                        stats.checked
                            ? '当前已扫描部分暂未发现忽略节点。'
                            : '点击“开始扫描”获取已忽略节点。'
                    }
                </div>
            `;

            return;
        }

        listElement.innerHTML =
            ignoredNodes
                .map(node => `
                    <div class="cell">
                        <a
                            href="/go/${encodeURIComponent(node.name)}"
                        >
                            <strong>
                                ${escapeHtml(
                                    node.title ||
                                    node.name
                                )}
                            </strong>
                        </a>

                        <span
                            class="fade"
                            style="margin-left:8px;"
                        >
                            /go/${escapeHtml(node.name)}
                        </span>
                    </div>
                `)
                .join('');
    }

    // =========================================================
    // API
    // =========================================================

    async function fetchAllNodes() {
        const response =
            await fetch(
                '/api/nodes/all.json',
                {
                    credentials:
                        'same-origin',

                    cache:
                        'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `节点 API HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        if (!Array.isArray(data)) {
            throw new Error(
                '节点 API 返回格式异常'
            );
        }

        return data;
    }

    async function checkNode(node) {
        const response =
            await fetch(
                `/go/${encodeURIComponent(node.name)}`,
                {
                    credentials:
                        'same-origin',

                    cache:
                        'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const html =
            await response.text();

        // V2EX 当前实际结构：
        //
        // 取消忽略节点
        // /settings/unignore/node/184?once=xxxxx

        return (
            /\/settings\/unignore\/node\/\d+/i
                .test(html) ||
            html.includes(
                '取消忽略节点'
            )
        );
    }

    // =========================================================
    // 页面首次进入时：
    // 只校验缓存中的“已忽略节点”
    // =========================================================

    async function refreshIgnoredNodes() {
        // 全量扫描正在运行时跳过
        if (
            running ||
            refreshingIgnored
        ) {
            return;
        }

        const ignoredNodes =
            Object.values(
                state.ignored
            );

        // 没有缓存的忽略节点时无需请求
        if (!ignoredNodes.length) {
            return;
        }

        refreshingIgnored = true;

        console.log(
            '[V2EX Ignored]',
            `开始校验缓存中的 ${ignoredNodes.length} 个已忽略节点`
        );

        const oldStatus =
            statusElement.textContent;

        statusElement.textContent =
            `正在校验 ${ignoredNodes.length} 个已忽略节点…`;

        // 使用独立队列
        const queue =
            [...ignoredNodes];

        let checkedCount = 0;
        let removedCount = 0;

        async function refreshWorker() {
            while (queue.length) {
                const node =
                    queue.shift();

                if (!node) {
                    break;
                }

                try {
                    const stillIgnored =
                        await checkNode(node);

                    checkedCount++;

                    if (!stillIgnored) {
                        console.log(
                            '[V2EX Ignored] 已取消忽略，移除：',
                            node.name,
                            node.title
                        );

                        // 只从 ignored 中删除。
                        //
                        // checked 保持为 true，
                        // 所以“继续扫描”不会重新检查它。
                        delete state.ignored[
                            node.name
                        ];

                        removedCount++;

                        saveState();
                        render();
                    }

                    statusElement.textContent =
                        `正在校验已忽略节点 ` +
                        `${checkedCount}/${ignoredNodes.length}…`;

                } catch (err) {
                    // 请求失败时保留原节点，
                    // 避免误删缓存内容。
                    console.warn(
                        '[V2EX Ignored] 缓存节点校验失败：',
                        node.name,
                        err
                    );
                }

                await sleep(
                    REQUEST_GAP
                );
            }
        }

        try {
            // 与全量扫描一样保持两个低并发 worker
            await Promise.all([
                refreshWorker(),
                refreshWorker()
            ]);

            saveState();
            render();

            console.log(
                '[V2EX Ignored]',
                `缓存校验完成；移除 ${removedCount} 个已取消忽略节点`
            );

            // render() 会恢复正常扫描进度文字。
            //
            // 如果删除了节点，短暂补充一次结果提示。
            if (removedCount > 0) {
                const normalStatus =
                    statusElement.textContent;

                statusElement.textContent =
                    `已移除 ${removedCount} 个取消忽略的节点；` +
                    normalStatus;
            }

        } finally {
            refreshingIgnored = false;
        }
    }

    // =========================================================
    // Worker
    // =========================================================

    async function worker(queue) {
        while (
            queue.length &&
            !stopRequested
        ) {
            const node =
                queue.shift();

            if (!node) {
                break;
            }

            if (
                state.checked[
                    node.name
                ]
            ) {
                continue;
            }

            try {
                const ignored =
                    await checkNode(node);

                state.checked[
                    node.name
                ] = true;

                if (ignored) {
                    state.ignored[
                        node.name
                    ] = {
                        id: node.id,
                        name: node.name,
                        title: node.title
                    };

                    console.log(
                        '[V2EX Ignored] ✓',
                        node.name,
                        node.title
                    );
                }

                saveState();
                render();

            } catch (err) {
                // 请求失败时不标记 checked，
                // 下次继续扫描时会重试。
                console.warn(
                    '[V2EX Ignored] 检查失败',
                    node.name,
                    err
                );
            }

            await sleep(
                REQUEST_GAP
            );
        }
    }

    // =========================================================
    // 扫描
    // =========================================================

    async function startScan() {
        // 自动校验缓存期间暂不启动全量扫描。
        if (
            running ||
            refreshingIgnored
        ) {
            return;
        }

        running = true;
        stopRequested = false;

        startButton.disabled =
            true;

        resetButton.disabled =
            true;

        stopButton.style.display =
            '';

        stopButton.disabled =
            false;

        try {
            statusElement.textContent =
                '正在获取全部节点…';

            const nodes =
                await fetchAllNodes();

            state.nodes =
                nodes.map(node => ({
                    id: node.id,
                    name: node.name,
                    title: node.title
                }));

            if (!state.startedAt) {
                state.startedAt =
                    Date.now();
            }

            state.completedAt =
                null;

            saveState();
            render();

            const queue =
                state.nodes.filter(
                    node =>
                        !state.checked[
                            node.name
                        ]
                );

            console.log(
                '[V2EX Ignored]',
                `共 ${state.nodes.length} 个节点，`,
                `待扫描 ${queue.length} 个`
            );

            if (!queue.length) {
                state.completedAt =
                    Date.now();

                saveState();
                render();

                return;
            }

            const workers =
                Array.from(
                    {
                        length:
                            Math.min(
                                WORKERS,
                                queue.length
                            )
                    },

                    () =>
                        worker(queue)
                );

            await Promise.all(
                workers
            );

            if (!stopRequested) {
                const stats =
                    getStats();

                if (
                    stats.checked >=
                    stats.total
                ) {
                    state.completedAt =
                        Date.now();
                }

                saveState();
                render();
            }

        } catch (err) {
            console.error(
                '[V2EX Ignored] 扫描失败',
                err
            );

            statusElement.textContent =
                `扫描失败：${err.message}`;

        } finally {
            running = false;

            startButton.disabled =
                false;

            resetButton.disabled =
                false;

            stopButton.style.display =
                'none';

            if (stopRequested) {
                const stats =
                    getStats();

                statusElement.textContent =
                    `已停止：${stats.checked}/${stats.total}，` +
                    `下次可继续扫描`;
            }
        }
    }

    // =========================================================
    // 停止
    // =========================================================

    function stopScan() {
        if (!running) {
            return;
        }

        stopRequested = true;

        stopButton.disabled =
            true;

        statusElement.textContent =
            '正在停止…';
    }

    // =========================================================
    // 重置
    // =========================================================

    function resetScan() {
        // 缓存校验期间也禁止重置，避免两个流程同时修改 state。
        if (
            running ||
            refreshingIgnored
        ) {
            return;
        }

        const ok =
            confirm(
                '确定清除扫描缓存并从头扫描？'
            );

        if (!ok) {
            return;
        }

        localStorage.removeItem(
            STORAGE_KEY
        );

        state =
            defaultState();

        render();

        startScan();
    }

    // =========================================================
    // Events
    // =========================================================

    startButton.addEventListener(
        'click',
        startScan
    );

    stopButton.addEventListener(
        'click',
        stopScan
    );

    resetButton.addEventListener(
        'click',
        resetScan
    );

    // =========================================================
    // 初始化
    // =========================================================

    render();

    console.log(
        `[V2EX Ignored] v${VERSION} 已加载`
    );

    // 只在 Userscript 本次加载时执行一次。
    //
    // 也就是：
    // - 新打开 /settings/block：执行一次
    // - F5 刷新：执行一次
    // - 页面一直开着：不会重复执行
    // - 切换标签页 / 窗口焦点：不会执行
    //
    // 只校验 state.ignored 中已有的节点，
    // 不扫描其余 1376 个节点。
    refreshIgnoredNodes();

})();
