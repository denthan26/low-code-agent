// ===== 全局状态 =====
let nodes = [];
let edges = [];
let nodeIdCounter = 0;
let selectedNodeId = null;
let editingNodeId = null;
let isDragging = false;
let dragNodeId = null;
let dragOffset = { x: 0, y: 0 };
let isConnecting = false;
let connectSourceId = null;
let tempLine = null;

// ===== DOM 元素 =====
const nodesLayer = document.getElementById('nodesLayer');
const connectionsLayer = document.getElementById('connectionsLayer');
const canvasContainer = document.getElementById('canvasContainer');
const canvasPlaceholder = document.getElementById('canvasPlaceholder');
const modalOverlay = document.getElementById('modalOverlay');
const modalBody = document.getElementById('modalBody');
const modalTitle = document.getElementById('modalTitle');
const btnAddInput = document.getElementById('btnAddInput');
const btnAddOutput = document.getElementById('btnAddOutput');
const logContent = document.getElementById('logContent');

// ===== 工具函数 =====
function generateId() {
    return 'node_' + (++nodeIdCounter);
}

function getNodePosition() {
    const containerRect = canvasContainer.getBoundingClientRect();
    const existingNodes = nodes.length;
    const cols = 3;
    const col = existingNodes % cols;
    const row = Math.floor(existingNodes / cols);
    return {
        x: 100 + col * 280,
        y: 80 + row * 180
    };
}

function updatePlaceholder() {
    canvasPlaceholder.style.display = nodes.length === 0 ? 'block' : 'none';
}

function updateButtonStates() {
    const hasInput = nodes.some(n => n.type === 'input');
    const hasOutput = nodes.some(n => n.type === 'output');
    btnAddInput.disabled = hasInput;
    btnAddOutput.disabled = hasOutput;
}

// ===== 节点操作 =====
function addNode(type) {
    // 检查数量限制
    if (type === 'input' && nodes.some(n => n.type === 'input')) {
        alert('输入节点只能有一个！');
        return;
    }
    if (type === 'output' && nodes.some(n => n.type === 'output')) {
        alert('输出节点只能有一个！');
        return;
    }

    const pos = getNodePosition();
    const node = {
        id: generateId(),
        type: type,
        x: pos.x,
        y: pos.y,
        config: getDefaultConfig(type)
    };

    nodes.push(node);
    renderNode(node);
    updatePlaceholder();
    updateButtonStates();
}

function getDefaultConfig(type) {
    switch (type) {
        case 'input':
            return { value: 'Hello, Agent!' };
        case 'code':
            return { code: '# 使用 input_data 获取上游输入\n# 将结果赋值给 result 变量\n\nresult = input_data\nprint(f"处理结果: {result}")' };
        case 'output':
            return {};
        default:
            return {};
    }
}

function renderNode(node) {
    const el = document.createElement('div');
    el.className = `flow-node node-type-${node.type}`;
    el.id = node.id;
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';

    const icons = {
        input: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        output: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
    };

    const titles = {
        input: '输入节点',
        code: '代码节点',
        output: '输出节点'
    };

    const previewText = getPreviewText(node);

    el.innerHTML = `
        <div class="node-header">
            <div class="node-icon">${icons[node.type]}</div>
            <span class="node-title">${titles[node.type]}</span>
            <div class="node-actions">
                <button class="node-btn" onclick="editNode('${node.id}', event)" title="编辑">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="node-btn delete" onclick="deleteNode('${node.id}', event)" title="删除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="node-body">
            <div class="node-preview">${previewText}</div>
        </div>
        <div class="node-ports">
            ${node.type !== 'input' ? `<div class="port input-port" data-node="${node.id}" data-port="input"></div>` : ''}
            ${node.type !== 'output' ? `<div class="port output-port" data-node="${node.id}" data-port="output"></div>` : ''}
        </div>
    `;

    // 拖拽事件
    el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.port') || e.target.closest('.node-btn')) return;
        startDrag(e, node.id);
    });

    nodesLayer.appendChild(el);
}

function getPreviewText(node) {
    if (node.type === 'input') {
        return node.config.value || '(空)';
    } else if (node.type === 'code') {
        const code = node.config.code || '';
        const firstLine = code.split('\n')[0];
        return firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine;
    } else {
        return '等待输入...';
    }
}

function updateNodeElement(node) {
    const el = document.getElementById(node.id);
    if (!el) return;

    const preview = el.querySelector('.node-preview');
    if (preview) {
        preview.textContent = getPreviewText(node);
    }
}

function deleteNode(nodeId, event) {
    event.stopPropagation();
    if (!confirm('确定要删除这个节点吗？')) return;

    // 删除相关连线
    edges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);

    // 删除节点
    nodes = nodes.filter(n => n.id !== nodeId);

    const el = document.getElementById(nodeId);
    if (el) el.remove();

    renderConnections();
    updatePlaceholder();
    updateButtonStates();
}

function editNode(nodeId, event) {
    event.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    editingNodeId = nodeId;
    modalTitle.textContent = '编辑节点';

    let content = '';
    if (node.type === 'input') {
        content = `
            <div class="form-group">
                <label>输入值</label>
                <input type="text" id="configValue" value="${escapeHtml(node.config.value || '')}" placeholder="请输入初始值">
                <p class="form-hint">这个值将作为整个工作流的输入数据</p>
            </div>
        `;
    } else if (node.type === 'code') {
        content = `
            <div class="form-group">
                <label>Python 代码</label>
                <textarea id="configCode" placeholder="编写 Python 代码...">${escapeHtml(node.config.code || '')}</textarea>
                <p class="form-hint">
                    • 使用 <code>input_data</code> 获取上游输入<br>
                    • 将结果赋值给 <code>result</code> 变量<br>
                    • 支持 print() 输出到控制台
                </p>
            </div>
        `;
    } else if (node.type === 'output') {
        content = `
            <div class="form-group">
                <label>输出节点</label>
                <p class="form-hint">输出节点不需要配置，它会自动显示上游传递的数据。</p>
            </div>
        `;
    }

    modalBody.innerHTML = content;
    modalOverlay.classList.add('active');
}

function saveNodeConfig() {
    const node = nodes.find(n => n.id === editingNodeId);
    if (!node) return;

    if (node.type === 'input') {
        const value = document.getElementById('configValue').value;
        node.config.value = value;
    } else if (node.type === 'code') {
        const code = document.getElementById('configCode').value;
        node.config.code = code;
    }

    updateNodeElement(node);
    closeModal();
}

function closeModal() {
    modalOverlay.classList.remove('active');
    editingNodeId = null;
}

// ===== 连线操作 =====
function renderConnections() {
    // 清除现有连线
    const existingLines = connectionsLayer.querySelectorAll('.connection-line');
    existingLines.forEach(line => line.remove());

    // 更新端口状态
    document.querySelectorAll('.port').forEach(port => {
        port.classList.remove('connected');
    });

    edges.forEach(edge => {
        drawConnection(edge);

        // 标记已连接的端口
        const sourcePort = document.querySelector(`.port[data-node="${edge.source}"][data-port="output"]`);
        const targetPort = document.querySelector(`.port[data-node="${edge.target}"][data-port="input"]`);
        if (sourcePort) sourcePort.classList.add('connected');
        if (targetPort) targetPort.classList.add('connected');
    });
}

function drawConnection(edge) {
    const sourceEl = document.getElementById(edge.source);
    const targetEl = document.getElementById(edge.target);
    if (!sourceEl || !targetEl) return;

    const sourcePort = sourceEl.querySelector('.output-port');
    const targetPort = targetEl.querySelector('.input-port');
    if (!sourcePort || !targetPort) return;

    const sourceRect = sourcePort.getBoundingClientRect();
    const targetRect = targetPort.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();

    const x1 = sourceRect.left + sourceRect.width / 2 - containerRect.left;
    const y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
    const x2 = targetRect.left + targetRect.width / 2 - containerRect.left;
    const y2 = targetRect.top + targetRect.height / 2 - containerRect.top;

    // 贝塞尔曲线
    const cp1x = x1 + 80;
    const cp1y = y1;
    const cp2x = x2 - 80;
    const cp2y = y2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`);
    path.setAttribute('class', 'connection-line');
    path.setAttribute('data-source', edge.source);
    path.setAttribute('data-target', edge.target);

    // 点击删除连线
    path.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('删除这条连线？')) {
            edges = edges.filter(e => !(e.source === edge.source && e.target === edge.target));
            renderConnections();
        }
    });

    connectionsLayer.appendChild(path);
}

function drawTempLine(x1, y1, x2, y2) {
    if (tempLine) tempLine.remove();

    const cp1x = x1 + 80;
    const cp1y = y1;
    const cp2x = x2 - 80;
    const cp2y = y2;

    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempLine.setAttribute('d', `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`);
    tempLine.setAttribute('class', 'connection-line temp');
    connectionsLayer.appendChild(tempLine);
}

// ===== 拖拽功能 =====
function startDrag(e, nodeId) {
    if (isConnecting) return;
    isDragging = true;
    dragNodeId = nodeId;

    const node = nodes.find(n => n.id === nodeId);
    const rect = canvasContainer.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left - node.x;
    dragOffset.y = e.clientY - rect.top - node.y;

    const el = document.getElementById(nodeId);
    el.classList.add('dragging');
}

function onMouseMove(e) {
    if (isDragging && dragNodeId) {
        const rect = canvasContainer.getBoundingClientRect();
        const node = nodes.find(n => n.id === dragNodeId);

        node.x = e.clientX - rect.left - dragOffset.x;
        node.y = e.clientY - rect.top - dragOffset.y;

        // 边界限制
        node.x = Math.max(0, Math.min(node.x, rect.width - 220));
        node.y = Math.max(0, Math.min(node.y, rect.height - 100));

        const el = document.getElementById(dragNodeId);
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';

        renderConnections();
    }

    if (isConnecting && connectSourceId) {
        const rect = canvasContainer.getBoundingClientRect();
        const sourceEl = document.getElementById(connectSourceId);
        const sourcePort = sourceEl.querySelector('.output-port');
        const sourceRect = sourcePort.getBoundingClientRect();

        const x1 = sourceRect.left + sourceRect.width / 2 - rect.left;
        const y1 = sourceRect.top + sourceRect.height / 2 - rect.top;
        const x2 = e.clientX - rect.left;
        const y2 = e.clientY - rect.top;

        drawTempLine(x1, y1, x2, y2);
    }
}

function onMouseUp(e) {
    if (isDragging && dragNodeId) {
        const el = document.getElementById(dragNodeId);
        if (el) el.classList.remove('dragging');
        isDragging = false;
        dragNodeId = null;
    }

    if (isConnecting) {
        // 检查是否释放到目标端口
        const targetPort = e.target.closest('.port.input-port');
        if (targetPort) {
            const targetNodeId = targetPort.dataset.node;

            // 检查是否已存在连接
            const existing = edges.find(e => e.target === targetNodeId);
            if (existing) {
                alert('该节点已有输入连接！');
            } else if (targetNodeId === connectSourceId) {
                alert('不能连接到自己！');
            } else {
                edges.push({
                    source: connectSourceId,
                    target: targetNodeId
                });
            }
        }

        if (tempLine) {
            tempLine.remove();
            tempLine = null;
        }
        isConnecting = false;
        connectSourceId = null;
        renderConnections();
    }
}

// ===== 端口连接事件 =====
nodesLayer.addEventListener('mousedown', (e) => {
    const port = e.target.closest('.port.output-port');
    if (port) {
        e.preventDefault();
        e.stopPropagation();
        isConnecting = true;
        connectSourceId = port.dataset.node;
    }
});

// ===== 运行工作流 =====
async function runWorkflow() {
    if (nodes.length === 0) {
        alert('请先添加节点！');
        return;
    }

    // 检查是否有输入和输出节点
    const hasInput = nodes.some(n => n.type === 'input');
    const hasOutput = nodes.some(n => n.type === 'output');

    if (!hasInput) {
        alert('请添加输入节点！');
        return;
    }
    if (!hasOutput) {
        alert('请添加输出节点！');
        return;
    }

    // 清除之前的状态
    document.querySelectorAll('.flow-node').forEach(el => {
        el.classList.remove('executing', 'executed-success', 'executed-error');
    });

    logContent.innerHTML = '<p class="log-empty">正在执行...</p>';

    try {
        const response = await fetch('/api/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes, edges })
        });

        const data = await response.json();

        if (data.success) {
            // 显示执行日志
            displayExecutionLog(data.executionLog);

            // 标记节点状态
            data.executionLog.forEach(log => {
                const el = document.getElementById(log.nodeId);
                if (el) {
                    if (log.status === 'success') {
                        el.classList.add('executed-success');
                    } else {
                        el.classList.add('executed-error');
                    }
                }
            });

            // 显示结果
            showResult(data.result);
        } else {
            logContent.innerHTML = `<p style="color: var(--danger)">错误: ${data.error}</p>`;
        }
    } catch (error) {
        logContent.innerHTML = `<p style="color: var(--danger)">请求失败: ${error.message}</p>`;
    }
}

function displayExecutionLog(logs) {
    logContent.innerHTML = '';

    logs.forEach((log, index) => {
        const entry = document.createElement('div');
        entry.className = `log-entry ${log.status}`;

        const typeNames = { input: '输入', code: '代码', output: '输出' };

        entry.innerHTML = `
            <div class="log-node-name">[${index + 1}] ${typeNames[log.nodeType] || log.nodeType}</div>
            <div class="log-detail">
                ${log.input ? `输入: ${truncate(log.input, 50)}<br>` : ''}
                输出: ${truncate(log.output, 100)}
            </div>
        `;

        logContent.appendChild(entry);
    });

    // 滚动到底部
    logContent.scrollTop = logContent.scrollHeight;
}

function showResult(result) {
    document.getElementById('resultOutput').textContent = result || '(无输出)';
    document.getElementById('resultModalOverlay').classList.add('active');
}

function closeResultModal() {
    document.getElementById('resultModalOverlay').classList.remove('active');
}

function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}

// ===== 清空画布 =====
function clearCanvas() {
    if (!confirm('确定要清空所有节点和连线吗？')) return;

    nodes = [];
    edges = [];
    nodesLayer.innerHTML = '';
    renderConnections();
    updatePlaceholder();
    updateButtonStates();
    logContent.innerHTML = '<p class="log-empty">点击「运行」查看执行日志</p>';
}

// ===== 工具函数 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== 全局事件监听 =====
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);

// 点击空白处关闭弹窗
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

document.getElementById('resultModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('resultModalOverlay')) closeResultModal();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeResultModal();
    }
});

// 窗口大小改变时重绘连线
window.addEventListener('resize', () => {
    renderConnections();
});

// ===== 初始化 =====
updatePlaceholder();
updateButtonStates();
