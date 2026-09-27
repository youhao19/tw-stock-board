const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function fetchQuotes(codes) {
  const exChCodes = codes.map((c) => `tse_${c}.tw`).join('|');
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
    const codes = codesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '缺少股票代碼' }));
      return;
    }
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

  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`台股快速看板已啟動：http://localhost:${PORT}`);
});
