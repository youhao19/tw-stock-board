const { STOCK_CODE_RE, MAX_CODES, fetchQuotes } = require('../lib/quotes');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const codesParam = req.query.codes || '';
  const rawCodes = String(codesParam)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (rawCodes.length === 0) {
    res.status(400).json({ error: '缺少股票代碼' });
    return;
  }
  if (rawCodes.length > MAX_CODES || !rawCodes.every((c) => STOCK_CODE_RE.test(c))) {
    res.status(400).json({ error: '股票代碼格式不正確' });
    return;
  }
  try {
    const quotes = await fetchQuotes(rawCodes);
    res.status(200).json({ quotes });
  } catch (err) {
    res.status(502).json({ error: '抓取股價失敗，請稍後再試' });
  }
};
