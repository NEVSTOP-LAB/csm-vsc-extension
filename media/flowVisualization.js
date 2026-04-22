/**
 * Flow Visualization Panel — Webview Script
 *
 * Architecture:
 *   1. Render-log helper          (sync — available immediately)
 *   2. Collapsible-section logic  (sync — always works)
 *   3. Toolbar button handlers    (sync — always works)
 *   4. Zoom / Pan logic           (sync — always works)
 *   5. Mermaid rendering          (async IIFE — may fail independently)
 *
 * Dynamic data is read from  window.__WEBVIEW_DATA__  which the host
 * TypeScript sets via a small inline <script> before this file loads.
 */

// ---------------------------------------------------------------------------
// 0.  Globals
// ---------------------------------------------------------------------------

/* global mermaid, acquireVsCodeApi */
/* eslint-disable no-var */

var DATA        = window.__WEBVIEW_DATA__ || {};
var vscode      = acquireVsCodeApi();
var container   = document.getElementById('mermaid-container');
var diagram     = document.getElementById('diagram');
var errorDiv    = document.getElementById('error');

// ---------------------------------------------------------------------------
// 1.  Render-log helper
// ---------------------------------------------------------------------------

var _renderLogs = [];

function renderLog(msg) {
    var ts = new Date().toISOString().slice(11, 23);
    var entry = '[' + ts + '] ' + msg;
    _renderLogs.push(entry);
    var ta = document.getElementById('render-log-textarea');
    if (ta) { ta.value = _renderLogs.join('\n'); }
}

renderLog('Page loaded, mermaid type: ' + typeof mermaid);

// ---------------------------------------------------------------------------
// 2.  Collapsible sections (generic)
// ---------------------------------------------------------------------------

function initCollapsible(headerId, bodyId, toggleId, labelId, showText, hideText) {
    var header = document.getElementById(headerId);
    if (!header) { return; }
    header.addEventListener('click', function () {
        var body   = document.getElementById(bodyId);
        var toggle = document.getElementById(toggleId);
        var label  = document.getElementById(labelId);
        if (!body) { return; }

        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            if (toggle) { toggle.textContent = '\u25B6'; }
            if (label)  { label.textContent  = showText; }
        } else {
            body.classList.add('expanded');
            if (toggle) { toggle.textContent = '\u25BC'; }
            if (label)  { label.textContent  = hideText; }
        }
    });
}

initCollapsible(
    'raw-mermaid-header', 'raw-mermaid-body',
    'raw-mermaid-toggle', 'raw-mermaid-label',
    'Show Raw Mermaid Code', 'Hide Raw Mermaid Code'
);

initCollapsible(
    'render-log-header', 'render-log-body',
    'render-log-toggle', 'render-log-label',
    'Show Render Log', 'Hide Render Log'
);

// Copy button
(function () {
    var btn = document.getElementById('btn-copy-mermaid');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
        var ta = document.getElementById('raw-mermaid-textarea');
        if (!ta) { return; }
        navigator.clipboard.writeText(ta.value).then(function () {
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = orig; }, 1500);
        });
    });
})();

// ---------------------------------------------------------------------------
// 3.  Error helper
// ---------------------------------------------------------------------------

function showError(message) {
    renderLog('ERROR: ' + message);
    if (errorDiv) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Error rendering diagram: ' + message;
    }
}

// ---------------------------------------------------------------------------
// 4.  Color utilities (for adaptive theme colors)
// ---------------------------------------------------------------------------

function clampByte(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function parseColorToRgb(color) {
    if (!color || color === 'none' || color === 'transparent') { return null; }
    var value = color.trim();
    if (value.startsWith('#')) {
        var hex = value.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
        }
        if (hex.length !== 6 && hex.length !== 8) { return null; }
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }
    var m = value.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
        var parts = m[1].split(',').map(function (p) { return p.trim(); });
        if (parts.length < 3) { return null; }
        var r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2]);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) { return null; }
        return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
    }
    return null;
}

function relativeLuminance(rgb) {
    function lin(c) { var v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function contrastRatio(a, b) {
    var l1 = relativeLuminance(a), l2 = relativeLuminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function chooseReadableTextColor(bg, fg) {
    var white = { r: 255, g: 255, b: 255 };
    var black = { r: 0, g: 0, b: 0 };
    var candidates = [
        { css: 'rgb(255, 255, 255)', rgb: white },
        { css: 'rgb(0, 0, 0)',       rgb: black }
    ];
    if (fg) {
        candidates.push({ css: 'rgb(' + fg.r + ', ' + fg.g + ', ' + fg.b + ')', rgb: fg });
    }
    var best = candidates[0], bestC = contrastRatio(bg, candidates[0].rgb);
    for (var i = 1; i < candidates.length; i++) {
        var c = contrastRatio(bg, candidates[i].rgb);
        if (c > bestC) { bestC = c; best = candidates[i]; }
    }
    return best.css;
}

function blendRgb(front, back, alpha) {
    return {
        r: clampByte(front.r * alpha + back.r * (1 - alpha)),
        g: clampByte(front.g * alpha + back.g * (1 - alpha)),
        b: clampByte(front.b * alpha + back.b * (1 - alpha))
    };
}

function toCssRgb(rgb) { return 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')'; }
function toCssRgba(rgb, a) { return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + a + ')'; }

function isSimilarRgb(a, b, threshold) {
    if (!a || !b) { return false; }
    if (threshold === undefined) { threshold = 16; }
    return Math.abs(a.r - b.r) <= threshold
        && Math.abs(a.g - b.g) <= threshold
        && Math.abs(a.b - b.b) <= threshold;
}

// ---------------------------------------------------------------------------
// 5.  Adaptive color application
// ---------------------------------------------------------------------------

var branchLabelPalette = {
    yes: { r: 46, g: 139, b: 87 },
    no:  { r: 192, g: 57, b: 43 }
};

function applyBranchEdgeLabelColors(themeBg, themeFg) {
    if (!container) { return; }
    var fallbackBg = themeBg || { r: 30, g: 30, b: 30 };

    container.querySelectorAll('.edgeLabel').forEach(function (edgeLabel) {
        var text = (edgeLabel.textContent || '').trim().toLowerCase().replace(/[^a-z]/g, '');
        var branchRgb = branchLabelPalette[text];
        if (!branchRgb) { return; }

        var chipBg = blendRgb(branchRgb, fallbackBg, 0.18);
        var textColor = chooseReadableTextColor(chipBg, themeFg);
        var chipBgCss = toCssRgb(chipBg);
        var borderCss = toCssRgba(branchRgb, 0.75);

        edgeLabel.style.backgroundColor = chipBgCss;
        edgeLabel.style.color = textColor;
        edgeLabel.style.border = '1px solid ' + borderCss;
        edgeLabel.style.borderRadius = '999px';
        edgeLabel.style.padding = '2px 8px';
        edgeLabel.style.fontWeight = '600';
        edgeLabel.style.opacity = '1';
        edgeLabel.style.setProperty('color', textColor, 'important');
        edgeLabel.style.setProperty('fill', textColor, 'important');

        edgeLabel.querySelectorAll('.label, .label > div, span, p, tspan').forEach(function (el) {
            el.style.setProperty('color', textColor, 'important');
            el.style.setProperty('fill', textColor, 'important');
            el.style.backgroundColor = 'transparent';
            el.style.fontWeight = '600';
            el.style.opacity = '1';
        });

        edgeLabel.querySelectorAll('rect').forEach(function (rect) {
            rect.style.fill = chipBgCss;
            rect.style.stroke = borderCss;
            rect.style.rx = '999';
            rect.style.ry = '999';
        });
    });
}

function applyAdaptiveEdgeColors(themeBg, themeFg) {
    if (!container) { return; }
    var fallbackBg = themeBg || { r: 30, g: 30, b: 30 };
    var contrastCss = chooseReadableTextColor(fallbackBg, themeFg);
    var contrastRgb = parseColorToRgb(contrastCss);
    var defaultCandidates = [themeFg, { r: 51, g: 51, b: 51 }, { r: 153, g: 153, b: 153 }].filter(Boolean);

    container.querySelectorAll('.flowchart-link, .edge-pattern-dotted, .cluster rect, .cluster polygon, .cluster path').forEach(function (el) {
        var inlineStyle = (el.getAttribute('style') || '').toLowerCase();
        if (/stroke\s*:\s*(#|rgb\(|hsl\()/i.test(inlineStyle)) { return; }
        var strokeRgb = parseColorToRgb(getComputedStyle(el).stroke);
        var shouldAdapt = !strokeRgb || defaultCandidates.some(function (c) { return isSimilarRgb(strokeRgb, c); });
        if (shouldAdapt) { el.style.setProperty('stroke', contrastCss, 'important'); }
    });

    container.querySelectorAll('.arrowheadPath, .arrowMarkerPath').forEach(function (el) {
        var inlineStyle = (el.getAttribute('style') || '').toLowerCase();
        if (/(fill|stroke)\s*:\s*(#|rgb\(|hsl\()/i.test(inlineStyle)) { return; }
        var fillRgb = parseColorToRgb(getComputedStyle(el).fill);
        var strokeRgb = parseColorToRgb(getComputedStyle(el).stroke);
        var shouldAdapt = (!fillRgb || defaultCandidates.some(function (c) { return isSimilarRgb(fillRgb, c); }))
            && (!strokeRgb || defaultCandidates.some(function (c) { return isSimilarRgb(strokeRgb, c); }));
        if (shouldAdapt && contrastRgb) {
            el.style.setProperty('fill', contrastCss, 'important');
            el.style.setProperty('stroke', contrastCss, 'important');
        }
    });
}

function applyAdaptiveLabelColors() {
    if (!container) { return; }
    var themeBg = parseColorToRgb(getComputedStyle(document.body).getPropertyValue('--vscode-editor-background'));
    var themeFg = parseColorToRgb(getComputedStyle(document.body).getPropertyValue('--vscode-foreground'));
    var fallbackBg = themeBg || { r: 30, g: 30, b: 30 };

    container.querySelectorAll('g.node').forEach(function (nodeGroup) {
        var label = nodeGroup.querySelector('.nodeLabel');
        if (!label) { return; }
        var shape = nodeGroup.querySelector('rect, polygon, circle, ellipse, path');
        var fillRgb = parseColorToRgb(shape ? getComputedStyle(shape).fill : '') || fallbackBg;
        var textColor = chooseReadableTextColor(fillRgb, themeFg);
        label.style.color = textColor;

        var labelContainers = nodeGroup.querySelectorAll('.label, .label > div');
        labelContainers.forEach(function (el) { el.style.color = textColor; });

        if (nodeGroup.classList.contains('condition')) {
            var chipBg = blendRgb(fillRgb, fallbackBg, 0.86);
            var chipCss = 'rgba(' + chipBg.r + ', ' + chipBg.g + ', ' + chipBg.b + ', 0.92)';
            labelContainers.forEach(function (el) {
                el.style.backgroundColor = chipCss;
                el.style.borderRadius = '2px';
                el.style.padding = '1px 1px';
            });
        }
    });

    applyAdaptiveEdgeColors(themeBg, themeFg);
    applyBranchEdgeLabelColors(themeBg, themeFg);
}

// ---------------------------------------------------------------------------
// 6.  Zoom & Pan
// ---------------------------------------------------------------------------

var FIT_PADDING = 40;
var ZOOM_STEP   = 0.1;
var ZOOM_STEP_WHEEL = 0.05;
var ZOOM_MIN    = 0.1;
var ZOOM_MAX    = 5;
var zoomLevel = 1;
var panX = 0;
var panY = 0;
var fitMode = null; // 'width' | 'height' | 'both' | null
var transformTransitionTimer;
var zoomLevelDisplay = document.getElementById('zoom-level');

function updateZoomLevelDisplay() {
    if (zoomLevelDisplay) {
        zoomLevelDisplay.textContent = 'Zoom: ' + Math.round(zoomLevel * 100) + '%';
    }
}

function applyTransform(options) {
    if (!container) { return; }
    options = options || {};
    if (options.animate) {
        container.style.transition = 'transform 0.25s ease-out';
        if (transformTransitionTimer) { clearTimeout(transformTransitionTimer); }
        transformTransitionTimer = window.setTimeout(function () {
            if (container) { container.style.transition = ''; }
        }, 300);
    } else {
        container.style.transition = '';
    }
    container.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoomLevel + ')';
    updateZoomLevelDisplay();
}

function centerDiagram() {
    if (!container || !diagram) { return; }
    var naturalWidth = container.offsetWidth;
    var viewWidth = diagram.clientWidth;
    if (naturalWidth <= 0 || viewWidth <= 0) { return; }
    panX = (viewWidth - naturalWidth * zoomLevel) / 2;
}

function fitToViewport(fitW, fitH) {
    if (!fitW && !fitH) { return; }
    if (!container || !diagram) { return; }
    var nw = container.offsetWidth, nh = container.offsetHeight;
    var vw = diagram.clientWidth, vh = diagram.clientHeight;
    if (nw <= 0 || nh <= 0 || vw <= 0 || vh <= 0) { return; }
    var scales = [];
    if (fitW) { scales.push((vw - FIT_PADDING) / nw); }
    if (fitH) { scales.push((vh - FIT_PADDING) / nh); }
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min.apply(null, scales)));
    panY = 0;
    centerDiagram();
    applyTransform();
}

function applyCurrentFitMode() {
    if (fitMode === 'width')  { fitToViewport(true, false); }
    else if (fitMode === 'height') { fitToViewport(false, true); }
    else if (fitMode === 'both')   { fitToViewport(true, true); }
}

function setFitMode(mode) { fitMode = mode; applyCurrentFitMode(); }
function disableFitMode()  { fitMode = null; }

// ---------------------------------------------------------------------------
// 7.  Toolbar button handlers
// ---------------------------------------------------------------------------

document.getElementById('btn-refresh').addEventListener('click', function () {
    vscode.postMessage({ command: 'refresh' });
});

document.getElementById('btn-switch-view').addEventListener('click', function () {
    vscode.postMessage({ command: 'switchView', view: DATA.toggleTarget });
});

document.getElementById('btn-open-file').addEventListener('click', function () {
    vscode.postMessage({ command: 'openSourceFile' });
});

document.getElementById('btn-zoom-in').addEventListener('click', function () {
    disableFitMode();
    zoomLevel = Math.min(zoomLevel + ZOOM_STEP, ZOOM_MAX);
    applyTransform();
});

document.getElementById('btn-zoom-out').addEventListener('click', function () {
    disableFitMode();
    zoomLevel = Math.max(zoomLevel - ZOOM_STEP, ZOOM_MIN);
    applyTransform();
});

document.getElementById('btn-zoom-100').addEventListener('click', function () {
    disableFitMode();
    zoomLevel = 1;
    panY = 0;
    centerDiagram();
    applyTransform();
});

document.getElementById('btn-fit-width').addEventListener('click', function () { setFitMode('width'); });
document.getElementById('btn-fit-height').addEventListener('click', function () { setFitMode('height'); });
document.getElementById('btn-fit-both').addEventListener('click', function () { setFitMode('both'); });

// ---------------------------------------------------------------------------
// 8.  Mouse wheel: Ctrl+Scroll = zoom, plain Scroll = vertical pan
// ---------------------------------------------------------------------------

if (diagram) {
    diagram.addEventListener('wheel', function (e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            disableFitMode();
            var delta = e.deltaY > 0 ? -ZOOM_STEP_WHEEL : ZOOM_STEP_WHEEL;
            zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel + delta));
            applyTransform();
        } else {
            e.preventDefault();
            panY -= e.deltaY;
            panX -= e.deltaX;
            applyTransform();
        }
    }, { passive: false });
}

// Responsive fit mode on resize
window.addEventListener('resize', function () {
    if (fitMode) { applyCurrentFitMode(); }
    else { applyTransform(); }
});

// ---------------------------------------------------------------------------
// 9.  Left-click drag to pan
// ---------------------------------------------------------------------------

(function () {
    var isDragging = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;
    var dragDistance = 0;
    var DRAG_THRESHOLD = 4;
    if (!diagram) { return; }

    diagram.addEventListener('mousedown', function (e) {
        if (e.button !== 0) { return; }
        isDragging = true;
        dragDistance = 0;
        dragStartX = e.clientX; dragStartY = e.clientY;
        panStartX = panX;       panStartY = panY;
        diagram.classList.add('grabbing');
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) { return; }
        var dx = e.clientX - dragStartX;
        var dy = e.clientY - dragStartY;
        dragDistance = Math.sqrt(dx * dx + dy * dy);
        panX = panStartX + dx;
        panY = panStartY + dy;
        applyTransform();
    });

    document.addEventListener('mouseup', function () {
        if (isDragging) { isDragging = false; diagram.classList.remove('grabbing'); }
    });

    // Expose drag state so node-click handler can distinguish click vs drag
    window.__dragState = { isDragging: function () { return isDragging; }, wasDrag: function () { return dragDistance > DRAG_THRESHOLD; } };
})();

// ---------------------------------------------------------------------------
// 10. Export SVG
// ---------------------------------------------------------------------------

document.getElementById('btn-export-svg').addEventListener('click', function () {
    var svg = document.querySelector('#mermaid-container svg');
    if (!svg) { return; }
    var serializer = new XMLSerializer();
    var svgString = serializer.serializeToString(svg);
    var blob = new Blob([svgString], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'csmscript-flow.svg';
    a.click();
    URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------------------
// 11. Cursor-based scrolling
// ---------------------------------------------------------------------------

var nodeLineMap = DATA.nodeLineMap || {};

function findNodeElement(nodeId) {
    if (!container) { return null; }
    var els = container.querySelectorAll('.node');
    for (var i = 0; i < els.length; i++) {
        var elId = els[i].getAttribute('id') || '';
        if (elId.startsWith('flowchart-' + nodeId + '-') || elId === nodeId) { return els[i]; }
    }
    return null;
}

function findClosestNodeId(line) {
    var bestId = null, bestDist = Infinity;
    var keys = Object.keys(nodeLineMap);
    for (var i = 0; i < keys.length; i++) {
        var d = Math.abs(nodeLineMap[keys[i]] - line);
        if (d < bestDist) { bestDist = d; bestId = keys[i]; }
    }
    return bestId;
}

function scrollToNode(nodeId) {
    if (!diagram || !container) { return; }
    var el = findNodeElement(nodeId);
    if (!el) { return; }

    var rect = el.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    var diagramRect = diagram.getBoundingClientRect();
    var prevPanX = panX, prevPanY = panY;

    var visH = rect.right > diagramRect.left && rect.left < diagramRect.right;
    var visV = rect.bottom > diagramRect.top && rect.top < diagramRect.bottom;

    if (!visH || !visV) {
        var viewportHeight = diagramRect.height;
        var contentHeight = container.offsetHeight * zoomLevel;
        var minPanY = Math.min(0, viewportHeight - contentHeight);
        var nodeTopY = (rect.top - containerRect.top) / zoomLevel;
        var desiredPanY = 12 - nodeTopY * zoomLevel;
        panY = Math.max(minPanY, Math.min(0, desiredPanY));
        applyTransform({ animate: prevPanX !== panX || prevPanY !== panY });
    }

    // Brief highlight
    el.style.transition = 'filter 0.3s';
    el.style.filter = 'brightness(1.3) drop-shadow(0 0 6px rgba(0,120,215,0.8))';
    setTimeout(function () {
        el.style.filter = '';
        setTimeout(function () { el.style.transition = ''; }, 300);
    }, 800);
}

window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.command === 'scrollToLine') {
        var nodeId = findClosestNodeId(msg.line);
        if (nodeId) { scrollToNode(nodeId); }
    }
});

// ---------------------------------------------------------------------------
// 12. Mermaid rendering  (async IIFE — isolated from the rest)
// ---------------------------------------------------------------------------

(async function () {
    var mermaidCode = DATA.mermaidCode || '';

    try {
        renderLog('Initializing mermaid...');
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'strict',
            flowchart: {
                useMaxWidth: false,
                htmlLabels: true,
                curve: 'basis'
            }
        });
        renderLog('Mermaid initialized');

        renderLog('Mermaid code length: ' + mermaidCode.length + ' chars');
        renderLog('Starting mermaid.render...');
        var result = await mermaid.render('mermaid-graph', mermaidCode);
        renderLog('Mermaid render complete, SVG length: ' + result.svg.length);

        if (container) {
            container.innerHTML = result.svg;
            renderLog('SVG injected into container');
            applyAdaptiveLabelColors();
            renderLog('Adaptive label colors applied');
        } else {
            showError('Diagram container element not found.');
        }
    } catch (e) {
        var message = e instanceof Error ? e.message : String(e);
        renderLog('Mermaid render FAILED: ' + message);
        showError(message);
    }

    // Attach click handlers to nodes for editor navigation
    if (container) {
        container.querySelectorAll('g.node').forEach(function (nodeGroup) {
            nodeGroup.style.cursor = 'pointer';
            nodeGroup.addEventListener('click', function (e) {
                // Ignore if the user was dragging to pan
                if (window.__dragState && window.__dragState.wasDrag()) { return; }
                var elId = nodeGroup.getAttribute('id') || '';
                // Mermaid generates IDs like "flowchart-nodeId-123"
                var keys = Object.keys(nodeLineMap);
                for (var i = 0; i < keys.length; i++) {
                    var nid = keys[i];
                    if (elId.startsWith('flowchart-' + nid + '-') || elId === nid) {
                        var line = nodeLineMap[nid];
                        if (Number.isInteger(line) && line >= 0) {
                            vscode.postMessage({ command: 'goToLine', line: line });
                        }
                        return;
                    }
                }
            });
        });
        renderLog('Node click handlers attached');
    }

    // Auto-fit after render
    if (container && diagram) {
        var naturalWidth = container.offsetWidth;
        var viewWidth = diagram.clientWidth;
        if (naturalWidth > 0 && viewWidth > 0) {
            var fitZoom = Math.min(1, (viewWidth - FIT_PADDING) / naturalWidth);
            zoomLevel = Math.max(ZOOM_MIN, fitZoom);
            panY = 0;
            centerDiagram();
            applyTransform();
            renderLog('Auto-fit applied, zoom=' + Math.round(zoomLevel * 100) + '%');
        }
    }
})();
