/**
 * API Serverless Endpoint: Histórico Real de Transações M-Pesa e e-Mola (MongoDB Atlas)
 * Rota: GET /api/admin/transactions
 */
const { connectToDatabase } = require('../lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Apenas GET é permitido.' } });
  }

  try {
    const { db } = await connectToDatabase();
    const transactions = await db
      .collection('transactions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return res.status(200).json({
      success: true,
      source: 'mongodb_atlas',
      count: transactions.length,
      transactions
    });
  } catch (err) {
    console.error('Erro ao buscar transações do MongoDB Atlas:', err);
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: 'Erro ao obter transações do banco de dados.', details: err.message }
    });
  }
};
