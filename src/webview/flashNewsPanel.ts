/*--------------------------------------------------------------
 *  韭菜盒子 - 常驻实时快讯面板
 *  数据来源：FlashNewsDaemon（金十 / 财联社 / 东方财富 / 同花顺 / 华尔街见闻 / 选股宝）
 *-------------------------------------------------------------*/
import { env, Uri, ViewColumn, Webview, WebviewPanel, window, workspace } from 'vscode';
import FlashNewsDaemon from '../output/flash-news/FlashNewsDaemon';
import { FlashNewsServerInterface } from '../output/flash-news/NewsFlushServiceAbstractClass';
import { containsChinese, normalizeSource, FlashNewsItem } from '../output/flash-news/newsModel';

const VIEW_TYPE = 'leekFundFlashNewsPanel';
const DEFAULT_MAX_ITEMS = 300;
/** 只保留 1 小时内的消息 */
const RETENTION_MS = 60 * 60 * 1000;

class FlashNewsPanelServer implements FlashNewsServerInterface {
  private ready = false;
  private unregister: (() => void) | undefined;

  constructor(private readonly panel: FlashNewsPanel, private readonly webview: Webview) {
    // 注册时 daemon 会同步回放最近 100 条缓存
    this.unregister = FlashNewsDaemon.registerServer(this);
  }

  markReady() {
    this.ready = true;
    this.webview.postMessage({
      command: 'history',
      data: this.panel.getHistory(),
    });
  }

  refresh() {
    if (!this.ready) {
      return;
    }
    this.webview.postMessage({
      command: 'refresh',
      data: this.panel.getHistory(),
    });
  }

  print(_content: string, source?: any) {
    const item = normalizeSource(source);
    if (!item || !this.panel.accept(item)) {
      return;
    }

    // 外文快讯一律丢弃：不展示、不翻译
    if (!containsChinese(`${item.title} ${item.body}`)) {
      this.panel.remove(item.id);
      return;
    }

    if (this.ready) {
      this.webview.postMessage({ command: 'news', data: item });
    }
    // 未 ready 时不用补发，markReady 会一次性发全量 history
  }

  destroy() {
    this.unregister?.();
    this.unregister = undefined;
  }
}

class FlashNewsPanel {
  private static _instance: FlashNewsPanel | undefined;

  static get instance(): FlashNewsPanel {
    if (!this._instance) {
      this._instance = new FlashNewsPanel();
    }
    return this._instance;
  }

  private panel: WebviewPanel | undefined;
  private server: FlashNewsPanelServer | undefined;
  private pruneTimer: NodeJS.Timeout | undefined;
  private history: FlashNewsItem[] = [];
  private seen = new Set<string>();

  show() {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      return;
    }

    const maxItems = this.getMaxItems();
    const panel = window.createWebviewPanel(
      VIEW_TYPE,
      '韭菜盒子 · 实时快讯',
      { viewColumn: ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    this.panel = panel;
    this.history = [];
    this.seen = new Set<string>();
    panel.webview.html = getWebviewHtml(maxItems);

    panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'ready':
            this.server?.markReady();
            break;
          case 'openLink':
            if (typeof message.data === 'string' && /^https?:\/\//.test(message.data)) {
              env.openExternal(Uri.parse(message.data));
            }
            break;
          case 'copy':
            if (typeof message.data === 'string') {
              env.clipboard.writeText(message.data);
            }
            break;
        }
      },
      undefined
    );

    this.server = new FlashNewsPanelServer(this, panel.webview);

    // 每分钟清理超过 1 小时的消息，并同步给前端
    this.pruneTimer = setInterval(() => {
      const before = this.history.length;
      this.prune();
      if (this.history.length !== before) {
        this.server?.refresh();
      }
    }, 60000);

    panel.onDidDispose(() => {
      this.server?.destroy();
      this.server = undefined;
      this.panel = undefined;
      if (this.pruneTimer) {
        clearInterval(this.pruneTimer);
        this.pruneTimer = undefined;
      }
      this.history = [];
      this.seen.clear();
    });
  }

  /** 返回 false 表示重复消息 */
  accept(item: FlashNewsItem): boolean {
    if (this.seen.has(item.id)) {
      return false;
    }
    this.seen.add(item.id);
    this.insert(item);
    return true;
  }

  remove(id: string) {
    this.history = this.history.filter((item) => item.id !== id);
  }

  getHistory(): FlashNewsItem[] {
    this.prune();
    return this.history.slice();
  }

  private insert(item: FlashNewsItem) {
    // history 按时间从新到旧排列
    let index = this.history.findIndex((existing) => existing.time < item.time);
    if (index === -1) {
      index = this.history.length;
    }
    this.history.splice(index, 0, item);
    this.prune();
    const maxItems = this.getMaxItems();
    if (this.history.length > maxItems) {
      this.history.length = maxItems;
    }
  }

  private prune() {
    const cutoff = Date.now() - RETENTION_MS;
    this.history = this.history.filter((item) => item.time >= cutoff);
  }

  private getMaxItems(): number {
    const config = workspace.getConfiguration('leek-fund');
    return config.get<number>('flashNewsPanel.maxItems', DEFAULT_MAX_ITEMS) || DEFAULT_MAX_ITEMS;
  }
}

function getWebviewHtml(maxItems: number): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
  }
  body { display: flex; flex-direction: column; overflow: hidden; }

  header {
    flex: 0 0 auto; padding: 7px 10px 5px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25));
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  }
  .row1 { display: flex; align-items: center; gap: 8px; }
  .title { font-weight: 600; white-space: nowrap; }
  .title .count {
    display: inline-block; min-width: 18px; padding: 0 5px; margin-left: 4px;
    border-radius: 9px; font-size: 11px; text-align: center;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--vscode-descriptionForeground); }
  .dot.live { background: #2ea043; box-shadow: 0 0 5px #2ea043; }
  .dot.stale { background: #d29922; }
  #search {
    margin-left: auto; width: 150px; padding: 3px 8px; border-radius: 4px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #555));
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    outline: none; font-size: 12px;
  }
  #search:focus { border-color: var(--vscode-focusBorder); }

  .row2 { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
  .tabs { display: flex; gap: 2px; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button, #importantBtn {
    border: 1px solid transparent; background: transparent; color: var(--vscode-descriptionForeground);
    padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;
  }
  .tabs button:hover, #importantBtn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
  .tabs button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #importantBtn.on { background: rgba(241,76,76,.18); color: #f14c4c; border-color: rgba(241,76,76,.35); }

  main { flex: 1 1 auto; overflow-y: auto; padding: 4px 0 24px; }
  .day {
    padding: 10px 14px 4px; font-size: 11px; letter-spacing: .5px;
    color: var(--vscode-descriptionForeground); position: sticky; top: 0;
    background: var(--vscode-editor-background); z-index: 1;
  }
  .item {
    margin: 0 8px 6px; padding: 8px 10px; border-radius: 6px;
    border-left: 3px solid transparent;
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.07));
    transition: background .15s ease;
  }
  .item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.14)); }
  .item.important { border-left-color: #f14c4c; }
  .item.data { border-left-color: #3b8eea; }
  .item.fresh { animation: fresh 1.4s ease; }
  @keyframes fresh {
    from { background: var(--vscode-editor-findMatchHighlightBackground, rgba(255,200,0,.28)); }
    to { background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.07)); }
  }
  @media (prefers-reduced-motion: reduce) { .item.fresh { animation: none; } }

  .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; flex-wrap: wrap; }
  .time { font-variant-numeric: tabular-nums; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .badge { font-size: 10px; padding: 0 5px; border-radius: 3px; line-height: 15px; }
  .badge.imp { background: rgba(241,76,76,.16); color: #f14c4c; }
  .badge.data { background: rgba(59,142,234,.16); color: #3b8eea; }
  .badge.muted { background: rgba(128,128,128,.16); color: var(--vscode-descriptionForeground); }
  .badge.trans { background: rgba(46,160,67,.16); color: #2ea043; }

  .item h3 { margin: 2px 0 3px; font-size: 13px; line-height: 1.45; font-weight: 600; cursor: pointer; }
  .item p {
    margin: 0; line-height: 1.6; color: var(--vscode-editor-foreground);
    white-space: pre-wrap; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }
  .item.expanded p { display: block; -webkit-line-clamp: unset; }
  .actions { display: flex; gap: 12px; margin-top: 6px; opacity: 0; transition: opacity .15s; }
  .item:hover .actions, .item.expanded .actions { opacity: 1; }
  .actions a { color: var(--vscode-textLink-foreground); font-size: 11px; cursor: pointer; user-select: none; }
  .actions a:hover { text-decoration: underline; }

  #empty { padding: 60px 20px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px; }
  #empty.hidden { display: none; }
  .empty-pulse { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
  #foot {
    flex: 0 0 auto; padding: 3px 12px; font-size: 10px;
    color: var(--vscode-descriptionForeground);
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25));
    display: flex; justify-content: space-between;
  }
</style>
</head>
<body>
<header>
  <div class="row1">
    <span class="title">⚡ 实时快讯<span class="count" id="count">0</span></span>
    <span class="dot" id="dot" title="连接状态"></span>
    <input id="search" type="search" placeholder="搜索关键词…" />
  </div>
  <div class="row2">
    <div class="tabs" id="sourceTabs">
      <button data-source="all" class="active">全部</button>
      <button data-source="jin10">金十</button>
      <button data-source="cls">财联社</button>
      <button data-source="eastmoney">东财</button>
      <button data-source="ths">同花顺</button>
      <button data-source="wscn">见闻</button>
      <button data-source="xgb">选股宝</button>
    </div>
    <button id="importantBtn" title="只看重要快讯">重要</button>
  </div>
</header>
<main id="list"></main>
<div id="empty" class="empty-pulse">正在连接快讯源…<br />有快讯会自动出现在这里</div>
<div id="foot">
  <span id="status">等待数据</span>
  <span id="updated">—</span>
</div>

<script>
(function () {
  var MAX_ITEMS = ${maxItems};
  var RETENTION_MS = 60 * 60 * 1000;
  var vscode = acquireVsCodeApi();
  var items = [];
  var sourceFilter = 'all';
  var onlyImportant = false;
  var keyword = '';
  var lastMessageAt = 0;
  var freshIds = new Set();

  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var countEl = document.getElementById('count');
  var dotEl = document.getElementById('dot');
  var statusEl = document.getElementById('status');
  var updatedEl = document.getElementById('updated');

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function timeText(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function dateKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dateText(ts) {
    var d = new Date(ts);
    var today = new Date();
    if (dateKey(ts) === dateKey(today.getTime())) { return '今天'; }
    var y = new Date(today.getTime() - 86400000);
    if (dateKey(ts) === dateKey(y.getTime())) { return '昨天'; }
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  function matches(item) {
    if (Date.now() - item.time > RETENTION_MS) { return false; }
    if (sourceFilter !== 'all' && item.source !== sourceFilter) { return false; }
    if (onlyImportant && !item.important) { return false; }
    if (keyword) {
      var hay = (item.title + ' ' + item.body + ' ' + item.sourceName).toLowerCase();
      if (hay.indexOf(keyword) === -1) { return false; }
    }
    return true;
  }

  function badge(text, cls) {
    var el = document.createElement('span');
    el.className = 'badge ' + cls;
    el.textContent = text;
    return el;
  }

  function buildItem(item) {
    var el = document.createElement('article');
    el.className = 'item' + (item.important ? ' important' : '') + (item.kind === 'data' ? ' data' : '');
    if (freshIds.has(item.id)) { el.className += ' fresh'; }

    var meta = document.createElement('div');
    meta.className = 'meta';
    var time = document.createElement('span');
    time.className = 'time';
    time.textContent = timeText(item.time);
    meta.appendChild(time);
    meta.appendChild(badge(item.sourceName || '', 'muted'));
    if (item.important) { meta.appendChild(badge('重要', 'imp')); }
    if (item.kind === 'data') { meta.appendChild(badge('数据', 'data')); }

    var title = document.createElement('h3');
    title.textContent = item.title;

    var body = document.createElement('p');
    body.textContent = item.body || '';

    var actions = document.createElement('div');
    actions.className = 'actions';
    if (item.link) {
      var open = document.createElement('a');
      open.textContent = '查看详情 ↗';
      open.addEventListener('click', function (e) {
        e.stopPropagation();
        vscode.postMessage({ command: 'openLink', data: item.link });
      });
      actions.appendChild(open);
    }
    var copy = document.createElement('a');
    copy.textContent = '复制';
    copy.addEventListener('click', function (e) {
      e.stopPropagation();
      vscode.postMessage({
        command: 'copy',
        data: item.title + '\\n' + (item.body || '') + (item.link ? '\\n' + item.link : '')
      });
    });
    actions.appendChild(copy);

    function toggle() { el.classList.toggle('expanded'); }
    title.addEventListener('click', toggle);
    body.addEventListener('click', toggle);

    el.appendChild(meta);
    el.appendChild(title);
    if (item.body) { el.appendChild(body); }
    el.appendChild(actions);
    return el;
  }

  function render() {
    var visible = items.filter(matches);
    countEl.textContent = String(visible.length);
    listEl.textContent = '';

    if (!visible.length) {
      emptyEl.classList.remove('hidden');
      emptyEl.innerHTML = items.length
        ? '没有匹配的快讯'
        : '正在连接快讯源…<br />有快讯会自动出现在这里';
      emptyEl.className = items.length ? '' : 'empty-pulse';
      return;
    }
    emptyEl.classList.add('hidden');

    var lastDay = '';
    visible.forEach(function (item) {
      var day = dateKey(item.time);
      if (day !== lastDay) {
        lastDay = day;
        var sep = document.createElement('div');
        sep.className = 'day';
        sep.textContent = dateText(item.time);
        listEl.appendChild(sep);
      }
      listEl.appendChild(buildItem(item));
    });
  }

  function refreshStatus() {
    var age = lastMessageAt ? Date.now() - lastMessageAt : Infinity;
    dotEl.className = 'dot';
    // 周末/夜间快讯更新本来就不频繁，10 分钟内收到过数据就算在线
    if (age < 10 * 60 * 1000) {
      dotEl.classList.add('live');
      statusEl.textContent = '多源快讯 · 实时';
    } else if (items.length) {
      dotEl.classList.add('stale');
      statusEl.textContent = '多源快讯 · 等待更新';
    } else {
      statusEl.textContent = '正在连接…';
    }
    updatedEl.textContent = lastMessageAt ? '最后更新 ' + timeText(lastMessageAt) : '—';
  }

  function replaceAll(list) {
    items = list || [];
    items = items.filter(function (i) { return Date.now() - i.time <= RETENTION_MS; });
    if (items.length) {
      // 用「收到数据的时间」而不是新闻自身时间，避免刚打开就显示为过期
      lastMessageAt = Date.now();
    }
    render();
    refreshStatus();
  }

  window.addEventListener('message', function (event) {
    var msg = event.data || {};
    if (msg.command === 'history' || msg.command === 'refresh') {
      replaceAll(msg.data);
      return;
    }
    if (msg.command === 'news') {
      var item = msg.data;
      freshIds.add(item.id);
      setTimeout(function () { freshIds.delete(item.id); }, 1600);
      items.unshift(item);
      if (items.length > MAX_ITEMS) { items.length = MAX_ITEMS; }
      lastMessageAt = Date.now();
      render();
      refreshStatus();
      document.getElementById('list').scrollTop = 0;
      return;
    }
    if (msg.command === 'update') {
      var updated = msg.data;
      var index = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === updated.id) { index = i; break; }
      }
      if (index !== -1) { items[index] = updated; }
      else { items.unshift(updated); }
      render();
      return;
    }
  });

  document.getElementById('sourceTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) { return; }
    sourceFilter = btn.getAttribute('data-source');
    var buttons = this.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i] === btn);
    }
    render();
  });

  document.getElementById('importantBtn').addEventListener('click', function () {
    onlyImportant = !onlyImportant;
    this.classList.toggle('on', onlyImportant);
    render();
  });

  var searchEl = document.getElementById('search');
  searchEl.addEventListener('input', function () {
    keyword = searchEl.value.trim().toLowerCase();
    render();
  });

  setInterval(function () {
    items = items.filter(function (i) { return Date.now() - i.time <= RETENTION_MS; });
    render();
    refreshStatus();
  }, 30000);

  vscode.postMessage({ command: 'ready' });
  refreshStatus();
})();
</script>
</body>
</html>`;
}

export default FlashNewsPanel.instance;
