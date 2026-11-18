/**
 * API Serverless Endpoint: Autenticação com Conta Google (OAuth 2.0 / Google Identity Services)
 * Valida o ID Token junto à Google e sincroniza o utilizador no MongoDB Atlas (apenas 2 roles: 'admin' e 'user').
 * Rota: POST /api/auth/google
 */
const { connectToDatabase } = require('../lib/mongodb');

const EXPECTED_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '78248021833-cre15s9u9ke00kciomqpv3kkki7l7um4.apps.googleusercontent.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Apenas requisições POST são aceitas.' }
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { credential } = body;

    if (!credential) {
      return res.status(400).json({
        error: { code: 'MISSING_CREDENTIAL', message: 'Token de autenticação Google não fornecido.' }
      });
    }

    // 1. Validar o ID Token diretamente junto aos servidores oficiais da Google
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!verifyRes.ok) {
      return res.status(401).json({
        error: { code: 'INVALID_GOOGLE_TOKEN', message: 'Token Google inválido ou expirado.' }
      });
    }

    const tokenInfo = await verifyRes.json();

    if (tokenInfo.aud !== EXPECTED_CLIENT_ID) {
      return res.status(401).json({
        error: { code: 'INVALID_AUDIENCE', message: 'O token não pertence a esta aplicação.' }
      });
    }

    const email = String(tokenInfo.email || '').trim().toLowerCase();
    const name = String(tokenInfo.name || email.split('@')[0]).trim();
    const picture = tokenInfo.picture || '';

    if (!email) {
      return res.status(400).json({
        error: { code: 'NO_EMAIL', message: 'A conta Google não devolveu um endereço de email.' }
      });
    }

    // 2. Sincronizar utilizador no MongoDB Atlas (estritamente 'admin' ou 'user')
    let finalUser = {
      name,
      email,
      picture,
      role: email === 'admin@analiseautomatizada.co.mz' ? 'admin' : 'user',
      plan: email === 'admin@analiseautomatizada.co.mz' ? 'admin' : 'free',
      status: 'Ativo',
      authProvider: 'google'
    };

    try {
      const { db } = await connectToDatabase();
      const usersCol = db.collection('users');
      const existing = await usersCol.findOne({ email });

      if (existing) {
        if (existing.status === 'Suspenso') {
          return res.status(403).json({
            error: {
              code: 'ACCOUNT_SUSPENDED',
              message: 'A sua conta encontra-se suspensa. Contacte o administrador do sistema.'
            }
          });
        }

        const safeRole =
          email === 'admin@analiseautomatizada.co.mz' || existing.role === 'admin'
            ? 'admin'
            : 'user';

        await usersCol.updateOne(
          { email },
          {
            $set: {
              name: existing.name || name,
              picture,
              role: safeRole,
              authProvider: 'google',
              updatedAt: new Date()
            }
          }
        );

        finalUser = {
          name: existing.name || name,
          email,
          picture,
          role: safeRole,
          plan: existing.plan || (safeRole === 'admin' ? 'admin' : 'free'),
          status: existing.status || 'Ativo',
          authProvider: 'google'
        };
      } else {
        const now = new Date();
        await usersCol.insertOne({
          ...finalUser,
          createdAt: now,
          updatedAt: now
        });
      }
    } catch (dbErr) {
      console.warn('Aviso ao sincronizar utilizador Google no MongoDB:', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Bem-vindo(a), ${finalUser.name}!`,
      user: finalUser
    });
  } catch (err) {
    console.error('Erro na autenticação Google:', err);
    return res.status(500).json({
      error: { code: 'GOOGLE_AUTH_ERROR', message: 'Erro interno ao autenticar com a conta Google.' }
    });
  }
};
