/**
 * API Serverless Endpoint: Estatísticas Reais do Sistema (MongoDB Atlas)
 * Rota: GET /api/admin/stats
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

    // 1. Contagem real de utilizadores
    const usersCount = await db.collection('users').countDocuments({});

    // 2. Soma real da receita em MZN das transações M-Pesa e e-Mola
    const txAggregation = await db.collection('transactions').aggregate([
      { $match: { status: { $in: ['paid', 'completed'] } } },
      { $group: { _id: null, totalMZN: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray();

    const totalRevenueMZN = txAggregation.length > 0 ? txAggregation[0].totalMZN : 0;
    const paidTxCount = txAggregation.length > 0 ? txAggregation[0].count : 0;

    // 3. Contagem real de subscrições Pro e Corporativas ativas
    const proUsersCount = await db.collection('users').countDocuments({
      plan: { $in: ['pro', 'corp', 'admin'] }
    });

    // 4. Contagem real de datasets e análises processadas
    const inquiriesCount = await db.collection('inquiries').countDocuments({});

    return res.status(200).json({
      success: true,
      source: 'mongodb_atlas',
      totalUsers: usersCount,
      totalRevenueMZN,
      paidTransactions: paidTxCount,
      activeProUsers: proUsersCount,
      totalDatasets: inquiriesCount,
      inquiriesCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Erro ao obter estatísticas do MongoDB Atlas:', err);
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: 'Erro ao consultar o banco de dados MongoDB Atlas.', details: err.message }
    });
  }
};
