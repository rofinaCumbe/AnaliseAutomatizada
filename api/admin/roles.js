/**
 * API Serverless Endpoint: Roles / Cargos Salvos no Banco de Dados (MongoDB Atlas)
 * Rota: GET /api/admin/roles
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
    let roles = await db.collection('roles').find({ active: { $ne: false } }).sort({ name: 1 }).toArray();

    // Caso a coleção roles esteja vazia, extrai os roles únicos diretamente dos utilizadores gravados no banco
    if (!roles || roles.length === 0) {
      const distinctRoles = await db.collection('users').distinct('role');
      roles = distinctRoles.filter(Boolean).map((r, i) => ({
        name: r,
        code: r === 'Administrador do Sistema' ? 'admin' : `role_${i}`,
        isAdmin: r === 'Administrador do Sistema',
        active: true
      }));
    }

    return res.status(200).json({
      success: true,
      source: 'mongodb_atlas',
      count: roles.length,
      roles
    });
  } catch (err) {
    console.error('Erro ao buscar roles do MongoDB Atlas:', err);
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: 'Erro ao obter os roles do banco de dados.', details: err.message }
    });
  }
};
