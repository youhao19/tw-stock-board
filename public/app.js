const STORAGE_KEY = 'tw-watchlist';
const DEFAULT_WATCHLIST = ['2330', '2317', '2454', '2412'];
const REFRESH_INTERVAL_MS = 15000;

const listEl = document.getElementById('stock-list');
const emptyMsgEl = document.getElementById('empty-msg');
const errorMsgEl = document.getElementById('error-msg');
const updateTimeEl = document.getElementById('update-time');
const addForm = document.getElementById('add-form');
const codeInput = document.getElementById('code-input');
const refreshBtn = document.getElementById('refresh-btn');

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

function renderQuotes(quotes) {
  listEl.innerHTML = '';
  emptyMsgEl.hidden = quotes.length > 0;

  quotes.forEach((q) => {
    const trend = q.change > 0 ? 'up' : q.change < 0 ? 'down' : 'flat';
    const sign = q.change > 0 ? '+' : '';
    const code = escapeHtml(q.code);
    const name = escapeHtml(q.name || q.code);
    const time = escapeHtml(q.time || '');
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <button class="remove-btn" data-code="${code}" title="移除">✕</button>
      <div class="row-top">
        <div><span class="name">${name}</span><span class="code">${code}</span></div>
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
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      watchlist = watchlist.filter((c) => c !== btn.dataset.code);
      saveWatchlist(watchlist);
      fetchAndRender();
    });
  });
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
    renderQuotes(data.quotes);
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

refreshBtn.addEventListener('click', fetchAndRender);

fetchAndRender();
setInterval(fetchAndRender, REFRESH_INTERVAL_MS);
