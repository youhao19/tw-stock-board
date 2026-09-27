const STORAGE_KEY = 'tw-watchlist';
const DEFAULT_WATCHLIST = ['2330', '2317', '2454', '2412'];
const REFRESH_INTERVAL_MS = 15000;

const marketIndexEl = document.getElementById('market-index');
const listEl = document.getElementById('stock-list');
const emptyMsgEl = document.getElementById('empty-msg');
const errorMsgEl = document.getElementById('error-msg');
const updateTimeEl = document.getElementById('update-time');
const addForm = document.getElementById('add-form');
const codeInput = document.getElementById('code-input');
const refreshBtn = document.getElementById('refresh-btn');
const sortBtn = document.getElementById('sort-btn');
const forexCardEl = document.getElementById('forex-card');
const forexErrorMsgEl = document.getElementById('forex-error-msg');

const SORT_MODES = ['none', 'desc', 'asc'];
const SORT_LABELS = {
  none: '依漲跌幅排序',
  desc: '漲跌幅：高到低',
  asc: '漲跌幅：低到高',
};
let sortMode = 'none';
let lastQuotes = [];

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WATCHLIST];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...DEFAULT_WATCHLIST];
  } catch {
    return [...DEFAULT_WATCHLIST];
  }
}

function saveWatchlist(codes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

let watchlist = loadWatchlist();
const chartState = {};
const CHART_STALE_MS = 5 * 60 * 1000;

function showError(message) {
  if (!message) {
    errorMsgEl.hidden = true;
    errorMsgEl.textContent = '';
    return;
  }
  errorMsgEl.hidden = false;
  errorMsgEl.textContent = message;
}

function formatNumber(n, digits = 2) {
  if (Number.isNaN(n)) return '--';
  return n.toLocaleString('zh-Hant-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatChartDate(iso) {
  const parts = String(iso).split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : iso;
}

function drawLineChart(canvas, history) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) return;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  if (!history.length) return;

  const closes = history.map((h) => h.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const padding = { top: 10, right: 8, bottom: 16, left: 8 };
  const chartW = Math.max(0, cssWidth - padding.left - padding.right);
  const chartH = Math.max(0, cssHeight - padding.top - padding.bottom);

  const style = getComputedStyle(document.documentElement);
  const trendUp = closes[closes.length - 1] >= closes[0];
  const lineColor = (trendUp ? style.getPropertyValue('--up-color') : style.getPropertyValue('--down-color')).trim();

  const xStep = history.length > 1 ? chartW / (history.length - 1) : 0;
  const yFor = (v) => (max === min ? padding.top + chartH / 2 : padding.top + chartH - ((v - min) / (max - min)) * chartH);

  ctx.beginPath();
  history.forEach((h, i) => {
    const x = padding.left + i * xStep;
    const y = yFor(h.close);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineJoin = 'round';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(padding.left + (history.length - 1) * xStep, padding.top + chartH);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = `${lineColor}22`;
  ctx.fill();

  ctx.fillStyle = style.getPropertyValue('--muted').trim();
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(formatChartDate(history[0].date), padding.left, cssHeight - 12);
  ctx.textAlign = 'right';
  ctx.fillText(formatChartDate(history[history.length - 1].date), cssWidth - padding.right, cssHeight - 12);
}

function renderChartPanel(card, code) {
  if (!card) return;
  const state = chartState[code];
  let panel = card.querySelector('.chart-panel');
  if (!state || !state.expanded) {
    if (panel) panel.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'chart-panel';
    card.appendChild(panel);
  }
  if (state.loading) {
    panel.innerHTML = '<p class="chart-status">載入走勢圖中…</p>';
    return;
  }
  if (state.error) {
    panel.innerHTML = `<p class="chart-status error">${escapeHtml(state.error)}</p>`;
    return;
  }
  if (!state.data || state.data.length === 0) {
    panel.innerHTML = '<p class="chart-status">尚無歷史資料</p>';
    return;
  }
  panel.innerHTML = '<canvas class="chart-canvas"></canvas>';
  drawLineChart(panel.querySelector('canvas'), state.data);
}

async function loadChartData(code) {
  const state = chartState[code];
  state.loading = true;
  state.error = null;
  renderChartPanel(listEl.querySelector(`.stock-card[data-code="${code}"]`), code);
  try {
    const res = await fetch(`/api/history?code=${encodeURIComponent(code)}&months=3`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '抓取歷史股價失敗');
    state.data = data.history || [];
    state.fetchedAt = Date.now();
  } catch (err) {
    state.error = err.message || '抓取歷史股價失敗';
  } finally {
    state.loading = false;
    renderChartPanel(listEl.querySelector(`.stock-card[data-code="${code}"]`), code);
  }
}

function toggleChartPanel(card, code) {
  if (!chartState[code]) {
    chartState[code] = { expanded: false, data: null, loading: false, error: null, fetchedAt: 0 };
  }
  const state = chartState[code];
  state.expanded = !state.expanded;
  renderChartPanel(card, code);
  if (state.expanded && !state.loading && (!state.data || Date.now() - state.fetchedAt > CHART_STALE_MS)) {
    loadChartData(code);
  }
}

function getSortedQuotes(quotes) {
  if (sortMode === 'none') return quotes;
  const sorted = [...quotes].sort((a, b) => a.changePercent - b.changePercent);
  if (sortMode === 'desc') sorted.reverse();
  return sorted;
}

function renderQuotes(quotes) {
  listEl.innerHTML = '';
  emptyMsgEl.hidden = quotes.length > 0;

  const sortedQuotes = getSortedQuotes(quotes);

  sortedQuotes.forEach((q, index) => {
    const trend = q.change > 0 ? 'up' : q.change < 0 ? 'down' : 'flat';
    const sign = q.change > 0 ? '+' : '';
    const code = escapeHtml(q.code);
    const name = escapeHtml(q.name || q.code);
    const time = escapeHtml(q.time || '');
    const expanded = chartState[q.code] && chartState[q.code].expanded;
    const rankBadge = sortMode === 'none' ? '' : `<span class="rank-badge">第 ${index + 1} 名</span>`;
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.dataset.code = code;
    card.innerHTML = `
      <button class="remove-btn" data-code="${code}" title="移除">✕</button>
      <div class="row-top">
        <div>${rankBadge}<span class="name">${name}</span><span class="code">${code}</span></div>
        <div class="price ${trend}">${formatNumber(q.price)}</div>
      </div>
      <div class="change-row">
        <div class="change ${trend}">${sign}${formatNumber(q.change)} (${sign}${formatNumber(q.changePercent)}%)</div>
        <div class="meta"><span>${time}</span></div>
      </div>
      <div class="meta">
        <span>開 ${formatNumber(q.open)}</span>
        <span>高 ${formatNumber(q.high)}</span>
        <span>低 ${formatNumber(q.low)}</span>
        <span>量 ${q.volume.toLocaleString('zh-Hant-TW')} 張</span>
      </div>
      <button class="chart-btn" type="button">${expanded ? '收合走勢圖' : '📈 走勢圖'}</button>
    `;
    listEl.appendChild(card);
    renderChartPanel(card, q.code);
  });

  listEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      watchlist = watchlist.filter((c) => c !== btn.dataset.code);
      saveWatchlist(watchlist);
      delete chartState[btn.dataset.code];
      fetchAndRender();
    });
  });

  listEl.querySelectorAll('.chart-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.stock-card');
      const code = card.dataset.code;
      toggleChartPanel(card, code);
      btn.textContent = chartState[code].expanded ? '收合走勢圖' : '📈 走勢圖';
    });
  });
}

function renderMarketIndex(index) {
  const trend = index.change > 0 ? 'up' : index.change < 0 ? 'down' : 'flat';
  const sign = index.change > 0 ? '+' : '';
  const name = escapeHtml(index.name || '加權指數');
  const time = escapeHtml(index.time || '');
  marketIndexEl.innerHTML = `
    <div class="row-top">
      <div class="name">${name}</div>
      <div class="price ${trend}">${formatNumber(index.price)}</div>
    </div>
    <div class="change-row">
      <div class="change ${trend}">${sign}${formatNumber(index.change)} (${sign}${formatNumber(index.changePercent)}%)</div>
      <div class="meta"><span>${time}</span></div>
    </div>
  `;
}

async function fetchAndRenderIndex() {
  try {
    const res = await fetch('/api/market-index');
    const data = await res.json();
    if (!res.ok) return;
    renderMarketIndex(data.index);
  } catch (err) {
    // 大盤指數抓取失敗時，不影響個股清單顯示
  }
}

function renderForexIndex(forex) {
  const trend = forex.change > 0 ? 'up' : forex.change < 0 ? 'down' : 'flat';
  const sign = forex.change > 0 ? '+' : '';
  const name = escapeHtml(forex.name || forex.code);
  const code = escapeHtml(forex.code);
  const time = escapeHtml(forex.time || '');
  forexCardEl.innerHTML = `
    <div class="stock-card">
      <div class="row-top">
        <div><span class="name">${name}</span><span class="code">${code}</span></div>
        <div class="price ${trend}">${formatNumber(forex.price)}</div>
      </div>
      <div class="change-row">
        <div class="change ${trend}">${sign}${formatNumber(forex.change)} (${sign}${formatNumber(forex.changePercent)}%)</div>
        <div class="meta"><span>${time}</span></div>
      </div>
      <div class="meta">
        <span>高 ${formatNumber(forex.high)}</span>
        <span>低 ${formatNumber(forex.low)}</span>
      </div>
    </div>
  `;
}

async function fetchAndRenderForexIndex() {
  try {
    const res = await fetch('/api/forex-index');
    const data = await res.json();
    if (!res.ok) {
      forexErrorMsgEl.hidden = false;
      forexErrorMsgEl.textContent = data.error || '抓取美元指數失敗';
      return;
    }
    forexErrorMsgEl.hidden = true;
    renderForexIndex(data.forex);
  } catch (err) {
    forexErrorMsgEl.hidden = false;
    forexErrorMsgEl.textContent = '無法連線到伺服器，請確認伺服器是否已啟動';
  }
}

async function fetchAndRender() {
  if (watchlist.length === 0) {
    listEl.innerHTML = '';
    emptyMsgEl.hidden = false;
    return;
  }
  try {
    const res = await fetch(`/api/quotes?codes=${encodeURIComponent(watchlist.join(','))}`);
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || '抓取股價失敗');
      return;
    }
    showError(null);
    lastQuotes = data.quotes;
    renderQuotes(lastQuotes);
    updateTimeEl.textContent = `更新於 ${new Date().toLocaleTimeString('zh-Hant-TW')}`;
  } catch (err) {
    showError('無法連線到伺服器，請確認伺服器是否已啟動');
  }
}

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;
  if (!/^\d{4,6}$/.test(code)) {
    showError('股票代碼格式不正確，請輸入數字代碼，例如 2330');
    return;
  }
  if (!watchlist.includes(code)) {
    watchlist.push(code);
    saveWatchlist(watchlist);
  }
  codeInput.value = '';
  fetchAndRender();
});

refreshBtn.addEventListener('click', () => {
  fetchAndRenderIndex();
  fetchAndRender();
  fetchAndRenderForexIndex();
});

sortBtn.addEventListener('click', () => {
  const nextIndex = (SORT_MODES.indexOf(sortMode) + 1) % SORT_MODES.length;
  sortMode = SORT_MODES[nextIndex];
  sortBtn.textContent = SORT_LABELS[sortMode];
  renderQuotes(lastQuotes);
});

fetchAndRenderIndex();
fetchAndRender();
fetchAndRenderForexIndex();
setInterval(() => {
  fetchAndRenderIndex();
  fetchAndRender();
  fetchAndRenderForexIndex();
}, REFRESH_INTERVAL_MS);
