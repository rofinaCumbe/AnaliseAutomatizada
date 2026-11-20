/**
 * API Serverless Endpoint: Persistência e Histórico de Datasets dos Clientes (MongoDB Atlas)
 * Permite que o cliente guarde e volte a visualizar ou reanalisar qualquer dataset submetido sempre que quiser.
 * Rota: GET, POST, DELETE /api/datasets
 */
const { connectToDatabase } = require('./lib/mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await connectToDatabase();
    const datasetsCol = db.collection('datasets');
    const inquiriesCol = db.collection('inquiries');

    // 1. GET: Listar datasets submetidos pelo cliente (ou globais de demonstração)
    if (req.method === 'GET') {
      const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
      const filter = email ? { $or: [{ ownerEmail: email }, { ownerEmail: 'guest' }] } : {};

      const datasets = await datasetsCol
        .find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(30)
        .toArray();

      return res.status(200).json({
        success: true,
        source: 'mongodb_atlas',
        count: datasets.length,
        datasets
      });
    }

    // 2. POST: Guardar ou atualizar um dataset submetido pelo cliente
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const {
        datasetId,
        name,
        cleanName,
        source,
        sizeLabel,
        headers,
        rows,
        lastInquiry,
        ownerEmail,
        ownerName
      } = body;

      if (!name || !Array.isArray(headers) || !Array.isArray(rows)) {
        return res.status(400).json({
          error: { code: 'INVALID_DATASET', message: 'Nome, cabeçalhos (headers) e linhas (rows) do dataset são obrigatórios.' }
        });
      }

      const cleanOwnerEmail = ownerEmail ? String(ownerEmail).trim().toLowerCase() : 'guest';
      const now = new Date();
      const id = datasetId || `ds_${cleanOwnerEmail}_${String(cleanName || name).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      // Guardamos até 2000 linhas no documento para visualização posterior rápida
      const storedRows = rows.slice(0, 2000);

      const doc = {
        datasetId: id,
        name,
        cleanName: cleanName || name.replace(/\.csv$/i, ''),
        source: source || 'Local',
        sizeLabel: sizeLabel || `${rows.length} linhas`,
        headers,
        rows: storedRows,
        rowCount: rows.length,
        colCount: headers.length,
        lastInquiry: lastInquiry || 'faça análise geral',
        ownerEmail: cleanOwnerEmail,
        ownerName: ownerName || 'Visitante',
        updatedAt: now
      };

      await datasetsCol.updateOne(
        { datasetId: id },
        { $set: doc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );

      // Registar também na coleção inquiries para estatísticas do painel admin
      if (lastInquiry) {
        await inquiriesCol.updateOne(
          { dataset: name, ownerEmail: cleanOwnerEmail },
          {
            $set: {
              dataset: name,
              rows: rows.length,
              prompt: lastInquiry,
              ownerEmail: cleanOwnerEmail,
              status: 'completed',
              updatedAt: now
            },
            $setOnInsert: { createdAt: now }
          },
          { upsert: true }
        );
      }

      return res.status(201).json({
        success: true,
        message: 'Dataset guardado com sucesso para visualização futura.',
        dataset: doc
      });
    }

    // 3. DELETE: Remover um dataset guardado pelo seu datasetId
    if (req.method === 'DELETE') {
      const datasetId = req.query.datasetId || (req.body && req.body.datasetId);
      if (!datasetId) {
        return res.status(400).json({
          error: { code: 'MISSING_ID', message: 'datasetId é obrigatório para remover o dataset.' }
        });
      }

      await datasetsCol.deleteOne({ datasetId: String(datasetId) });

      return res.status(200).json({
        success: true,
        message: 'Dataset removido do histórico.'
      });
    }

    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não suportado.' } });
  } catch (err) {
    console.error('Erro na API de datasets:', err);
    return res.status(500).json({
      error: { code: 'DB_ERROR', message: 'Erro ao comunicar com o MongoDB Atlas.', details: err.message }
    });
  }
};
