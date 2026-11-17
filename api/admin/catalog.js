/**
 * API Serverless Endpoint: Clientes e Produtos Reais (MongoDB Atlas)
 * Rota: GET /api/admin/catalog
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
    const customers = await db.collection('customers').find({}).toArray();
    const products = await db.collection('products').find({}).toArray();

    return res.status(200).json({
      success: true,
      source: 'mongodb_atlas',
      customersCount: customers.length,
      productsCount: products.length,
      customers,
      products
    });
  } catch (err) {
    console.error('Erro ao buscar catálogo do MongoDB Atlas:', err);
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: 'Erro ao consultar clientes e produtos no MongoDB Atlas.', details: err.message }
    });
  }
};
