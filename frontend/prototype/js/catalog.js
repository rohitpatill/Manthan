// ============ Manthan — provider & model catalog (pricing per 1M tokens) ============
(function () {
  const CATALOG = {
    openai: {
      id: 'openai', label: 'OpenAI', short: 'OAI', color: '#0E8A6C',
      keyHint: 'sk-…', keyName: 'OpenAI API key',
      models: [
        { id: 'gpt-5.5', in: 5, out: 30 },
        { id: 'gpt-5.5-pro', in: 30, out: 180 },
        { id: 'gpt-5.4', in: 2.5, out: 15 },
        { id: 'gpt-5.4-mini', in: 0.75, out: 4.5 },
        { id: 'gpt-5.4-nano', in: 0.2, out: 1.25 },
        { id: 'gpt-5.4-pro', in: 30, out: 180 },
        { id: 'gpt-5.2', in: 1.75, out: 14 },
        { id: 'gpt-5.2-pro', in: 21, out: 168 },
        { id: 'gpt-5.1', in: 1.25, out: 10 },
        { id: 'gpt-5', in: 1.25, out: 10 },
        { id: 'gpt-5-mini', in: 0.25, out: 2 },
        { id: 'gpt-5-nano', in: 0.05, out: 0.4 },
        { id: 'gpt-5-pro', in: 15, out: 120 },
        { id: 'gpt-4.1', in: 2, out: 8 },
        { id: 'gpt-4.1-mini', in: 0.4, out: 1.6 },
        { id: 'gpt-4.1-nano', in: 0.1, out: 0.4 },
        { id: 'gpt-4o', in: 2.5, out: 10 },
        { id: 'gpt-4o-mini', in: 0.15, out: 0.6 },
        { id: 'o4-mini', in: 1.1, out: 4.4 },
        { id: 'o3', in: 2, out: 8 },
        { id: 'o3-mini', in: 1.1, out: 4.4 },
        { id: 'o3-pro', in: 20, out: 80 },
        { id: 'o1', in: 15, out: 60 },
        { id: 'o1-mini', in: 1.1, out: 4.4 },
        { id: 'o1-pro', in: 150, out: 600 },
      ],
    },
    gemini: {
      id: 'gemini', label: 'Google Gemini', short: 'GEM', color: '#3B6FD4',
      keyHint: 'AIza…', keyName: 'Gemini API key',
      models: [
        { id: 'gemini-3.1-pro-preview', in: 2, out: 12 },
        { id: 'gemini-3.1-flash-lite-preview', in: 0.25, out: 1.5 },
        { id: 'gemini-3-flash-preview', in: 0.5, out: 3 },
        { id: 'gemini-2.5-pro', in: 1.25, out: 10 },
        { id: 'gemini-2.5-flash', in: 0.3, out: 2.5 },
        { id: 'gemini-2.5-flash-lite', in: 0.1, out: 0.4 },
        { id: 'gemini-2.0-flash', in: 0.1, out: 0.4 },
      ],
    },
    anthropic: {
      id: 'anthropic', label: 'Anthropic Claude', short: 'ANT', color: '#BC5F38',
      keyHint: 'sk-ant-…', keyName: 'Anthropic API key',
      models: [
        { id: 'claude-opus-4.7', in: 5, out: 25 },
        { id: 'claude-opus-4.6', in: 5, out: 25 },
        { id: 'claude-opus-4.5', in: 5, out: 25 },
        { id: 'claude-opus-4.1', in: 15, out: 75 },
        { id: 'claude-opus-4', in: 15, out: 75 },
        { id: 'claude-sonnet-4.6', in: 3, out: 15 },
        { id: 'claude-sonnet-4.5', in: 3, out: 15 },
        { id: 'claude-sonnet-4', in: 3, out: 15 },
        { id: 'claude-haiku-4.5', in: 1, out: 5 },
      ],
    },
  };

  const PROVIDERS = ['openai', 'gemini', 'anthropic'];

  function findModel(provider, modelId) {
    const p = CATALOG[provider];
    if (!p) return null;
    return p.models.find((m) => m.id === modelId) || null;
  }

  // tokens → dollars
  function costOf(provider, modelId, inTok, outTok, cachedTok) {
    const m = findModel(provider, modelId);
    if (!m) return 0;
    const cached = cachedTok || 0;
    // cached input billed at 10% of input rate
    return ((inTok - cached) * m.in + cached * m.in * 0.1 + outTok * m.out) / 1e6;
  }

  function estimateTokens(text) {
    return Math.max(1, Math.ceil((text || '').length / 4));
  }

  function fmtCost(d) {
    if (d === 0) return '$0.00';
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

  window.Catalog = { CATALOG, PROVIDERS, findModel, costOf, estimateTokens, fmtCost, fmtTok };
})();
