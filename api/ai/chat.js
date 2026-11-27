/**
 * API Serverless Endpoint: Assistente Oficial da Plataforma Análise Automatizada
 * Motor interno: openai/gpt-oss-20b (oculto do utilizador final).
 * Suporta Modo Padrão (role: 'user') e Modo Executivo Avançado para Administrador (role: 'admin'):
 *  - Relatórios de Vendas & Receitas (M-Pesa vs e-Mola, Ticket Médio, Planos)
 *  - Relatórios e Auditoria de Utilizadores (Conversão, Roles, Ativos vs Suspensos)
 *  - Auditoria de Segurança, Transações e Infraestrutura MongoDB Atlas
 * Rota: POST /api/ai/chat
 */
const { connectToDatabase } = require('../lib/mongodb');

const INTERNAL_MODEL = process.env.AI_MODEL || 'openai/gpt-oss-20b';

function resolveProviderConfig() {
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.HF_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';

  let baseUrl = process.env.AI_BASE_URL || '';
  const model = INTERNAL_MODEL;

  if (!baseUrl) {
    if (apiKey.startsWith('gsk_')) {
      baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (apiKey.startsWith('hf_')) {
      baseUrl = 'https://router.huggingface.co/v1/chat/completions';
    } else {
      baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }
  }

  return { apiKey, baseUrl, model };
}

const SYSTEM_SCOPE_KEYWORDS = [
  'analise', 'análise', 'sistema', 'plataforma', 'workspace', 'painel', 'dashboard',
  'csv', 'ficheiro', 'arquivo', 'upload', 'carregar', 'importar', 'gcs', 'cloud', 'dataset', 'dados', 'tabela', 'coluna', 'linha', 'registo',
  'estatistica', 'estatística', 'media', 'média', 'mediana', 'desvio', 'soma', 'total', 'minimo', 'mínimo', 'maximo', 'máximo',
  'kpi', 'metrica', 'métrica', 'grafico', 'gráfico', 'visualizacao', 'visualização', 'tendencia', 'tendência', 'correlacao', 'correlação', 'padrao', 'padrão',
  'outlier', 'anomalia', 'z-score', 'zscore', 'atipico', 'atípico',
  'categoria', 'provincia', 'província', 'regiao', 'região', 'cidade', 'maputo', 'matola', 'beira', 'nampula', 'venda', 'vendas', 'receita', 'receitas', 'faturacao', 'faturação', 'financeiro', 'lucro', 'ticket',
  'relatorio', 'relatório', 'resumo', 'executivo', 'insight', 'recomendacao', 'recomendação', 'pdf', 'json', 'exportar', 'imprimir', 'baixar', 'descarregar',
  'plano', 'preco', 'preço', 'subscricao', 'subscrição', 'assinatura', 'gratuito', 'basico', 'básico', 'profissional', 'pro', 'corporativo', 'anual', 'mensal',
  'pagamento', 'pagar', 'checkout', 'mpesa', 'm-pesa', 'emola', 'e-mola', 'vodacom', 'movitel', 'kivora', 'pin', 'ussd', 'recibo', 'comprovativo', 'nuit', 'iva', 'mzn', 'metical', 'meticais', 'transacao', 'transações', 'transacoes',
  'conta', 'login', 'entrar', 'registo', 'registar', 'criar conta', 'senha', 'palavra-passe', 'google', 'autenticacao', 'autenticação', 'perfil',
  'admin', 'administrador', 'utilizador', 'utilizadores', 'usuario', 'usuarios', 'usuários', 'cliente', 'clientes', 'ficha', 'suspender', 'suspenso', 'reativar', 'editar', 'eliminar',
  'auditoria', 'auditar', 'seguranca', 'segurança', 'log', 'logs', 'infraestrutura', 'mongodb', 'banco de dados', 'base de dados', 'conversao', 'conversão', 'retencao', 'retenção', 'diagnostico', 'diagnóstico', 'balanco', 'balanço'
];

const GREETING_PATTERNS = /^(ol[aá]|oi|bom dia|boa tarde|boa noite|obrigad[oa]|ajuda|como funciona|menu|in[ií]cio)\b/i;

const OFF_TOPIC_PATTERNS = /\b(receita culin[aá]ria|bolo|futebol|jogo|pol[ií]tica|presidente|piada|poema|m[uú]sica|filme|clima|tempo meteorol[oó]gico|hor[oó]scopo|traduz|traduzir|escreve um texto|redac[cç][aã]o|hist[oó]ria universal|capital de|quem descobriu)\b/i;

function isSystemRelatedQuery(prompt) {
  const raw = String(prompt || '').trim();
  const q = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (OFF_TOPIC_PATTERNS.test(raw) || OFF_TOPIC_PATTERNS.test(q)) return false;
  if (GREETING_PATTERNS.test(raw) || GREETING_PATTERNS.test(q)) return true;
  if (/modelo|quem es|quem e voce|qual ia|chatgpt|openai|gemini|claude|llama|gpt/.test(q)) return true;

  return SYSTEM_SCOPE_KEYWORDS.some(kw => {
    const cleanKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return q.includes(cleanKw);
  });
}

function buildOutOfScopeMessage() {
  return 'Sou o assistente exclusivo da plataforma <strong>Análise Automatizada</strong> e apenas respondo a questões relacionadas com o sistema (análise de ficheiros CSV, relatórios estatísticos, gráficos, deteção de outliers, conta de utilizador e subscrições via M-Pesa ou e-Mola). Como posso ajudá-lo na utilização da plataforma?';
}

// Geração de Relatórios Executivos Avançados para o Administrador (role === 'admin')
function buildAdminAdvancedReport(prompt, adminMetrics) {
  const q = String(prompt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const users = (adminMetrics && adminMetrics.users) || [];
  const txs = (adminMetrics && adminMetrics.transactions) || [];
  const inquiries = (adminMetrics && adminMetrics.inquiries) || [];

  const totalUsers = users.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const stdUserCount = users.filter(u => u.role !== 'admin').length;
  const activeCount = users.filter(u => (u.status || 'Ativo') === 'Ativo').length;
  const suspendedCount = users.filter(u => u.status === 'Suspenso').length;
  const proCount = users.filter(u => u.plan === 'pro').length;
  const corpCount = users.filter(u => u.plan === 'corp').length;
  const freeCount = users.filter(u => !u.plan || u.plan === 'free').length;
  const paidConversion = stdUserCount > 0 ? Math.round(((proCount + corpCount) / stdUserCount) * 100) : 0;

  const paidTxs = txs.filter(t => t.status === 'paid' || t.status === 'completed');
  const totalRev = paidTxs.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const avgTicket = paidTxs.length > 0 ? Math.round(totalRev / paidTxs.length) : 0;

  const mpesaTxs = paidTxs.filter(t => !t.provider || !t.provider.toLowerCase().includes('mola'));
  const emolaTxs = paidTxs.filter(t => t.provider && t.provider.toLowerCase().includes('mola'));
  const mpesaRev = mpesaTxs.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const emolaRev = emolaTxs.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const mpesaShare = totalRev > 0 ? Math.round((mpesaRev / totalRev) * 100) : 0;
  const emolaShare = totalRev > 0 ? (100 - mpesaShare) : 0;

  // 1. Relatório de Vendas, Receita e Pagamentos Móveis
  if (/venda|receita|faturacao|financeiro|lucro|ticket|transac|mpesa|m-pesa|emola|e-mola|kivora|comercial/.test(q)) {
    const latestTx = paidTxs[0];
    const latestInfo = latestTx
      ? `Última liquidação: <strong>${latestTx.customerName || latestTx.customerEmail}</strong> (${Number(latestTx.amount).toLocaleString('pt-MZ')} MZN via ${latestTx.provider}, ref. <code>${latestTx.reference}</code>).`
      : 'Sem transações registadas.';

    return `<strong>📊 Relatório Executivo de Vendas &amp; Receita (Admin):</strong><br>` +
      `&bull; <strong>Receita Total Liquidada:</strong> ${totalRev.toLocaleString('pt-MZ')} MZN (${paidTxs.length} subscrições pagas)<br>` +
      `&bull; <strong>Ticket Médio por Subscrição:</strong> ${avgTicket.toLocaleString('pt-MZ')} MZN<br>` +
      `&bull; <strong>Quota M-Pesa (Vodacom):</strong> ${mpesaRev.toLocaleString('pt-MZ')} MZN (${mpesaTxs.length} pagamentos &bull; ${mpesaShare}%)<br>` +
      `&bull; <strong>Quota e-Mola (Movitel):</strong> ${emolaRev.toLocaleString('pt-MZ')} MZN (${emolaTxs.length} pagamentos &bull; ${emolaShare}%)<br>` +
      `&bull; ${latestInfo}`;
  }

  // 2. Relatório e Auditoria de Utilizadores / Clientes
  if (/utilizador|usuario|cliente|conta|retencao|conversao|suspenso|ativo|ficha|role|plano/.test(q)) {
    const namesPreview = users.slice(0, 5).map(u => `${u.name} (<code>${u.plan || 'free'}</code>)`).join(', ');
    return `<strong>👥 Relatório &amp; Auditoria de Utilizadores (Admin):</strong><br>` +
      `&bull; <strong>Total de Contas no MongoDB Atlas:</strong> ${totalUsers} (${activeCount} Ativos / ${suspendedCount} Suspensos)<br>` +
      `&bull; <strong>Conformidade de Roles:</strong> ${adminCount} <code>admin</code> &bull; ${stdUserCount} <code>user</code> (100% restrito aos 2 roles oficiais)<br>` +
      `&bull; <strong>Distribuição de Planos:</strong> ${proCount} Profissional (499 MZN) &bull; ${corpCount} Corporativo (3.999 MZN) &bull; ${freeCount} Gratuito<br>` +
      `&bull; <strong>Taxa de Conversão Premium:</strong> ${paidConversion}% dos utilizadores estão em planos pagos<br>` +
      `&bull; <strong>Amostra de Contas:</strong> ${namesPreview}.`;
  }

  // 3. Relatório de Auditoria do Sistema, Segurança e Base de Dados
  if (/auditoria|auditar|seguranca|log|infraestrutura|mongodb|banco de dados|base de dados|diagnostico|status|balanco/.test(q)) {
    return `<strong>🛡️ Relatório de Auditoria &amp; Conformidade do Sistema (Admin):</strong><br>` +
      `&bull; <strong>Base de Dados MongoDB Atlas:</strong> Online (<code>analiseautomatizadadb</code> &bull; 3 coleções ativas: <code>users</code>, <code>transactions</code>, <code>inquiries</code>)<br>` +
      `&bull; <strong>Controlo de Acesso (RBAC):</strong> Estritamente 2 roles ativos (<code>admin</code> e <code>user</code>); bloqueio automático para contas com estado <em>Suspenso</em> (${suspendedCount} suspensas)<br>` +
      `&bull; <strong>Auditoria de Pagamentos Kivora:</strong> ${paidTxs.length}/${txs.length} transações confirmadas com chave de idempotência verificada<br>` +
      `&bull; <strong>Atividade Analítica:</strong> ${inquiries.length} consultas/datasets registados em histórico de auditoria.`;
  }

  return null;
}

function buildCleanSystemResponse(prompt, context, userRole, adminMetrics) {
  const q = String(prompt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isAdmin = userRole === 'admin';

  if (!isSystemRelatedQuery(prompt)) {
    return buildOutOfScopeMessage();
  }

  // Identidade institucional limpa (sem revelar o modelo subjacente)
  if (/modelo|quem es|quem e voce|qual ia|chatgpt|openai|gemini|claude|gpt/.test(q)) {
    return isAdmin
      ? 'Sou o Assistente Executivo da plataforma <strong>Análise Automatizada</strong> (Modo Administrador). Tenho acesso em tempo real aos relatórios de vendas M-Pesa/e-Mola, auditoria de utilizadores, métricas de conversão, diagnóstico do MongoDB Atlas e análise estatística de datasets.'
      : 'Sou o Assistente Virtual oficial da plataforma <strong>Análise Automatizada</strong>, desenvolvido para apoiar na análise estatística dos seus dados, geração de relatórios executivos e gestão da sua conta no sistema.';
  }

  // Se for Administrador, verificar se pediu relatórios avançados (vendas, utilizadores, auditoria)
  if (isAdmin) {
    const adminReport = buildAdminAdvancedReport(prompt, adminMetrics);
    if (adminReport) return adminReport;
  } else {
    // Se um utilizador normal tentar pedir auditoria interna ou relatório global de vendas/clientes da plataforma
    if (/auditoria|auditar|todos os utilizadores|todos os usuarios|faturacao da plataforma|relatorio de vendas do sistema|logs do sistema/.test(q)) {
      return 'Os relatórios globais de auditoria, faturação interna e gestão de utilizadores estão disponíveis exclusivamente para contas com perfil de <strong>Administrador</strong>.';
    }
  }

  // Planos e Pagamentos para utilizadores gerais
  if (/mpesa|m-pesa|emola|e-mola|pagamento|pagar|plano|preco|subscri|checkout|recibo|nuit/.test(q)) {
    return 'A plataforma disponibiliza três opções: <strong>Plano Básico / Gratuito (0 MZN)</strong>, <strong>Plano Profissional (499 MZN/mês)</strong> e <strong>Plano Corporativo (3.999 MZN/ano)</strong>. Os pagamentos são processados em tempo real via <strong>M-Pesa (Vodacom 84/85)</strong> e <strong>e-Mola (Movitel 86/87)</strong> no Checkout, com emissão imediata de comprovativo.';
  }

  if (/login|entrar|conta|registo|senha|palavra-passe|google/.test(q)) {
    return 'Pode aceder à sua conta através de <strong>Email e Palavra-passe</strong> ou com 1 clique pelo botão <strong>Iniciar sessão com o Google</strong>.';
  }

  if (/pdf|json|exportar|imprimir|baixar|descarregar/.test(q)) {
    return 'No topo do relatório gerado na <strong>Área de Análise</strong>, utilize os botões <strong>Descarregar PDF</strong> ou <strong>Exportar JSON</strong> (e no Painel Admin, utilize <strong>Exportar CSV</strong> para a lista de clientes).';
  }

  // Se houver um dataset carregado na Área de Análise
  if (context && context.metrics && context.statistics) {
    const { dataset, rowsCount, colsCount, metrics, statistics, topCategory, topProvince, anomalies } = context;
    const m1 = metrics.metric1;
    const m2 = metrics.metric2;
    const st1 = statistics[m1] || { mean: 0, std: 0, min: 0, median: 0, max: 0, sum: 0 };
    const st2 = (m2 && statistics[m2]) ? statistics[m2] : null;
    const catName = topCategory ? topCategory[0] : 'Principal Segmento';
    const catVal = topCategory ? Number(topCategory[1]).toLocaleString('pt-MZ') : '0';
    const provName = topProvince ? topProvince[0] : 'Maputo';
    const provVal = topProvince ? Number(topProvince[1]).toLocaleString('pt-MZ') : '0';
    const anomCount = Array.isArray(anomalies) ? anomalies.length : 0;

    if (/outlier|anomalia|atipic|desvio|z-score/.test(q)) {
      if (anomCount === 0) {
        return `Na análise de <strong>${rowsCount || 0} registos</strong> do conjunto <strong>${dataset || 'atual'}</strong>, não foram detetados outliers severos (|z| &ge; 1.7) na métrica <strong>${m1}</strong> (Média: ${Number(st1.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 2 })}, Desvio Padrão: ${Number(st1.std).toLocaleString('pt-MZ', { maximumFractionDigits: 2 })}).`;
      }
      const topA = anomalies[0];
      return `Foram identificados <strong>${anomCount} outliers estatísticos</strong> (|z| &ge; 1.7). O principal ocorre em <strong>${topA.label}</strong> (${topA.col} = <strong>${Number(topA.val).toLocaleString('pt-MZ')} MT</strong>, z = <strong>${topA.z}</strong>).`;
    }

    if (/correlac|relacao|padrao|tendencia/.test(q)) {
      const ratioInfo = st2
        ? `A evolução conjunta entre <strong>${m1}</strong> (total: ${Number(st1.sum).toLocaleString('pt-MZ')} MT) e <strong>${m2}</strong> (média: ${Number(st2.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })}) confirma alinhamento operacional.`
        : `A proximidade entre a mediana (${Number(st1.median).toLocaleString('pt-MZ')} MT) e a média (${Number(st1.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })} MT) demonstra consistência nos registos.`;
      return `Observa-se concentração principal no segmento <strong>${catName}</strong> (${catVal} MT) e na região de <strong>${provName}</strong> (${provVal} MT). ${ratioInfo}`;
    }

    if (/provincia|regiao|cidade|maputo|beira|nampula|matola/.test(q)) {
      return `Na distribuição regional do dataset <strong>${dataset || 'ativo'}</strong>, a região líder é <strong>${provName}</strong> com <strong>${provVal} MT</strong> acumulados.`;
    }

    if (/categoria|segmento|maior receita|melhor/.test(q)) {
      return `O segmento com maior volume em <strong>${m1}</strong> é <strong>${catName}</strong>, totalizando <strong>${catVal} MT</strong> (amplitude entre ${Number(st1.min).toLocaleString('pt-MZ')} MT e ${Number(st1.max).toLocaleString('pt-MZ')} MT).`;
    }

    if (/resumo|geral|executivo|kpi|media|total|estat/.test(q)) {
      return `<strong>Resumo Executivo (${dataset || 'Dataset'}):</strong> Volume total de <strong>${Number(st1.sum).toLocaleString('pt-MZ')} MT</strong> em <strong>${rowsCount || 0} registos</strong> (${colsCount || 0} colunas), com média de <strong>${Number(st1.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })} MT</strong> e mediana de <strong>${Number(st1.median).toLocaleString('pt-MZ')} MT</strong>. Destaques: <strong>${catName}</strong> (${catVal} MT) e <strong>${provName}</strong> (${provVal} MT).`;
    }
  }

  if (/csv|upload|ficheiro|dados|gcs|como usar|analisar|relatorio/.test(q)) {
    return 'Para realizar uma análise: aceda à <strong>Área de Análise</strong>, carregue o seu ficheiro <code>.csv</code> (ou selecione <em>Carregar conjunto de exemplo</em>), digite a sua questão de negócio e clique em <strong>Gerar Relatório de Análise</strong>.';
  }

  if (isAdmin) {
    return 'Olá, <strong>Administrador</strong>! No Modo Executivo Admin posso gerar em tempo real: <strong>1) Relatório de Vendas &amp; Receita M-Pesa/e-Mola</strong>, <strong>2) Auditoria de Utilizadores &amp; Conversão</strong>, <strong>3) Diagnóstico de Segurança &amp; MongoDB Atlas</strong>, ou analisar qualquer dataset CSV carregado.';
  }

  return 'Olá! Sou o Assistente da <strong>Análise Automatizada</strong>. Posso ajudá-lo a analisar conjuntos de dados CSV, interpretar KPIs, gráficos e outliers, ou esclarecer dúvidas sobre planos e pagamentos via M-Pesa e e-Mola.';
}

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
    const { prompt, context, userEmail, userRole, adminState } = body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: { code: 'MISSING_PROMPT', message: 'A pergunta é obrigatória.' }
      });
    }

    const effectiveRole =
      userRole === 'admin' ||
      (userEmail && String(userEmail).toLowerCase() === 'admin@analiseautomatizada.co.mz')
        ? 'admin'
        : 'user';

    if (!isSystemRelatedQuery(prompt)) {
      return res.status(200).json({
        success: true,
        answer: buildOutOfScopeMessage()
      });
    }

    // Se for Admin, carregar dados reais atualizados do MongoDB Atlas (ou usar adminState)
    let liveAdminMetrics = adminState || null;
    try {
      const { db } = await connectToDatabase();
      if (effectiveRole === 'admin') {
        const [users, transactions, inquiries] = await Promise.all([
          db.collection('users').find({}, { projection: { password: 0 } }).toArray(),
          db.collection('transactions').find({}).sort({ createdAt: -1 }).toArray(),
          db.collection('inquiries').find({}).sort({ createdAt: -1 }).toArray()
        ]);
        liveAdminMetrics = { users, transactions, inquiries };
      }

      await db.collection('inquiries').insertOne({
        dataset: (context && context.dataset) ? context.dataset : (effectiveRole === 'admin' ? 'Auditoria Admin' : 'Assistente do Sistema'),
        rows: (context && context.rowsCount) ? Number(context.rowsCount) : 0,
        prompt: String(prompt).trim(),
        userEmail: userEmail || 'anonimo',
        userRole: effectiveRole,
        status: 'completed',
        createdAt: new Date()
      });
    } catch (dbErr) {}

    if (/modelo|quem és|quem es|quem é você|qual ia|chatgpt|openai|gemini|claude|gpt/i.test(prompt)) {
      return res.status(200).json({
        success: true,
        answer: buildCleanSystemResponse(prompt, context, effectiveRole, liveAdminMetrics)
      });
    }

    const { apiKey, baseUrl, model } = resolveProviderConfig();
    let answer = '';

    if (apiKey && !apiKey.includes('sua_chave')) {
      try {
        const systemInstruction =
          'Você é o Assistente Oficial da plataforma Análise Automatizada (Moçambique). ' +
          `O utilizador atual possui role="${effectiveRole}". ` +
          'REGRAS OBRIGATÓRIAS: ' +
          '1. NUNCA mencione nem explique qual é o seu modelo de IA subjacente. ' +
          '2. Responda EXCLUSIVAMENTE a questões relacionadas com o sistema Análise Automatizada. ' +
          (effectiveRole === 'admin' && liveAdminMetrics
            ? `3. MODO ADMIN ATIVO: Você tem acesso total aos dados de auditoria, vendas M-Pesa/e-Mola e utilizadores do banco: ${JSON.stringify(liveAdminMetrics)}. `
            : '3. MODO UTILIZADOR: Não revele dados internos de outros utilizadores ou auditoria global. ') +
          (context ? `Contexto estatístico do dataset atual: ${JSON.stringify(context)}` : '');

        const llmRes = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: String(prompt).trim() }
            ],
            temperature: 0.2,
            max_tokens: 500
          })
        });

        if (llmRes.ok) {
          const llmData = await llmRes.json();
          const rawContent =
            llmData.choices &&
            llmData.choices[0] &&
            llmData.choices[0].message &&
            llmData.choices[0].message.content;
          if (rawContent) {
            answer = rawContent.replace(/\[?gpt-oss-20b\]?:?\s*/gi, '');
          }
        }
      } catch (apiErr) {}
    }

    if (!answer) {
      answer = buildCleanSystemResponse(prompt, context, effectiveRole, liveAdminMetrics);
    }

    return res.status(200).json({
      success: true,
      role: effectiveRole,
      answer
    });
  } catch (err) {
    console.error('Erro no endpoint /api/ai/chat:', err);
    return res.status(500).json({
      error: { code: 'AI_CHAT_ERROR', message: 'Erro ao processar a sua questão no assistente.' }
    });
  }
};
