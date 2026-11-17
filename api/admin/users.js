/**
 * API Serverless Endpoint: Gestão Real de Utilizadores no MongoDB Atlas
 * Rota: GET, POST, PUT, DELETE /api/admin/users
 */
const { connectToDatabase } = require('../lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const usersCol = db.collection('users');

    // 1. GET: Listar todos os utilizadores reais do MongoDB Atlas
    if (req.method === 'GET') {
      const users = await usersCol
        .find({}, { projection: { password: 0 } })
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        source: 'mongodb_atlas',
        count: users.length,
        users
      });
    }

    // 2. POST: Criar ou atualizar utilizador no MongoDB Atlas
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { name, email, role, plan, password } = body;

      if (!name || !email) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'Nome e email são obrigatórios.' }
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const now = new Date();

      const newUser = {
        name: name.trim(),
        email: cleanEmail,
        role: role || 'Analista de Dados',
        plan: plan || 'pro',
        status: 'Ativo',
        updatedAt: now
      };

      if (password) {
        newUser.password = password;
      }

      await usersCol.updateOne(
        { email: cleanEmail },
        { $set: newUser, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );

      return res.status(201).json({
        success: true,
        message: 'Utilizador gravado no MongoDB Atlas com sucesso.',
        user: newUser
      });
    }

    // 3. PUT: Atualizar plano ou cargo de um utilizador no MongoDB Atlas
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { email, plan, role, status } = body;

      if (!email) {
        return res.status(400).json({
          error: { code: 'MISSING_EMAIL', message: 'Email do utilizador é obrigatório.' }
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const updateDoc = { updatedAt: new Date() };
      if (plan) updateDoc.plan = plan;
      if (role) updateDoc.role = role;
      if (status) updateDoc.status = status;

      await usersCol.updateOne({ email: cleanEmail }, { $set: updateDoc });

      return res.status(200).json({
        success: true,
        message: 'Utilizador atualizado no MongoDB Atlas.'
      });
    }

    // 4. DELETE: Eliminar utilizador do MongoDB Atlas
    if (req.method === 'DELETE') {
      const email = req.query.email || (req.body && req.body.email);

      if (!email) {
        return res.status(400).json({
          error: { code: 'MISSING_EMAIL', message: 'Email do utilizador é obrigatório para exclusão.' }
        });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      if (cleanEmail === 'admin@analiseautomatizada.co.mz') {
        return res.status(403).json({
          error: { code: 'PROTECTED_ADMIN', message: 'A conta principal de administrador não pode ser eliminada.' }
        });
      }

      await usersCol.deleteOne({ email: cleanEmail });

      return res.status(200).json({
        success: true,
        message: 'Utilizador eliminado do MongoDB Atlas.'
      });
    }

    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não suportado.' } });
  } catch (err) {
    console.error('Erro na gestão de utilizadores MongoDB:', err);
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: 'Erro ao comunicar com o MongoDB Atlas.', details: err.message }
    });
  }
};
