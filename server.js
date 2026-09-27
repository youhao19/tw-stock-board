const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  STOCK_CODE_RE,
  MAX_CODES,
  MAX_HISTORY_MONTHS,
  DEFAULT_HISTORY_MONTHS,
  fetchQuotes,
  fetchMarketIndex,
  fetchForexIndex,
  fetchHistory,
} = require('./lib/quotes');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/market-index') {
    try {
      const index = await fetchMarketIndex();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ index }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '抓取大盤指數失敗，請稍後再試' }));
    }
    return;
  }

  if (url.pathname === '/api/forex-index') {
    try {
      const forex = await fetchForexIndex();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ forex }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '抓取美元指數失敗，請稍後再試' }));
    }
    return;
  }

  if (url.pathname === '/api/quotes') {
    const codesParam = url.searchParams.get('codes') || '';
    const rawCodes = codesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (rawCodes.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '缺少股票代碼' }));
      return;
    }
    if (rawCodes.length > MAX_CODES || !rawCodes.every((c) => STOCK_CODE_RE.test(c))) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '股票代碼格式不正確' }));
      return;
    }
    try {
      const quotes = await fetchQuotes(rawCodes);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ quotes }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '抓取股價失敗，請稍後再試' }));
    }
    return;
  }

  if (url.pathname === '/api/history') {
    const code = (url.searchParams.get('code') || '').trim();
    if (!STOCK_CODE_RE.test(code)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '股票代碼格式不正確' }));
      return;
    }
    const monthsParam = parseInt(url.searchParams.get('months'), 10);
    const months = Number.isInteger(monthsParam) && monthsParam > 0
      ? Math.min(monthsParam, MAX_HISTORY_MONTHS)
      : DEFAULT_HISTORY_MONTHS;
    try {
      const history = await fetchHistory(code, months);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code, history }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '抓取歷史股價失敗，請稍後再試' }));
    }
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('找不到頁面');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`台股快速看板已啟動：http://localhost:${PORT}`);
});
