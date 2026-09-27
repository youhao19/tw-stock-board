const { STOCK_CODE_RE, MAX_HISTORY_MONTHS, DEFAULT_HISTORY_MONTHS, fetchHistory } = require('../lib/quotes');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const code = String(req.query.code || '').trim();
  if (!STOCK_CODE_RE.test(code)) {
    res.status(400).json({ error: '股票代碼格式不正確' });
    return;
  }
  const monthsParam = parseInt(req.query.months, 10);
  const months = Number.isInteger(monthsParam) && monthsParam > 0
    ? Math.min(monthsParam, MAX_HISTORY_MONTHS)
    : DEFAULT_HISTORY_MONTHS;
  try {
    const history = await fetchHistory(code, months);
    res.status(200).json({ code, history });
  } catch (err) {
    res.status(502).json({ error: '抓取歷史股價失敗，請稍後再試' });
  }
};
