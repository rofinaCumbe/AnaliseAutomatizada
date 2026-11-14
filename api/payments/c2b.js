/**
 * API Serverless Endpoint: Iniciar Cobrança C2B via Kivora Payments
 * Suporta M-Pesa (Vodacom: 84/85) e e-Mola (Movitel: 86/87)
 * Rota: POST /api/payments/c2b
 */

module.exports = async function handler(req, res) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

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
    let { phone, amount, reference, description, planName, customerEmail } = body;

    if (!phone) {
      return res.status(400).json({
        error: { code: 'MISSING_PHONE', message: 'O número de telemóvel é obrigatório.' }
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        error: { code: 'INVALID_AMOUNT', message: 'O montante deve ser maior que zero.' }
      });
    }

    // Normalizar número de telefone (remover +258, espaços, hífens)
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('258') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(3);
    }

    if (cleanPhone.length !== 9) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PHONE_FORMAT',
          message: 'Número de telemóvel inválido. Deve ter 9 dígitos (ex: 841234567 ou 861234567).'
        }
      });
    }

    // Identificar a operadora móvel nacional
    let provider = 'Desconhecido';
    if (cleanPhone.startsWith('84') || cleanPhone.startsWith('85')) {
      provider = 'M-Pesa (Vodacom)';
    } else if (cleanPhone.startsWith('86') || cleanPhone.startsWith('87')) {
      provider = 'e-Mola (Movitel)';
    } else if (cleanPhone.startsWith('82') || cleanPhone.startsWith('83')) {
      provider = 'mKesh (Tmcel)';
    } else {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_PREFIX',
          message: 'Prefixo não suportado para pagamento móvel em Moçambique. Use 84/85 (M-Pesa) ou 86/87 (e-Mola).'
        }
      });
    }

    // Gerar chave de idempotência obrigatória se não fornecida
    const cleanReference = reference || `AA-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const cleanDescription = description || `Subscrição ${planName || 'Análise Automatizada Pro'}`;

    const kivoraKey = process.env.KIVORA_SECRET_KEY;
    const kivoraUrl = (process.env.KIVORA_API_URL || 'https://www.kivorapayments.com').replace(/\/+$/, '');

    // Modo Simulação/Demonstração caso a chave de produção/teste ainda não esteja no servidor
    if (!kivoraKey || kivoraKey.includes('sua_chave') || kivoraKey === 'sk_test_sua_chave_secreta_aqui') {
      const mockId = `pay_sim_${Date.now()}`;
      return res.status(200).json({
        success: true,
        isSimulated: true,
        paymentId: mockId,
        status: 'pending',
        provider,
        phone: cleanPhone,
        amount: Number(amount),
        currency: 'MZN',
        reference: cleanReference,
        message: `Pedido ${provider} iniciado com sucesso! (Modo Simulação Ativo - configure KIVORA_SECRET_KEY na Vercel para live)`
      });
    }

    // Chamada oficial à API Kivora Payments
    const response = await fetch(`${kivoraUrl}/v1/c2b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kivoraKey}`
      },
      body: JSON.stringify({
        phone: cleanPhone,
        amount: Number(amount),
        currency: 'MZN',
        reference: cleanReference,
        description: cleanDescription
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      success: true,
      isSimulated: false,
      paymentId: data.id,
      status: data.status || 'pending',
      provider,
      phone: cleanPhone,
      amount: data.amount,
      currency: data.currency || 'MZN',
      reference: data.reference,
      message: `Solicitação de pagamento enviada com sucesso para ${provider}. Aguarde o prompt USSD no seu telemóvel.`
    });

  } catch (err) {
    console.error('Erro no processamento C2B:', err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ocorreu um erro interno ao comunicar com o gateway de pagamentos.'
      }
    });
  }
};
