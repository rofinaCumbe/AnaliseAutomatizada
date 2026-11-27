/**
 * API Serverless Endpoint: Assistente Oficial da Plataforma Análise Automatizada
 * Motor interno: openai/gpt-oss-20b (oculto do utilizador final).
 * Restrição estrita de escopo: responde EXCLUSIVAMENTE a questões sobre o sistema Análise Automatizada e datasets carregados.
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
  let model = INTERNAL_MODEL;

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

// Palavras-chave permitidas (Escopo estrito do sistema Análise Automatizada)
const SYSTEM_SCOPE_KEYWORDS = [
  'analise', 'análise', 'sistema', 'plataforma', 'workspace', 'painel', 'dashboard',
  'csv', 'ficheiro', 'arquivo', 'upload', 'carregar', 'importar', 'gcs', 'cloud', 'dataset', 'dados', 'tabela', 'coluna', 'linha', 'registo',
  'estatistica', 'estatística', 'media', 'média', 'mediana', 'desvio', 'soma', 'total', 'minimo', 'mínimo', 'maximo', 'máximo',
  'kpi', 'metrica', 'métrica', 'grafico', 'gráfico', 'visualizacao', 'visualização', 'tendencia', 'tendência', 'correlacao', 'correlação', 'padrao', 'padrão',
  'outlier', 'anomalia', 'z-score', 'zscore', 'atipico', 'atípico',
  'categoria', 'provincia', 'província', 'regiao', 'região', 'cidade', 'maputo', 'matola', 'beira', 'nampula', 'venda', 'receita', 'faturacao', 'faturação',
  'relatorio', 'relatório', 'resumo', 'executivo', 'insight', 'recomendacao', 'recomendação', 'pdf', 'json', 'exportar', 'imprimir', 'baixar', 'descarregar',
  'plano', 'preco', 'preço', 'subscricao', 'subscrição', 'assinatura', 'gratuito', 'basico', 'básico', 'profissional', 'pro', 'corporativo', 'anual', 'mensal',
  'pagamento', 'pagar', 'checkout', 'mpesa', 'm-pesa', 'emola', 'e-mola', 'vodacom', 'movitel', 'kivora', 'pin', 'ussd', 'recibo', 'comprovativo', 'nuit', 'iva', 'mzn', 'metical', 'meticais',
  'conta', 'login', 'entrar', 'registo', 'registar', 'criar conta', 'senha', 'palavra-passe', 'google', 'autenticacao', 'autenticação', 'perfil',
  'admin', 'administrador', 'utilizador', 'cliente', 'ficha', 'suspender', 'suspenso', 'reativar', 'editar', 'eliminar'
];

const GREETING_PATTERNS = /^(ol[aá]|oi|bom dia|boa tarde|boa noite|obrigad[oa]|ajuda|como funciona|menu|in[ií]cio)\b/i;

const OFF_TOPIC_PATTERNS = /\b(receita culin[aá]ria|bolo|futebol|jogo|pol[ií]tica|presidente|piada|poema|m[uú]sica|filme|clima|tempo meteorol[oó]gico|hor[oó]scopo|traduz|traduzir|escreve um texto|redac[cç][aã]o|hist[oó]ria universal|capital de|quem descobriu)\b/i;

function isSystemRelatedQuery(prompt) {
  const raw = String(prompt || '').trim();
  const q = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (OFF_TOPIC_PATTERNS.test(raw) || OFF_TOPIC_PATTERNS.test(q)) {
    return false;
  }

  if (GREETING_PATTERNS.test(raw) || GREETING_PATTERNS.test(q)) {
    return true;
  }

  if (/modelo|quem es|quem e voce|qual ia|chatgpt|openai|gemini|claude|llama/.test(q)) {
    return true; // Tratado com resposta institucional limpa sem expor o modelo
  }

  return SYSTEM_SCOPE_KEYWORDS.some(kw => {
    const cleanKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return q.includes(cleanKw);
  });
}

function buildOutOfScopeMessage() {
  return 'Sou o assistente exclusivo da plataforma <strong>Análise Automatizada</strong> e apenas respondo a questões relacionadas com o sistema (análise de ficheiros CSV, relatórios estatísticos, gráficos, deteção de outliers, conta de utilizador e subscrições via M-Pesa ou e-Mola). Como posso ajudá-lo na utilização da plataforma?';
}

function buildCleanSystemResponse(prompt, context) {
  const q = String(prompt || '').toLowerCase();

  // 1. Bloquear perguntas fora do escopo do sistema
  if (!isSystemRelatedQuery(prompt)) {
    return buildOutOfScopeMessage();
  }

  // 2. Perguntas sobre identidade/modelo -> Resposta institucional limpa (sem revelar o modelo subjacente)
  if (/modelo|quem és|quem es|quem é você|qual ia|chatgpt|openai|gemini|claude|gpt/.test(q)) {
    return 'Sou o Assistente Virtual oficial da plataforma <strong>Análise Automatizada</strong>, desenvolvido para apoiar na análise estatística dos seus dados, geração de relatórios executivos e gestão da sua conta no sistema.';
  }

  // 3. Questões sobre Planos, Preços e Pagamentos M-Pesa / e-Mola
  if (/mpesa|m-pesa|emola|e-mola|pagamento|pagar|plano|preço|preco|subscri|checkout|recibo|nuit/.test(q)) {
    return 'A plataforma disponibiliza três opções: <strong>Plano Básico / Gratuito (0 MZN)</strong>, <strong>Plano Profissional (499 MZN/mês)</strong> e <strong>Plano Corporativo (3.999 MZN/ano)</strong>. Os pagamentos são processados em tempo real via <strong>M-Pesa (Vodacom 84/85)</strong> e <strong>e-Mola (Movitel 86/87)</strong> no Checkout, com emissão imediata de comprovativo.';
  }

  // 4. Questões sobre Login, Conta Google ou Administração
  if (/login|entrar|conta|registo|senha|palavra-passe|google|admin|ficha|suspenso/.test(q)) {
    return 'Pode aceder à sua conta através de <strong>Email e Palavra-passe</strong> ou com 1 clique pelo botão <strong>Iniciar sessão com o Google</strong>. Os administradores dispõem ainda do <strong>Painel Administrativo</strong> para gestão 360° de clientes, histórico de transações e exportação CSV.';
  }

  // 5. Questões sobre Exportação PDF / JSON
  if (/pdf|json|exportar|imprimir|baixar|descarregar/.test(q)) {
    return 'No topo do relatório gerado na <strong>Área de Análise</strong>, utilize os botões <strong>Descarregar PDF</strong> (para impressão ou gravação do relatório executivo formatado) ou <strong>Exportar JSON</strong> (para obter a estrutura completa das estatísticas e métricas calculadas).';
  }

  // 6. Se houver um dataset carregado na Área de Análise
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

    if (/outlier|anomalia|atípic|atipic|desvio|z-score/.test(q)) {
      if (anomCount === 0) {
        return `Na análise de <strong>${rowsCount || 0} registos</strong> do conjunto <strong>${dataset || 'atual'}</strong>, não foram detetados outliers severos (|z| &ge; 1.7) na métrica <strong>${m1}</strong> (Média: ${Number(st1.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 2 })}, Desvio Padrão: ${Number(st1.std).toLocaleString('pt-MZ', { maximumFractionDigits: 2 })}).`;
      }
      const topA = anomalies[0];
      return `Foram identificados <strong>${anomCount} outliers estatísticos</strong> (|z| &ge; 1.7). O principal ocorre em <strong>${topA.label}</strong> (${topA.col} = <strong>${Number(topA.val).toLocaleString('pt-MZ')} MT</strong>, z = <strong>${topA.z}</strong>). Recomenda-se verificar este registo na aba <em>Insights &amp; Actions</em>.`;
    }

    if (/correlac|relação|relacao|padrão|padrao|tendência|tendencia/.test(q)) {
      const ratioInfo = st2
        ? `A evolução conjunta entre <strong>${m1}</strong> (total: ${Number(st1.sum).toLocaleString('pt-MZ')} MT) e <strong>${m2}</strong> (média: ${Number(st2.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })}) confirma alinhamento operacional.`
        : `A proximidade entre a mediana (${Number(st1.median).toLocaleString('pt-MZ')} MT) e a média (${Number(st1.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })} MT) demonstra consistência nos registos.`;
      return `Observa-se concentração principal no segmento <strong>${catName}</strong> (${catVal} MT) e na região de <strong>${provName}</strong> (${provVal} MT). ${ratioInfo}`;
    }

    if (/província|provincia|região|regiao|cidade|maputo|beira|nampula|matola/.test(q)) {
      return `Na distribuição regional do dataset <strong>${dataset || 'ativo'}</strong>, a região líder é <strong>${provName}</strong> com <strong>${provVal} MT</strong> acumulados. Consulte o gráfico de distribuição na aba <em>Visualizações</em> para comparar as restantes províncias.`;
    }

    if (/categoria|segmento|maior receita|melhor/.test(q)) {
      return `O segmento com maior volume em <strong>${m1}</strong> é <strong>${catName}</strong>, totalizando <strong>${catVal} MT</strong> (mínimo registado de ${Number(st1.min).toLocaleString('pt-MZ')} MT e máximo de ${Number(st1.max).toLocaleString('pt-MZ')} MT).`;
    }

    if (/resumo|geral|executivo|kpi|média|media|total|estat/.test(q)) {
      return `<strong>Resumo Executivo (${dataset || 'Dataset'}):</strong> Volume total de <strong>${Number(st1.sum).toLocaleString('pt-MZ')} MT</strong> em <strong>${rowsCount || 0} registos</strong> (${colsCount || 0} colunas), com média de <strong>${Number(st1.mean).toLocaleString('pt-MZ', { maximumFractionDigits: 1 })} MT</strong> e mediana de <strong>${Number(st1.median).toLocaleString('pt-MZ')} MT</strong>. Destaques: <strong>${catName}</strong> (${catVal} MT) e <strong>${provName}</strong> (${provVal} MT).`;
    }
  }

  // 7. Como usar / carregar CSV / Saudação
  if (/csv|upload|ficheiro|dados|gcs|como usar|analisar|relatorio|relatório/.test(q)) {
    return 'Para realizar uma análise: aceda à <strong>Área de Análise</strong>, carregue o seu ficheiro <code>.csv</code> (ou selecione <em>Carregar conjunto de exemplo</em>), digite a sua questão de negócio e clique em <strong>Gerar Relatório de Análise</strong>.';
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
    const { prompt, context, userEmail } = body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: { code: 'MISSING_PROMPT', message: 'A pergunta é obrigatória.' }
      });
    }

    // Bloqueio imediato de questões gerais fora do sistema
    if (!isSystemRelatedQuery(prompt)) {
      return res.status(200).json({
        success: true,
        answer: buildOutOfScopeMessage()
      });
    }

    // Resposta institucional imediata caso perguntem sobre o modelo da IA
    if (/modelo|quem és|quem es|quem é você|qual ia|chatgpt|openai|gemini|claude|gpt/i.test(prompt)) {
      return res.status(200).json({
        success: true,
        answer: buildCleanSystemResponse(prompt, context)
      });
    }

    const { apiKey, baseUrl, model } = resolveProviderConfig();
    let answer = '';

    // Chamada interna ao modelo gpt-oss-20b com instruções estritas de confidencialidade e escopo
    if (apiKey && !apiKey.includes('sua_chave')) {
      try {
        const systemInstruction =
          'Você é o Assistente Oficial da plataforma Análise Automatizada (Moçambique). ' +
          'REGRAS OBRIGATÓRIAS: ' +
          '1. NUNCA mencione nem explique qual é o seu modelo de IA subjacente (nunca cite gpt-oss-20b, OpenAI, LLM ou arquitetura). Apresente-se apenas como Assistente da Análise Automatizada. ' +
          '2. Responda EXCLUSIVAMENTE a questões relacionadas com o sistema Análise Automatizada (análise de CSV, estatísticas, gráficos, outliers, relatórios PDF/JSON, autenticação e subscrições M-Pesa/e-Mola) e com os dados carregados. ' +
          '3. Recuse educadamente qualquer pergunta de conhecimento geral ou fora do contexto do sistema. ' +
          '4. Responda em Português claro e profissional, usando Meticais (MT / MZN). ' +
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
            max_tokens: 450
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
      } catch (apiErr) {
        console.warn('Usando motor local do sistema:', apiErr.message);
      }
    }

    if (!answer) {
      answer = buildCleanSystemResponse(prompt, context);
    }

    // Registar a consulta do sistema no MongoDB Atlas
    try {
      const { db } = await connectToDatabase();
      await db.collection('inquiries').insertOne({
        dataset: (context && context.dataset) ? context.dataset : 'Assistente do Sistema',
        rows: (context && context.rowsCount) ? Number(context.rowsCount) : 0,
        prompt: String(prompt).trim(),
        userEmail: userEmail || 'anonimo',
        status: 'completed',
        createdAt: new Date()
      });
    } catch (dbErr) {}

    return res.status(200).json({
      success: true,
      answer
    });
  } catch (err) {
    console.error('Erro no endpoint /api/ai/chat:', err);
    return res.status(500).json({
      error: { code: 'AI_CHAT_ERROR', message: 'Erro ao processar a sua questão no assistente.' }
    });
  }
};
