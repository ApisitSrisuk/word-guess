// Vercel Serverless Function: /api/room
const { handle } = require('../lib/api');

module.exports = async (req, res) => {
  const { status, json } = await handle(req.method, req.query, req.body);
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(json);
};
