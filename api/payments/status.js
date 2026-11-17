/**
 * API Serverless Endpoint: Consulta de Status de Pagamento C2B & Atualização no MongoDB Atlas
 * Rota: GET /api/payments/status?paymentId=pay_xxx
 */
const { connectToDatabase } = require('../lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Apenas requisições GET são aceitas.' }
    });
  }

  try {
    const { paymentId } = req.query;

    if (!paymentId) {
      return res.status(400).json({
        error: { code: 'MISSING_PAYMENT_ID', message: 'O parâmetro paymentId é obrigatório.' }
      });
    }

    const kivoraKey = process.env.KIVORA_SECRET_KEY;
    const kivoraUrl = (process.env.KIVORA_API_URL || 'https://www.kivorapayments.com').replace(/\/+$/, '');

    let currentStatus = 'pending';
    let isSimulated = false;

    if (paymentId.startsWith('pay_sim_') || !kivoraKey || kivoraKey.includes('sua_chave')) {
      isSimulated = true;
      const createdAt = parseInt(paymentId.replace('pay_sim_', ''), 10) || Date.now();
      const elapsedSeconds = (Date.now() - createdAt) / 1000;

      if (elapsedSeconds > 5) {
        currentStatus = 'paid';
      } else if (elapsedSeconds > 2) {
        currentStatus = 'processing';
      }
    } else {
      const response = await fetch(`${kivoraUrl}/v1/c2b/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kivoraKey}`,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      currentStatus = data.status;
    }

    // Atualizar status no MongoDB Atlas se mudou para paid/completed (mantendo o role salvo no banco)
    if (currentStatus === 'paid' || currentStatus === 'completed') {
      try {
        const { db } = await connectToDatabase();
        const tx = await db.collection('transactions').findOneAndUpdate(
          { paymentId },
          { $set: { status: 'paid', updatedAt: new Date() } },
          { returnDocument: 'after' }
        );
        if (tx && tx.customerEmail) {
          await db.collection('users').updateOne(
            { email: tx.customerEmail.toLowerCase() },
            {
              $set: {
                plan: 'pro',
                status: 'Ativo',
                updatedAt: new Date()
              }
            }
          );
        }
      } catch (dbErr) {
        console.warn('Aviso ao atualizar transação no MongoDB:', dbErr.message);
      }
    }

    return res.status(200).json({
      id: paymentId,
      status: currentStatus,
      isSimulated,
      message: currentStatus === 'paid' ? 'Pagamento confirmado com sucesso!' : 'Aguardando validação do PIN no telemóvel...'
    });

  } catch (err) {
    console.error('Erro na consulta de status Kivora:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno ao consultar o status do pagamento.'
      }
    });
  }
};
