const API = {
    async request(method, url, body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        const token = localStorage.getItem('token');
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        if (res.status === 401) {
            localStorage.removeItem('token');
            showView('login');
            throw new Error('Unauthorized');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Request failed');
        return data;
    },
    get: (url) => API.request('GET', url),
    post: (url, body) => API.request('POST', url, body),
    put: (url, body) => API.request('PUT', url, body),
    patch: (url, body) => API.request('PATCH', url, body),
    del: (url, body) => API.request('DELETE', url, body),
};

// State
let currentPage = 1;
let searchQuery = '';

// -- Views --
function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add('active');

    const header = document.getElementById('main-header');
    header.style.display = (name === 'setup' || name === 'login') ? 'none' : '';
}

// -- Toast --
function toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '');
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

// -- Init --
async function init() {
    loadTheme();
    try {
        const status = await API.get('/api/auth/status');
        if (!status.setup_complete) {
            showView('setup');
            return;
        }
        if (localStorage.getItem('token')) {
            try {
                await API.get('/api/auth/me');
                showView('servers');
                loadServers();
            } catch {
                showView('login');
            }
        } else {
            showView('login');
        }
    } catch {
        showView('setup');
    }
}

// -- Auth: Setup --
async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('setup-username').value;
    const password = document.getElementById('setup-password').value;
    try {
        const data = await API.post('/api/auth/register', { username, password });
        document.getElementById('setup-step-1').style.display = 'none';
        document.getElementById('setup-step-2').style.display = 'block';
        document.getElementById('qr-display').innerHTML = data.qr_svg;
        document.getElementById('totp-secret-display').textContent = data.totp_secret;
    } catch (err) {
        toast(err.message, true);
    }
}

async function handleVerifySetup(e) {
    e.preventDefault();
    const code = document.getElementById('setup-totp-code').value;
    try {
        const data = await API.post('/api/auth/verify-setup', { totp_code: code });
        localStorage.setItem('token', data.token);
        toast('Account created!');
        showView('servers');
        loadServers();
    } catch (err) {
        toast(err.message, true);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const totp_code = document.getElementById('login-totp').value;
    try {
        const data = await API.post('/api/auth/login', { username, password, totp_code });
        localStorage.setItem('token', data.token);
        showView('servers');
        loadServers();
    } catch (err) {
        toast(err.message, true);
    }
}

async function handleLogout() {
    localStorage.removeItem('token');
    showView('login');
}

// -- Servers --
async function loadServers() {
    try {
        const data = await API.get(`/api/servers?page=${currentPage}&search=${encodeURIComponent(searchQuery)}`);
        renderServers(data);
    } catch (err) {
        if (err.message !== 'Unauthorized') toast(err.message, true);
    }
}

function renderServers(data) {
    const grid = document.getElementById('server-grid');
    if (data.servers.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <h3>${searchQuery ? 'No servers found' : 'No servers yet'}</h3>
                <p>${searchQuery ? 'Try a different search' : 'Add your first SSH server to get started'}</p>
            </div>`;
        document.getElementById('pagination').innerHTML = '';
        return;
    }

    grid.innerHTML = data.servers.map(s => `
        <div class="server-card" data-id="${s.id}">
            <div class="server-card-header">
                <h3>${esc(s.name)}</h3>
                <div class="server-card-actions">
                    <button class="btn btn-sm btn-icon" onclick="openEditServer(${s.id})" title="Edit">&#9998;</button>
                    <button class="btn btn-sm btn-icon btn-danger" onclick="openDeleteServer(${s.id}, '${esc(s.name)}')" title="Delete">&#10005;</button>
                </div>
            </div>
            <dl class="server-info">
                <dt>IP</dt><dd>${esc(s.default_ip)}</dd>
                ${s.secondary_ip ? `<dt>Alt</dt><dd>${esc(s.secondary_ip)}</dd>` : ''}
                <dt>Port</dt><dd>${s.port}</dd>
                <dt>User</dt><dd>${esc(s.ssh_user)}</dd>
            </dl>
            <div class="server-copy-actions">
                <button class="btn btn-sm" onclick="copySSH(${s.id}, '${esc(s.ssh_user)}', '${esc(s.default_ip)}', ${s.port})">
                    Copy SSH
                </button>
                ${s.secondary_ip ? `<button class="btn btn-sm" onclick="copySSH(${s.id}, '${esc(s.ssh_user)}', '${esc(s.secondary_ip)}', ${s.port})">Copy Alt SSH</button>` : ''}
                <button class="btn btn-sm" onclick="copyMonitor('${esc(s.ssh_user)}', '${esc(s.default_ip)}', ${s.port}, '${esc(s.monitor_tool || 'btop')}')">
                    Monitor (${esc(s.monitor_tool || 'btop')})
                </button>
            </div>
            ${s.notes ? `<p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:12px;">${esc(s.notes)}</p>` : ''}
            <div class="server-tasks" id="tasks-${s.id}">
                <div class="server-tasks-header">
                    <span>Tasks (${s.tasks_completed}/${s.task_count})</span>
                    <button class="btn btn-sm" onclick="toggleTaskInput(${s.id})">+ Add</button>
                </div>
                <ul class="task-list" id="task-list-${s.id}"></ul>
                <div class="task-add" id="task-add-${s.id}" style="display:none;">
                    <input type="text" placeholder="New task..." onkeydown="if(event.key==='Enter')addTask(${s.id}, this)">
                    <button class="btn btn-sm btn-primary" onclick="addTask(${s.id}, this.previousElementSibling)">Add</button>
                </div>
            </div>
        </div>
    `).join('');

    // Load tasks for each server
    data.servers.forEach(s => loadTasks(s.id));

    // Pagination
    const pagEl = document.getElementById('pagination');
    if (data.pages <= 1) { pagEl.innerHTML = ''; return; }
    let html = '';
    html += `<button class="btn btn-sm" onclick="goPage(${data.page - 1})" ${data.page <= 1 ? 'disabled' : ''}>&larr;</button>`;
    for (let i = 1; i <= data.pages; i++) {
        html += `<button class="btn btn-sm ${i === data.page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    }
    html += `<button class="btn btn-sm" onclick="goPage(${data.page + 1})" ${data.page >= data.pages ? 'disabled' : ''}>&rarr;</button>`;
    pagEl.innerHTML = html;
}

function goPage(p) { currentPage = p; loadServers(); }

function handleSearch(e) {
    searchQuery = e.target.value;
    currentPage = 1;
    clearTimeout(handleSearch._t);
    handleSearch._t = setTimeout(loadServers, 300);
}

// -- Copy --
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => copyFallback(text));
    } else {
        copyFallback(text);
    }
}

function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

function copySSH(id, user, ip, port) {
    const cmd = port === 22 ? `ssh ${user}@${ip}` : `ssh ${user}@${ip} -p ${port}`;
    copyToClipboard(cmd);
    toast('SSH command copied!');
}

function copyMonitor(user, ip, port, tool) {
    const ssh = port === 22 ? `ssh ${user}@${ip}` : `ssh ${user}@${ip} -p ${port}`;
    const cmd = `${ssh} -t '${tool}'`;
    copyToClipboard(cmd);
    toast('Monitor command copied!');
}

// -- Tasks --
async function loadTasks(serverId) {
    try {
        const tasks = await API.get(`/api/servers/${serverId}/tasks`);
        const list = document.getElementById(`task-list-${serverId}`);
        if (!list) return;
        list.innerHTML = tasks.map(t => `
            <li class="task-item ${t.completed ? 'completed' : ''}">
                <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTask(${serverId}, ${t.id}, this.checked)">
                <span>${esc(t.description)}</span>
                <button class="task-delete" onclick="deleteTask(${serverId}, ${t.id})">&#10005;</button>
            </li>
        `).join('');
    } catch {}
}

function toggleTaskInput(serverId) {
    const el = document.getElementById(`task-add-${serverId}`);
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    if (el.style.display === 'flex') el.querySelector('input').focus();
}

async function addTask(serverId, input) {
    const desc = input.value.trim();
    if (!desc) return;
    try {
        await API.post(`/api/servers/${serverId}/tasks`, { description: desc });
        input.value = '';
        loadTasks(serverId);
        loadServers();
    } catch (err) { toast(err.message, true); }
}

async function toggleTask(serverId, taskId, completed) {
    try {
        await API.patch(`/api/servers/${serverId}/tasks/${taskId}`, { completed });
        loadServers();
    } catch (err) { toast(err.message, true); }
}

async function deleteTask(serverId, taskId) {
    try {
        await API.del(`/api/servers/${serverId}/tasks/${taskId}`);
        loadTasks(serverId);
        loadServers();
    } catch (err) { toast(err.message, true); }
}

// -- Server Modal --
function openAddServer() {
    document.getElementById('modal-server-title').textContent = 'Add Server';
    document.getElementById('server-form').reset();
    document.getElementById('server-form').dataset.id = '';
    openModal('modal-server');
}

async function openEditServer(id) {
    try {
        const s = await API.get(`/api/servers/${id}`);
        document.getElementById('modal-server-title').textContent = 'Edit Server';
        document.getElementById('srv-name').value = s.name;
        document.getElementById('srv-ip').value = s.default_ip;
        document.getElementById('srv-ip2').value = s.secondary_ip || '';
        document.getElementById('srv-port').value = s.port;
        document.getElementById('srv-user').value = s.ssh_user;
        document.getElementById('srv-notes').value = s.notes || '';
        document.getElementById('srv-monitor').value = s.monitor_tool || 'btop';
        document.getElementById('server-form').dataset.id = id;
        openModal('modal-server');
    } catch (err) { toast(err.message, true); }
}

async function handleServerSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
        name: document.getElementById('srv-name').value,
        default_ip: document.getElementById('srv-ip').value,
        secondary_ip: document.getElementById('srv-ip2').value,
        port: parseInt(document.getElementById('srv-port').value) || 22,
        ssh_user: document.getElementById('srv-user').value,
        notes: document.getElementById('srv-notes').value,
        monitor_tool: document.getElementById('srv-monitor').value,
    };
    try {
        if (form.dataset.id) {
            await API.put(`/api/servers/${form.dataset.id}`, data);
            toast('Server updated');
        } else {
            await API.post('/api/servers', data);
            toast('Server added');
        }
        closeModal('modal-server');
        loadServers();
    } catch (err) { toast(err.message, true); }
}

// -- Delete Modal --
let deleteTarget = null;

function openDeleteServer(id, name) {
    deleteTarget = { id, name };
    document.getElementById('delete-server-name').textContent = name;
    document.getElementById('delete-confirm-input').value = '';
    openModal('modal-delete');
}

async function handleDeleteConfirm() {
    const input = document.getElementById('delete-confirm-input').value;
    if (input !== deleteTarget.name) {
        toast('Name does not match', true);
        return;
    }
    try {
        await API.del(`/api/servers/${deleteTarget.id}`, { confirm_name: input });
        toast('Server deleted');
        closeModal('modal-delete');
        loadServers();
    } catch (err) { toast(err.message, true); }
}

// -- Modals --
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// -- Settings / Theme --
const accentColors = [
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
    '#22c55e', '#eab308', '#ef4444', '#14b8a6', '#6366f1',
];

function showSettings() { showView('settings'); renderSettings(); }

function renderSettings() {
    const container = document.getElementById('accent-colors');
    const current = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    container.innerHTML = accentColors.map(c =>
        `<div class="color-swatch ${c === current ? 'active' : ''}" style="background:${c}" onclick="setAccent('${c}')"></div>`
    ).join('');
}

function setAccent(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-hover', color);
    document.documentElement.style.setProperty('--accent-dim', color + '1a');
    localStorage.setItem('accent', color);
    renderSettings();
}

function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next === 'dark' ? '' : 'light';
    localStorage.setItem('theme', next);
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    const accent = localStorage.getItem('accent');
    if (accent) setAccent(accent);
}

function backToServers() { showView('servers'); loadServers(); }

// -- Utility --
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// Boot
document.addEventListener('DOMContentLoaded', init);
