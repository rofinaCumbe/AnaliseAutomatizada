/**
 * API Serverless Endpoint: Consulta de Status de Pagamento C2B
 * Rota: GET /api/payments/status?paymentId=pay_xxx
 */

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

    // Se for simulação ou chave não preenchida
    if (paymentId.startsWith('pay_sim_') || !kivoraKey || kivoraKey.includes('sua_chave')) {
      const createdAt = parseInt(paymentId.replace('pay_sim_', ''), 10) || Date.now();
      const elapsedSeconds = (Date.now() - createdAt) / 1000;

      // Simular aprovação após 5 segundos de espera
      let simStatus = 'pending';
      if (elapsedSeconds > 5) {
        simStatus = 'paid';
      } else if (elapsedSeconds > 2) {
        simStatus = 'processing';
      }

      return res.status(200).json({
        id: paymentId,
        status: simStatus,
        amount: 499,
        currency: 'MZN',
        reference: `SIM-REF-${paymentId}`,
        createdAt: new Date(createdAt).toISOString(),
        isSimulated: true,
        message: simStatus === 'paid' ? 'Pagamento confirmado com sucesso!' : 'Aguardando validação do PIN no telemóvel...'
      });
    }

    // Consulta oficial à Kivora Payments
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

    return res.status(200).json(data);

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
