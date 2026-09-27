const { fetchMarketIndex } = require('../lib/quotes');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const index = await fetchMarketIndex();
    res.status(200).json({ index });
  } catch (err) {
    res.status(502).json({ error: '抓取大盤指數失敗，請稍後再試' });
  }
};
