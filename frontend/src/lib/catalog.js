// ============ Manthan — provider/model catalog ============
// Models + pricing come from the BACKEND (`GET /api/providers` → catalog),
// which is the single source of truth. Only display metadata lives here.

const META = {
  openai: { label: 'OpenAI', short: 'OAI', color: '#0E8A6C', keyHint: 'sk-…', keyName: 'OpenAI API key' },
  gemini: { label: 'Google Gemini', short: 'GEM', color: '#3B6FD4', keyHint: 'AIza…', keyName: 'Gemini API key' },
  anthropic: { label: 'Anthropic Claude', short: 'ANT', color: '#BC5F38', keyHint: 'sk-ant-…', keyName: 'Anthropic API key' },
};

const PROVIDERS = ['openai', 'gemini', 'anthropic'];

const CATALOG = {};
PROVIDERS.forEach((p) => { CATALOG[p] = { id: p, ...META[p], models: [] }; });

// called once with the backend catalog payload
function setModels(backendCatalog) {
  PROVIDERS.forEach((p) => {
    const entry = backendCatalog && backendCatalog[p];
    if (entry && Array.isArray(entry.models)) {
      CATALOG[p].models = entry.models.map((m) => ({ id: m.model_id, name: m.name, in: m.input, out: m.output }));
    }
  });
}

function findModel(provider, modelId) {
  const p = CATALOG[provider];
  if (!p) return null;
  return p.models.find((m) => m.id === modelId) || null;
}

function costOf(provider, modelId, inTok, outTok, cachedTok) {
  const m = findModel(provider, modelId);
  if (!m) return 0;
  const cached = cachedTok || 0;
  return ((inTok - cached) * m.in + cached * m.in * 0.1 + outTok * m.out) / 1e6;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function fmtCost(d) {
  if (!d) return '$0.00';
  if (d < 0.005) return '<$0.01';
  if (d < 10) return '$' + d.toFixed(2);
  return '$' + d.toFixed(0);
}

function fmtTok(n) {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  return (n / 1e6).toFixed(2) + 'M';
}

export const Catalog = { CATALOG, PROVIDERS, setModels, findModel, costOf, estimateTokens, fmtCost, fmtTok };
