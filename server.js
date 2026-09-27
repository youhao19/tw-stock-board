const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const STOCK_CODE_RE = /^\d{4,6}$/;
const MAX_CODES = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function fetchQuotes(codes) {
  const exChCodes = codes.map((c) => `tse_${encodeURIComponent(c)}.tw`).join('|');
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exChCodes}&json=1&delay=0`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://mis.twse.com.tw/stock/fibest.jsp',
    },
  });
  const data = await res.json();
  return (data.msgArray || []).map((item) => {
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
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

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
    const codes = rawCodes;
    try {
      const quotes = await fetchQuotes(codes);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ quotes }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '抓取股價失敗，請稍後再試' }));
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
