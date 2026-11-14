/**
 * API Serverless Endpoint: Webhooks Kivora Payments
 * Recebe notificações automáticas de pagamentos e assinaturas
 * Rota: POST /api/webhooks/kivora
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Apenas requisições POST são aceitas neste webhook.' }
    });
  }

  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    console.log('[Kivora Webhook Recebido]:', JSON.stringify(event));

    const eventType = event.event || event.type;
    const payload = event.data || event;

    switch (eventType) {
      case 'payment.completed':
      case 'payment.paid':
        console.log(`[Pagamento Aprovado]: ID ${payload.id}, Montante: ${payload.amount} ${payload.currency}, Ref: ${payload.reference}`);
        // Aqui o sistema atualiza o status Pro do usuário no MongoDB
        break;

      case 'payment.failed':
        console.log(`[Pagamento Falhou]: ID ${payload.id}, Razão: ${payload.error || 'Cancelado ou saldo insuficiente'}`);
        break;

      case 'subscription.created':
      case 'subscription.renewed':
        console.log(`[Assinatura Ativa/Renovada]: ID ${payload.id}, Cliente: ${payload.customer?.email}`);
        break;

      default:
        console.log(`[Evento não mapeado]: ${eventType}`);
        break;
    }

    // A Kivora espera status HTTP 2xx para confirmar a recepção
    return res.status(200).json({ received: true, event: eventType });

  } catch (err) {
    console.error('Erro ao processar webhook Kivora:', err);
    return res.status(400).json({
      error: { code: 'INVALID_PAYLOAD', message: 'Falha ao processar o payload do webhook.' }
    });
  }
};
