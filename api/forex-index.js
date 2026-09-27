const { fetchForexIndex } = require('../lib/quotes');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const forex = await fetchForexIndex();
    res.status(200).json({ forex });
  } catch (err) {
    res.status(502).json({ error: '抓取美元指數失敗，請稍後再試' });
  }
};
