const STOCK_CODE_RE = /^\d{4,6}$/;
const MAX_CODES = 30;
const MAX_HISTORY_MONTHS = 6;
const DEFAULT_HISTORY_MONTHS = 3;

const MARKET_INDEX_CHANNEL = 'tse_t00.tw';
const DXY_SYMBOL = 'DX-Y.NYB';

function parseQuoteItem(item) {
  const price = item.z && item.z !== '-' ? parseFloat(item.z) : parseFloat(item.pz || item.y);
  const prevClose = parseFloat(item.y);
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;
  return {
    code: item.c,
    name: item.n,
    price,
    prevClose,
    open: parseFloat(item.o),
    high: parseFloat(item.h),
    low: parseFloat(item.l),
    volume: parseInt(item.v, 10) || 0,
    change,
    changePercent,
    time: item.t,
  };
}

async function fetchMis(exChCodes) {
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exChCodes}&json=1&delay=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
    },
  });
  const data = await res.json();
  return data.msgArray || [];
}

async function fetchForexIndex() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${DXY_SYMBOL}?range=1d&interval=1m`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error('無法取得美元指數資料');
  }
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;
  const time = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toLocaleTimeString('zh-Hant-TW', { timeZone: 'Asia/Taipei' })
    : '';
  return {
    code: 'DXY',
    name: '美元指數',
    price,
    prevClose,
    high: meta.regularMarketDayHigh,
    low: meta.regularMarketDayLow,
    change,
    changePercent,
    time,
  };
}

async function fetchQuotes(codes) {
  const exChCodes = codes.map((c) => `tse_${encodeURIComponent(c)}.tw`).join('|');
  const items = await fetchMis(exChCodes);
  return items.map(parseQuoteItem);
}

async function fetchMarketIndex() {
  const items = await fetchMis(MARKET_INDEX_CHANNEL);
  if (!items.length) throw new Error('無大盤指數資料');
  return parseQuoteItem(items[0]);
}

function rocDateToIso(rocDate) {
  const parts = String(rocDate).split('/');
  if (parts.length !== 3) return null;
  const [rocYear, month, day] = parts.map(Number);
  if (!Number.isInteger(rocYear) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const year = rocYear + 1911;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function fetchHistoryMonth(code, year, month) {
  const yyyymm = `${year}${String(month).padStart(2, '0')}`;
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}01&stockNo=${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.twse.com.tw/zh/page/trading/exchange/STOCK_DAY.html',
    },
  });
  const data = await res.json();
  if (data.stat !== 'OK' || !Array.isArray(data.data)) return [];
  return data.data
    .map((row) => {
      const date = rocDateToIso(row[0]);
      const close = parseFloat(String(row[6]).replace(/,/g, ''));
      return date && !Number.isNaN(close) ? { date, close } : null;
    })
    .filter(Boolean);
}

async function fetchHistory(code, months) {
  const now = new Date();
  const results = [];
  for (let i = months - 1; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const rows = await fetchHistoryMonth(code, target.getFullYear(), target.getMonth() + 1);
    results.push(...rows);
  }
  return results;
}

module.exports = {
  STOCK_CODE_RE,
  MAX_CODES,
  MAX_HISTORY_MONTHS,
  DEFAULT_HISTORY_MONTHS,
  fetchQuotes,
  fetchMarketIndex,
  fetchForexIndex,
  fetchHistory,
};
