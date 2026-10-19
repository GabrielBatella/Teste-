// Motor da simulação: sem DOM, para poder ser testado em Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 6, START_ROWS = 10, HALL = 3 * COLS + 2, OLD_TILES = 42;
  const BASIC_COST = 1.5;
  const OVERDRAFT_LIMIT = 15000, LOAN_LIMIT = 30000, LOAN_RATE = 0.015, OVERDRAFT_RATE = 0.03, FEE = 0.003;
  // Redes básicas que a cidade já recebe de graça (só começam a faltar quando ela cresce)
  const BASE_POWER = 150, BASE_WATER = 100, BASE_SEWAGE = 80;
  const ERROR_BASE = 0.30;   // chance de erro de um funcionário em cada decisão (1,5 de 5)
  // Terreno: lotes de 12 terrenos, cada compra custa mais que a anterior (cidade sem limite)
  const LOT_SIZE = 12, LAND_BASE = 2000, LAND_GROWTH = 1.18;

  // Campos: housing/rent (moradia), jobs (empregos), sales (capacidade de venda), profit (lucro fixo),
  // needsWorkers, edu/health/safety/park (cobertura de moradores), fire, power/water/sewage (oferta),
  // powerUse/waterUse/sewageUse (consumo), pollution (+ polui, - limpa).
  const BUILDINGS = {
    casa:        {name: 'Casa',               icon: '🏠', cost: 800,  upkeep: 8,   housing: 12, kind: 'Privado', desc: 'Abriga 12 moradores. Você recebe aluguel.'},
    predio:      {name: 'Prédio',             icon: '🏢', cost: 3200, upkeep: 30,  housing: 60, kind: 'Privado', desc: 'Abriga 60 moradores.'},
    condominio:  {name: 'Condomínio de luxo', icon: '🏰', cost: 4500, upkeep: 40,  housing: 30, rent: 9, kind: 'Privado', desc: 'Abriga 30 moradores ricos que pagam aluguel alto.'},
    loja:        {name: 'Comércio',           icon: '🏪', cost: 1500, upkeep: 15,  jobs: 8,  sales: 300, powerUse: 8, kind: 'Privado', desc: '8 empregos. Lucra com o consumo da cidade.'},
    mercado:     {name: 'Shopping',           icon: '🛒', cost: 5000, upkeep: 60,  jobs: 25, sales: 900, powerUse: 30, kind: 'Privado', desc: '25 empregos e muita capacidade de venda.'},
    fazenda:     {name: 'Fazenda',            icon: '🌾', cost: 1800, upkeep: 15,  jobs: 12, profit: 70, needsWorkers: true, waterUse: 40, kind: 'Privado', desc: '12 empregos e lucro fixo, sem poluição.'},
    fabrica:     {name: 'Fábrica',            icon: '🏭', cost: 4000, upkeep: 60,  jobs: 30, profit: 160, needsWorkers: true, pollution: 4, powerUse: 50, waterUse: 30, sewageUse: 20, kind: 'Privado', desc: '30 empregos e lucro fixo, mas polui e gasta energia e água.'},
    tecnologia:  {name: 'Polo tecnológico',   icon: '💻', cost: 7000, upkeep: 90,  jobs: 35, profit: 200, needsWorkers: true, edu: 0, powerUse: 40, kind: 'Privado', desc: '35 empregos. Lucra mais quando o povo é bem educado.'},
    escola:      {name: 'Escola',             icon: '🏫', cost: 2000, upkeep: 60,  edu: 150, kind: 'Público', desc: 'Educação para ~150 moradores.'},
    universidade:{name: 'Universidade',       icon: '🎓', cost: 6000, upkeep: 150, edu: 400, powerUse: 20, kind: 'Público', desc: 'Educação para ~400 moradores.'},
    hospital:    {name: 'Hospital',           icon: '🏥', cost: 3500, upkeep: 100, health: 250, powerUse: 10, kind: 'Público', desc: 'Saúde para ~250 moradores.'},
    policia:     {name: 'Delegacia',          icon: '🚓', cost: 2500, upkeep: 70,  safety: 200, kind: 'Público', desc: 'Segurança para ~200 moradores.'},
    bombeiros:   {name: 'Bombeiros',          icon: '🚒', cost: 2200, upkeep: 60,  safety: 100, fire: 250, kind: 'Público', desc: 'Reduz o estrago dos incêndios e ajuda na segurança.'},
    parque:      {name: 'Parque',             icon: '🌳', cost: 800,  upkeep: 10,  park: 100, pollution: -3, kind: 'Público', desc: 'Lazer para ~100 moradores e reduz um pouco a poluição.'},
    estadio:     {name: 'Estádio',            icon: '🏟️', cost: 7500, upkeep: 120, park: 300, profit: 80, powerUse: 25, kind: 'Público', desc: 'Lazer para ~300 moradores e atrai turistas.'},
    agua:        {name: 'Estação de água',    icon: '🚰', cost: 2500, upkeep: 40,  water: 300, kind: 'Serviço', desc: 'Água para ~300 moradores.'},
    esgoto:      {name: 'Tratamento de esgoto', icon: '🚽', cost: 3200, upkeep: 50, sewage: 350, kind: 'Serviço', desc: 'Saneamento para ~350 moradores.'},
    solar:       {name: 'Energia solar',      icon: '☀️', cost: 3000, upkeep: 15,  power: 150, kind: 'Serviço', desc: 'Energia limpa, mas pequena.'},
    eolica:      {name: 'Energia eólica',     icon: '🌬️', cost: 4500, upkeep: 25,  power: 260, kind: 'Serviço', desc: 'Energia limpa e barata de manter.'},
    carvao:      {name: 'Usina a carvão',     icon: '⚡', cost: 3500, upkeep: 80,  power: 600, pollution: 6, kind: 'Serviço', desc: 'Muita energia, mas polui bastante.'},
    filtro:      {name: 'Filtros industriais', icon: '🌫️', cost: 2500, upkeep: 35, pollution: -5, kind: 'Ambiente', desc: 'Tira poluição do ar.'},
    floresta:    {name: 'Reflorestamento',    icon: '🌲', cost: 1500, upkeep: 5,   pollution: -4, kind: 'Ambiente', desc: 'Barato e limpa um pouco o ar.'},
    reciclagem:  {name: 'Usina de reciclagem', icon: '♻️', cost: 3500, upkeep: 40, pollution: -6, profit: 60, jobs: 6, kind: 'Ambiente', desc: 'Limpa bem o ar e rende um lucro com o material vendido.'},
  };
  const HALL_UPKEEP = 50, HALL_JOBS = 5;

  const ASSETS = [
    {key: 'poupanca', name: 'Poupança',          icon: '🐖', drift: 0.005,  vol: 0,     desc: 'Segura e sem taxa. Rende pouco.'},
    {key: 'cdb',      name: 'Renda Fixa (CDB)',  icon: '🏦', drift: 0.0085, vol: 0.002, desc: 'Rende mais que a poupança, quase sem risco.'},
    {key: 'tesouro',  name: 'Tesouro Direto',    icon: '🏛️', drift: 0.0075, vol: 0.006, desc: 'Governo como devedor. Protege da inflação.'},
    {key: 'fii',      name: 'Fundo Imobiliário', icon: '🏘️', drift: 0.009,  vol: 0.025, desc: 'Risco moderado, acompanha o mercado.'},
    {key: 'ouro',     name: 'Ouro',              icon: '🥇', drift: 0.006,  vol: 0.035, desc: 'Sobe nas crises. Bom para se proteger.'},
    {key: 'etf',      name: 'Fundo de índice',   icon: '🌎', drift: 0.010,  vol: 0.045, desc: 'Um pouco de tudo da bolsa mundial.'},
    {key: 'dolar',    name: 'Dólar',             icon: '💵', drift: 0.004,  vol: 0.05,  desc: 'Dispara quando o mercado entra em pânico.'},
    {key: 'acoes',    name: 'Ações',             icon: '📈', drift: 0.012,  vol: 0.07,  desc: 'Pode render muito ou cair forte.'},
    {key: 'cripto',   name: 'Criptomoeda',       icon: '🪙', drift: 0.015,  vol: 0.16,  desc: 'Altíssimo risco, altíssimo retorno.'},
    {key: 'startup',  name: 'Startups',          icon: '🚀', drift: 0.025,  vol: 0.28,  desc: 'Quase sempre perde, mas uma pode multiplicar tudo.'},
  ];
  const SAFE_ASSETS = ['poupanca', 'cdb', 'tesouro'];
  const RISKY_ASSETS = ['acoes', 'cripto', 'fii', 'etf', 'startup'];
  const GLOBAL_ASSETS = ['ouro', 'dolar', 'etf'];

  // ---------- Equipe: 15 pessoas, 5 por área, 8 níveis cada ----------
  // requires: precisa contratar antes. area: bônus de time completo para quem é da mesma área.
  const STAFF = {
    arquiteto:  {area: 'obras', name: 'Arquiteto', icon: '📐', salary: 45, requires: null, pop: 40,
      desc: 'Constrói casas e comércios quando a cidade precisa, compra terreno quando acaba e consegue desconto em todas as obras da cidade.'},
    obras:      {area: 'obras', name: 'Gerente de Obras', icon: '🧰', salary: 35, requires: 'arquiteto', pop: 70,
      desc: 'Corta os custos de manutenção e dos serviços básicos da cidade.'},
    infra:      {area: 'obras', name: 'Engenheiro de Infraestrutura', icon: '🔧', salary: 30, requires: 'arquiteto', pop: 90,
      desc: 'Constrói energia, água e esgoto quando faltam e faz as redes renderem mais.'},
    ambiental:  {area: 'obras', name: 'Engenheiro Ambiental', icon: '🌿', salary: 25, requires: 'infra', pop: 130,
      desc: 'Reduz a poluição e constrói filtros e florestas quando o ar piora.'},
    social:     {area: 'obras', name: 'Planejador Social', icon: '🤲', salary: 30, requires: 'obras', pop: 110,
      desc: 'Constrói escolas, hospitais, delegacias e parques quando faltam e deixa o povo mais feliz.'},
    analista:   {area: 'invest', name: 'Analista de Mercado', icon: '📊', salary: 45, requires: null, nw: 40000,
      desc: 'Avisa quando um investimento está caro ou barato e melhora o retorno da carteira.'},
    corretor:   {area: 'invest', name: 'Corretor', icon: '💼', salary: 30, requires: 'analista', nw: 70000,
      desc: 'Corta as taxas de corretagem e aplica parte das sobras em renda fixa.'},
    risco:      {area: 'invest', name: 'Gestor de Risco', icon: '🛡️', salary: 45, requires: 'analista', nw: 90000,
      desc: 'Vende o que despenca, suaviza as quedas das crises e protege sua carteira.'},
    global:     {area: 'invest', name: 'Analista Global', icon: '🌍', salary: 55, requires: 'risco', nw: 200000,
      desc: 'Entende o mercado mundial: melhora o retorno de ouro, dólar e fundo de índice.'},
    contador:   {area: 'invest', name: 'Contador', icon: '🧮', salary: 35, requires: 'analista', nw: 50000,
      desc: 'Melhora a arrecadação de impostos da cidade.'},
    gerente:    {area: 'fin', name: 'Gerente Financeiro', icon: '🏦', salary: 35, requires: null, pop: 80,
      desc: 'Paga dívidas quando sobra dinheiro, pede empréstimo para você não ficar no vermelho e consegue juros menores.'},
    tesoureiro: {area: 'fin', name: 'Tesoureiro', icon: '🏛️', salary: 40, requires: 'gerente', pop: 150,
      desc: 'Aumenta seu limite de crédito e reduz os juros do cheque especial.'},
    diplomata:  {area: 'fin', name: 'Diplomata', icon: '🤝', salary: 40, requires: 'gerente', pop: 120,
      desc: 'Cuida da relação com os vizinhos, manda presentes quando esfria e melhora os tratados.'},
    economista: {area: 'fin', name: 'Economista', icon: '📈', salary: 50, requires: 'diplomata', pop: 250,
      desc: 'Amortece as crises e faz o comércio render mais.'},
    auditor:    {area: 'fin', name: 'Auditor', icon: '⚖️', salary: 45, requires: 'tesoureiro', pop: 300,
      desc: 'Reduz os erros de toda a equipe e recupera parte do dinheiro perdido em erros.'},
  };
  const STAFF_ORDER = Object.keys(STAFF);
  const SALARY_ORDER = STAFF_ORDER;
  const AREAS = [
    ['obras', '🏗️ Construção e cidade', ['arquiteto', 'obras', 'infra', 'ambiental', 'social']],
    ['invest', '📊 Investimentos', ['analista', 'corretor', 'risco', 'global', 'contador']],
    ['fin', '🏦 Finanças e relações', ['gerente', 'tesoureiro', 'diplomata', 'economista', 'auditor']],
  ];
  // Níveis de 1 a 8: salário sobe, treinamento custa uma vez, e cada nível aguenta uma cidade maior.
  const MAX_LEVEL = 8;
  const SALARY_MULT = [1, 1.2, 1.45, 1.75, 2.1, 2.6, 3.2, 4];
  const TRAIN_COST = [700, 1500, 2500, 4000, 6000, 9500, 15000];   // para ir do nível 1→2, 2→3...
  const CAPACITY = [60, 110, 180, 290, 450, 700, 1100, 1800];       // habitantes que dá conta de atender

  // ---------- Mundo: vizinhos com relação, economia, empréstimos e política ----------
  const NEIGHBORS = [
    {key: 'vizinha',  name: 'Cidade Vizinha',    icon: '🏘️', wealth: 15000, desc: 'Pequena e próxima. Boa para negócios do dia a dia.'},
    {key: 'republica', name: 'República do Norte', icon: '🏔️', wealth: 40000, desc: 'País industrial, valoriza trabalho e comércio.'},
    {key: 'reino',    name: 'Reino do Sul',      icon: '👑', wealth: 80000, desc: 'País rico, com bancos fortes e muito dinheiro.'},
    {key: 'uniao',    name: 'União dos Mares',   icon: '🌊', wealth: 30000, desc: 'Nação de portos e turismo.'},
  ];
  const TREATY_COST = 2000, TREATY_UPKEEP = 100;

  const GOALS = [
    {id: 'pop100',  text: 'Chegar a 100 habitantes',  test: s => s.pop >= 100},
    {id: 'pop500',  text: 'Chegar a 500 habitantes',  test: s => s.pop >= 500},
    {id: 'pop1500', text: 'Chegar a 1.500 habitantes', test: s => s.pop >= 1500},
    {id: 'pop5000', text: 'Chegar a 5.000 habitantes', test: s => s.pop >= 5000},
    {id: 'nw50',    text: 'Patrimônio de R$ 50 mil',  test: s => netWorth(s) >= 50000},
    {id: 'nw200',   text: 'Patrimônio de R$ 200 mil', test: s => netWorth(s) >= 200000},
    {id: 'nw1m',    text: 'Patrimônio de R$ 1 milhão', test: s => netWorth(s) >= 1000000},
    {id: 'diver',   text: 'Investir em 3 ativos diferentes', test: s => ASSETS.filter(a => s.assets[a.key].units > 0).length >= 3},
    {id: 'team',    text: 'Contratar 3 funcionários', test: s => STAFF_ORDER.filter(k => hired(s, k)).length >= 3},
    {id: 'team10',  text: 'Montar uma equipe de 8 funcionários', test: s => STAFF_ORDER.filter(k => hired(s, k)).length >= 8},
    {id: 'train',   text: 'Treinar um funcionário até o nível 5', test: s => STAFF_ORDER.some(k => levelOf(s, k) >= 5)},
    {id: 'clean',   text: 'Ar limpo com 300 habitantes', test: s => s.pop >= 300 && analyze(s).pollution === 0},
    {id: 'friends', text: 'Boa relação com todos os vizinhos', test: s => NEIGHBORS.every(n => s.world.rel[n.key] >= 70)},
    {id: 'treaty',  text: 'Assinar 2 tratados comerciais', test: s => NEIGHBORS.filter(n => s.world.treaty[n.key]).length >= 2},
    {id: 'happy80', text: 'Felicidade acima de 80',   test: s => s.pop >= 50 && s.happy >= 80},
  ];

  function mulberry(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(s) {
    const u = Math.max(1e-9, mulberry(s)), v = mulberry(s);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function newAsset() { return {price: 100, units: 0, spent: 0, hist: [100]}; }
  function newWorld() {
    const w = {econ: {}, rel: {}, treaty: {}, owed: {}, giftCd: {}, lent: [], request: null, dilemma: null, mods: {commerce: 1, commerceLeft: 0, upkeep: 1, upkeepLeft: 0}, news: []};
    NEIGHBORS.forEach(n => { w.econ[n.key] = 1; w.rel[n.key] = 50; w.treaty[n.key] = false; w.owed[n.key] = 0; w.giftCd[n.key] = 0; });
    return w;
  }

  function newGame(seed) {
    const tiles = Array(COLS * START_ROWS).fill(null);
    tiles[HALL] = 'prefeitura';
    tiles[HALL - 1] = 'casa'; tiles[HALL + 1] = 'casa'; tiles[HALL + COLS] = 'loja';
    const assets = {};
    ASSETS.forEach(a => { assets[a.key] = newAsset(); });
    return {
      v: 1, seed: seed == null ? (Date.now() | 0) : seed, month: 0, cash: 10000, debt: 0, taxRate: 10,
      tiles, landBought: 0, pop: 20, happy: 55, assets, mods: {econ: 1, econLeft: 0, upkeep: 1, upkeepLeft: 0},
      log: ['Bem-vindo, prefeito! Cuide da cidade e faça o dinheiro render.'],
      report: null, over: null, staff: defaultStaff(), staffSeen: {}, staffStats: {errors: 0, cost: 0},
      world: newWorld(), lowHappy: 0, goals: {}, netHist: [10000],
    };
  }

  function defaultStaff() {
    const o = {};
    STAFF_ORDER.forEach(k => { o[k] = {hired: false, auto: true, level: 1}; });
    return o;
  }
  const hired = (s, k) => !!(s.staff && s.staff[k] && s.staff[k].hired);
  const active = (s, k) => hired(s, k) && s.staff[k].auto;
  const levelOf = (s, k) => hired(s, k) ? (s.staff[k].level || 1) : 0;
  const salaryAt = (k, lvl) => Math.round(STAFF[k].salary * SALARY_MULT[lvl - 1] / 5) * 5;
  const salaryOf = (s, k) => hired(s, k) ? salaryAt(k, levelOf(s, k)) : 0;
  function staffCost(s) { return STAFF_ORDER.reduce((t, k) => t + salaryOf(s, k), 0); }
  // Por que ainda não dá para contratar (null = dá)
  function lockReason(s, k) {
    const f = STAFF[k], need = [];
    if (f.requires && !hired(s, f.requires)) need.push('contratar ' + STAFF[f.requires].name);
    if (f.pop && s.pop < f.pop) need.push(`${f.pop} habitantes`);
    if (f.nw && netWorth(s) < f.nw) need.push(`patrimônio de ${money(f.nw)}`);
    return need.length ? 'Precisa de: ' + need.join(' e ') : null;
  }
  const isUnlocked = (s, k) => lockReason(s, k) === null;
  // Eficiência: 1 = dá conta da cidade; menos que isso = sobrecarregado
  const capacityOf = (s, k) => CAPACITY[levelOf(s, k) - 1] || 0;
  const efficiency = (s, k) => hired(s, k) ? clamp(capacityOf(s, k) / Math.max(1, s.pop), 0.25, 1) : 0;
  // Bônus de time completo: +4% para cada colega da mesma área contratado
  const teamBonus = (s, k) => 1 + 0.04 * (STAFF_ORDER.filter(x => STAFF[x].area === STAFF[k].area && hired(s, x)).length - 1);
  // "Nível efetivo": nível × eficiência × bônus de time (é o que vira efeito no jogo)
  const pw = (s, k) => hired(s, k) ? levelOf(s, k) * efficiency(s, k) * teamBonus(s, k) : 0;
  const lv = (s, k) => levelOf(s, k);
  // Chance de errar: 30% normalmente, mais se estiver sobrecarregado, menos com Auditor
  const errorChance = (s, k) => clamp(ERROR_BASE + 0.25 * (1 - efficiency(s, k)) - 0.03 * lv(s, 'auditor'), 0.08, 0.6);

  const loanLimit = s => LOAN_LIMIT + 5000 * lv(s, 'tesoureiro');
  const loanRate = s => LOAN_RATE - (hired(s, 'gerente') ? 0.003 + 0.001 * pw(s, 'gerente') : 0) - 0.0008 * pw(s, 'tesoureiro');
  const overdraftRate = s => OVERDRAFT_RATE * (1 - 0.06 * lv(s, 'tesoureiro'));
  const upkeepCut = s => Math.min(0.5, 0.09 * pw(s, 'obras'));
  const taxBoost = s => 0.04 * pw(s, 'contador');
  const buildDiscount = s => hired(s, 'arquiteto') ? 0.08 + 0.025 * lv(s, 'arquiteto') : 0;
  const gridBoost = s => 0.04 * pw(s, 'infra');
  const smogCut = s => Math.min(0.7, 0.07 * pw(s, 'ambiental'));
  const joyBonus = s => 0.6 * pw(s, 'social');
  const analystEdge = (s, key) => key === 'poupanca' ? 0 : 0.0012 * pw(s, 'analista') + (GLOBAL_ASSETS.indexOf(key) >= 0 ? 0.0012 * pw(s, 'global') : 0);
  const feeRate = s => FEE * Math.max(0, 1 - 0.14 * lv(s, 'corretor'));
  const stopLoss = s => Math.max(0.10, 0.30 - 0.025 * lv(s, 'risco'));
  const shockSoftener = s => Math.min(0.6, 0.05 * pw(s, 'risco'));
  const econSoftener = s => Math.min(0.6, 0.06 * pw(s, 'economista'));
  const auditRefund = s => Math.min(0.5, 0.04 * lv(s, 'auditor'));
  const maxBuilds = s => Math.ceil(lv(s, 'arquiteto') / 3);

  function upgradeCost(s, k) { return hired(s, k) && levelOf(s, k) < MAX_LEVEL ? TRAIN_COST[levelOf(s, k) - 1] : null; }
  function upgrade(s, k) {
    if (s.over) return {ok: false, msg: 'O jogo acabou.'};
    if (!hired(s, k)) return {ok: false, msg: 'Contrate primeiro.'};
    const cost = upgradeCost(s, k);
    if (cost == null) return {ok: false, msg: 'Já está no nível máximo.'};
    if (s.cash < cost) return {ok: false, msg: 'Dinheiro insuficiente para o treinamento.'};
    s.cash -= cost; s.staff[k].level = levelOf(s, k) + 1;
    return {ok: true};
  }
  const pct = v => Math.round(v * 100) + '%';
  const rate2 = v => (v * 100).toFixed(2).replace('.', ',') + '%';
  // Resumo para a interface
  function staffInfo(s, k) {
    const L = levelOf(s, k), lines = [];
    switch (k) {
      case 'arquiteto': lines.push(`Todas as obras ${pct(buildDiscount(s))} mais baratas`, `Até ${maxBuilds(s)} obra(s) por mês`); break;
      case 'obras': lines.push(`Manutenção e serviços -${pct(upkeepCut(s))}`); break;
      case 'infra': lines.push(`Redes rendem +${pct(gridBoost(s))}`, `Manutenção dos serviços -${pct(Math.min(0.5, 0.06 * pw(s, 'infra')))}`); break;
      case 'ambiental': lines.push(`Poluição -${pct(smogCut(s))}`, `Manutenção ambiental -${pct(Math.min(0.5, 0.06 * pw(s, 'ambiental')))}`); break;
      case 'social': lines.push(`Felicidade +${(joyBonus(s)).toFixed(1).replace('.', ',')}`, `Manutenção dos públicos -${pct(Math.min(0.5, 0.05 * pw(s, 'social')))}`); break;
      case 'analista': lines.push(`Retorno +${rate2(analystEdge(s, 'acoes'))} ao mês`); break;
      case 'corretor': lines.push(`Taxa de corretagem ${rate2(feeRate(s))}`, `Aplica até ${money(1500 * L)} por mês`); break;
      case 'risco': lines.push(`Vende se cair ${pct(stopLoss(s))}`, `Crises doem ${pct(shockSoftener(s))} menos`); break;
      case 'global': lines.push(`Ouro, dólar e índice +${rate2(analystEdge(s, 'ouro') - analystEdge(s, 'acoes'))} ao mês`); break;
      case 'contador': lines.push(`Impostos +${pct(taxBoost(s))}`); break;
      case 'gerente': lines.push(`Juros de ${rate2(loanRate(s))} ao mês`, `Paga até ${money(3000 * L)} de dívida por mês`); break;
      case 'tesoureiro': lines.push(`Limite de crédito ${money(loanLimit(s))}`, `Juros do vermelho ${rate2(overdraftRate(s))}`); break;
      case 'diplomata': lines.push(`Relações +${(0.15 * pw(s, 'diplomata')).toFixed(1).replace('.', ',')} por mês`, 'Presentes mais eficazes'); break;
      case 'economista': lines.push(`Crises doem ${pct(econSoftener(s))} menos`, `Receita da cidade +${pct(0.015 * pw(s, 'economista'))}`); break;
      case 'auditor': lines.push(`Erros -${Math.round(3 * L)} pontos`, `Recupera ${pct(auditRefund(s))} do prejuízo`); break;
    }
    return {level: L, salary: salaryOf(s, k), efficiency: efficiency(s, k), capacity: capacityOf(s, k), errorChance: errorChance(s, k),
      teamBonus: teamBonus(s, k), lines, nextCost: upgradeCost(s, k), nextSalary: L < MAX_LEVEL ? salaryAt(k, L + 1) : null};
  }

  function hire(s, k) {
    if (s.over || !STAFF[k]) return {ok: false, msg: 'Funcionário inválido.'};
    if (hired(s, k)) return {ok: false, msg: 'Já contratado.'};
    const why = lockReason(s, k);
    if (why) return {ok: false, msg: why + '.'};
    if (s.cash < STAFF[k].salary) return {ok: false, msg: 'Dinheiro insuficiente para o 1º salário.'};
    s.staff[k] = {hired: true, auto: true, level: 1};
    return {ok: true};
  }
  function fire(s, k) {
    if (!hired(s, k)) return {ok: false, msg: 'Não está contratado.'};
    // Quem depende dele também sai
    STAFF_ORDER.forEach(x => { if (STAFF[x].requires === k && hired(s, x)) fire(s, x); });
    s.staff[k] = {hired: false, auto: true, level: 1};
    return {ok: true};
  }
  function setAuto(s, k, on) {
    if (!hired(s, k)) return {ok: false, msg: 'Não está contratado.'};
    s.staff[k].auto = !!on; return {ok: true};
  }

  // ---------- Recomendações por área (usadas pelos funcionários e pela interface) ----------
  const recCity = (s, a) => {
    if (a.empRate < 0.8) return 'loja';
    if (s.pop >= a.housing - 2) return 'casa';
    return null;
  };
  const recInfra = (s, a, strict) => {
    const lim = strict ? 0.5 : 0.7;
    if (s.pop > 70 && a.cov.power < lim) return a.powerDeficit > 200 ? 'eolica' : 'solar';
    if (s.pop > 70 && a.cov.water < lim) return 'agua';
    if (s.pop > 70 && a.cov.sewage < lim) return 'esgoto';
    return null;
  };
  const recGreen = (s, a) => a.pollution >= 14 ? 'filtro' : null;
  const recSocial = (s, a) => {
    const pop = s.pop;
    if (pop > 40 && a.cov.edu < 0.5) return 'escola';
    if (pop > 60 && a.cov.health < 0.5) return 'hospital';
    if (pop > 60 && a.cov.safety < 0.5) return 'policia';
    if (pop > 40 && a.cov.park < 0.4) return 'parque';
    return null;
  };
  // O que a cidade mais precisa agora (qualquer área)
  function recommend(s, a) {
    return recInfra(s, a, true) || recCity(s, a) || recSocial(s, a) || recInfra(s, a, false) || recGreen(s, a);
  }
  // Dica ocasional: só descreve o PROBLEMA (nunca a solução) e só quando está sério.
  function hint(s, a) {
    const pop = s.pop;
    if (s.cash < 0) return {id: 'cash', icon: '🚨', text: 'O caixa da prefeitura está no vermelho.'};
    if (freeTiles(s) === 0) return {id: 'land', icon: '🧱', text: 'Não sobrou nenhum terreno livre na cidade.'};
    if (a.empRate < 0.6) return {id: 'jobs', icon: '😟', text: 'Tem muita gente sem trabalho na cidade.'};
    if (pop >= a.housing && pop > 30) return {id: 'house', icon: '🧳', text: 'Chegou gente nova, mas não há onde morar.'};
    if (pop > 90 && a.cov.power < 0.5) return {id: 'power', icon: '🔌', text: 'Os apagões estão deixando bairros no escuro.'};
    if (pop > 90 && a.cov.water < 0.5) return {id: 'water', icon: '🚱', text: 'A torneira secou em vários bairros.'};
    if (pop > 90 && a.cov.sewage < 0.5) return {id: 'sewage', icon: '🐀', text: 'Tem esgoto correndo a céu aberto.'};
    if (a.pollution >= 18) return {id: 'air', icon: '😷', text: 'O ar da cidade está quase irrespirável.'};
    if (pop > 60 && a.cov.edu < 0.3) return {id: 'edu', icon: '📚', text: 'Os pais reclamam da falta de ensino.'};
    if (pop > 80 && a.cov.health < 0.3) return {id: 'health', icon: '🤒', text: 'Filas enormes para ser atendido.'};
    if (pop > 80 && a.cov.safety < 0.3) return {id: 'safety', icon: '🌙', text: 'Os moradores têm medo de sair à noite.'};
    if (pop > 100 && a.cov.park < 0.2) return {id: 'park', icon: '🧒', text: 'As crianças não têm onde brincar.'};
    return null;
  }
  // Quantas construções faltam para atender bem o público
  function needs(s) {
    const a = analyze(s), c = a.c, out = [];
    if (s.pop >= a.housing - 2) out.push({key: 'casa', n: 1});
    const lack = a.workers - a.jobs;
    if (lack > 0) out.push({key: 'loja', n: Math.ceil(lack / BUILDINGS.loja.jobs)});
    if (s.pop > 40) [['escola', 150], ['hospital', 250], ['policia', 200], ['parque', 100]].forEach(([k, per]) => {
      const n = Math.ceil(s.pop / per) - (c[k] || 0);
      if (n > 0) out.push({key: k, n});
    });
    if (s.pop > 70) {
      if (a.cov.power < 0.9) out.push({key: 'solar', n: Math.ceil(a.powerDeficit / 150)});
      if (a.cov.water < 0.9) out.push({key: 'agua', n: Math.ceil(a.waterDeficit / 300)});
      if (a.cov.sewage < 0.9) out.push({key: 'esgoto', n: Math.ceil(a.sewageDeficit / 350)});
    }
    if (a.pollution >= 10) out.push({key: 'filtro', n: Math.ceil((a.pollution - 8) / 5)});
    return out;
  }
  // Opinião do analista: só fala quando o sinal é forte (senão, devolve null)
  function advice(s, key) {
    const d = ASSETS.find(x => x.key === key), h = s.assets[key].hist;
    if (d.vol <= 0.006 || h.length < 6) return null;
    const n = Math.min(12, h.length), recent = h.slice(-n);
    const base = recent.reduce((t, x) => t + x, 0) / n;
    const r = h[h.length - 1] / (base * Math.pow(1 + d.drift, (n - 1) / 2)) - 1, lim = Math.max(0.04, d.vol * Math.max(0.6, 1.4 - 0.1 * (levelOf(s, 'analista') || 1)));
    if (r < -lim) return {icon: '✅', text: 'Está barato agora. Boa hora de comprar.'};
    if (r > lim) return {icon: '⚠️', text: 'Está caro agora. Melhor esperar ou vender um pouco.'};
    return null;
  }
  const reserve = (s, a) => 1500 + (a.upkeep + s.pop * BASIC_COST + staffCost(s)) * 2;

  function counts(s) {
    const c = {};
    s.tiles.forEach(t => { if (t) c[t] = (c[t] || 0) + 1; });
    return c;
  }

  // ---------- Terreno ----------
  const freeTiles = s => s.tiles.reduce((t, x) => t + (x ? 0 : 1), 0);
  const landCost = s => Math.round(LAND_BASE * Math.pow(LAND_GROWTH, s.landBought || 0) / 100) * 100;
  function buyLand(s) {
    if (s.over) return {ok: false, msg: 'O jogo acabou.'};
    const cost = landCost(s);
    if (s.cash < cost) return {ok: false, msg: 'Dinheiro insuficiente para o terreno.'};
    s.cash -= cost; s.landBought = (s.landBought || 0) + 1;
    for (let i = 0; i < LOT_SIZE; i++) s.tiles.push(null);
    return {ok: true};
  }

  // Números derivados do estado atual (usados pela simulação e pela interface).
  function analyze(s) {
    const c = counts(s);
    const sum = f => { let t = 0; for (const k in c) if (BUILDINGS[k] && BUILDINGS[k][f]) t += BUILDINGS[k][f] * c[k]; return t; };
    const housing = sum('housing');
    const jobs = HALL_JOBS + sum('jobs');
    const workers = s.pop * 0.6;
    const employed = Math.min(workers, jobs);
    const empRate = workers > 0 ? Math.min(1, jobs / workers) : 1;
    const per = Math.max(1, s.pop);
    const grid = 1 + gridBoost(s);
    const powerDemand = s.pop + sum('powerUse'), powerSupply = (BASE_POWER + sum('power')) * grid;
    const waterDemand = s.pop + sum('waterUse'), waterSupply = (BASE_WATER + sum('water')) * grid;
    const sewageDemand = s.pop * 0.8 + sum('sewageUse'), sewageSupply = (BASE_SEWAGE + sum('sewage')) * grid;
    const cov = {
      edu: Math.min(1, sum('edu') / per),
      health: Math.min(1, sum('health') / per),
      safety: Math.min(1, sum('safety') / per),
      park: Math.min(1, sum('park') / per),
      power: Math.min(1, powerSupply / Math.max(1, powerDemand)),
      water: Math.min(1, waterSupply / Math.max(1, waterDemand)),
      sewage: Math.min(1, sewageSupply / Math.max(1, sewageDemand)),
    };
    const pollution = Math.max(0, sum('pollution')) * (1 - smogCut(s));
    const taxEffect = -(s.taxRate - 10) * 1.2;
    const happy = clamp(25 + 12 * cov.edu + 15 * cov.health + 12 * cov.safety + 8 * cov.park + 25 * empRate
      - pollution + taxEffect - 18 * (1 - cov.power) - 15 * (1 - cov.water) - 10 * (1 - cov.sewage) + joyBonus(s), 0, 100);
    let upkeep = HALL_UPKEEP;
    for (const k in c) if (BUILDINGS[k]) upkeep += BUILDINGS[k].upkeep * c[k];
    return {c, housing, jobs, workers, employed, empRate, cov, pollution, taxEffect, happy, upkeep, sum,
      powerDeficit: Math.max(0, powerDemand - powerSupply), waterDeficit: Math.max(0, waterDemand - waterSupply),
      sewageDeficit: Math.max(0, sewageDemand - sewageSupply)};
  }

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function holdingsValue(s) {
    return ASSETS.reduce((t, a) => t + s.assets[a.key].units * s.assets[a.key].price, 0);
  }
  function buildingsValue(s) {
    return s.tiles.reduce((t, k) => t + (BUILDINGS[k] ? BUILDINGS[k].cost * 0.5 : 0), 0);
  }
  const foreignDebt = s => NEIGHBORS.reduce((t, n) => t + (s.world.owed[n.key] || 0), 0);
  const lentValue = s => s.world.lent.reduce((t, l) => t + l.left * l.monthly, 0);
  function netWorth(s) { return s.cash + holdingsValue(s) + buildingsValue(s) + lentValue(s) * 0.8 - s.debt - foreignDebt(s); }

  // Preço de uma obra: o Arquiteto consegue desconto para toda a cidade
  const buildCost = (s, type) => Math.round(BUILDINGS[type].cost * (1 - buildDiscount(s)));
  function build(s, idx, type) {
    const b = BUILDINGS[type];
    if (s.over) return {ok: false, msg: 'O jogo acabou.'};
    if (!b) return {ok: false, msg: 'Construção inválida.'};
    if (idx < 0 || idx >= s.tiles.length) return {ok: false, msg: 'Terreno inválido.'};
    if (s.tiles[idx]) return {ok: false, msg: 'Terreno ocupado.'};
    const price = buildCost(s, type);
    if (s.cash < price) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.cash -= price; s.tiles[idx] = type;
    return {ok: true};
  }
  function demolish(s, idx) {
    const k = s.tiles[idx];
    if (s.over || !BUILDINGS[k]) return {ok: false, msg: 'Nada para demolir.'};
    s.cash += Math.round(BUILDINGS[k].cost * 0.5); s.tiles[idx] = null;
    return {ok: true};
  }

  // Constrói no primeiro terreno livre (a interface não precisa escolher o lugar).
  function buildAny(s, type) {
    const idx = s.tiles.findIndex(t => !t);
    if (idx < 0) return {ok: false, msg: 'Sem terreno livre! Compre mais terreno.'};
    return build(s, idx, type);
  }
  // Demole a construção mais recente desse tipo.
  function demolishOne(s, type) {
    const idx = s.tiles.lastIndexOf(type);
    if (idx < 0) return {ok: false, msg: 'Você não tem essa construção.'};
    return demolish(s, idx);
  }

  function buy(s, key, amount) {
    const a = s.assets[key];
    if (s.over || !a || !(amount > 0)) return {ok: false, msg: 'Valor inválido.'};
    if (s.cash < amount) return {ok: false, msg: 'Dinheiro insuficiente.'};
    const fee = key === 'poupanca' ? 0 : amount * feeRate(s);
    s.cash -= amount; a.units += (amount - fee) / a.price; a.spent += amount;
    return {ok: true};
  }
  function sell(s, key, amount) {
    const a = s.assets[key];
    if (s.over || !a || a.units <= 0) return {ok: false, msg: 'Você não tem esse ativo.'};
    const value = a.units * a.price;
    const gross = amount === 'all' ? value : Math.min(amount, value);
    if (!(gross > 0)) return {ok: false, msg: 'Valor inválido.'};
    const frac = gross / value, fee = key === 'poupanca' ? 0 : gross * feeRate(s);
    a.units -= a.units * frac; a.spent -= a.spent * frac;
    if (a.units < 1e-9) { a.units = 0; a.spent = 0; }
    s.cash += gross - fee;
    return {ok: true};
  }

  function borrow(s, amount) {
    if (s.over || !(amount > 0)) return {ok: false, msg: 'Valor inválido.'};
    if (s.debt + amount > loanLimit(s)) return {ok: false, msg: 'Limite de crédito atingido.'};
    s.debt += amount; s.cash += amount; return {ok: true};
  }
  function repay(s, amount) {
    if (s.over || !(amount > 0) || s.debt <= 0) return {ok: false, msg: 'Nada a pagar.'};
    const pay = Math.min(amount, s.debt, Math.max(0, s.cash));
    if (pay <= 0) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.debt -= pay; s.cash -= pay; return {ok: true};
  }
  function setTax(s, rate) { s.taxRate = clamp(Math.round(rate), 0, 20); }

  function note(s, text) { s.log.unshift(`Mês ${s.month}: ${text}`); if (s.log.length > 80) s.log.pop(); }
  function worldNote(s, text) { s.world.news.unshift(`Mês ${s.month}: ${text}`); if (s.world.news.length > 30) s.world.news.pop(); note(s, text); }

  // ---------- Mundo: relações, comércio, empréstimos e política ----------
  const nb = key => NEIGHBORS.find(n => n.key === key);
  const foreignRate = (s, key) => clamp(0.012 - 0.0001 * (s.world.rel[key] - 50), 0.006, 0.02);
  const foreignLimit = (s, key) => Math.max(0, Math.round(nb(key).wealth * s.world.econ[key] * (s.world.rel[key] / 100) - s.world.owed[key]));
  const treatyCount = s => NEIGHBORS.filter(n => s.world.treaty[n.key]).length;
  // Efeito (pequeno) do mundo sobre o comércio e a indústria
  function worldFactor(s) {
    let f = 1;
    NEIGHBORS.forEach(n => {
      f += ((s.world.rel[n.key] - 50) / 50) * 0.02;
      if (s.world.treaty[n.key]) f += 0.03 * s.world.econ[n.key];
    });
    f += treatyCount(s) * 0.01 * pw(s, 'diplomata');
    if (s.world.mods.commerceLeft > 0) f *= s.world.mods.commerce;
    return f;
  }
  function addRel(s, key, d) { s.world.rel[key] = clamp(s.world.rel[key] + d, 0, 100); }

  function gift(s, key, amount) {
    if (s.over || !nb(key) || !(amount > 0)) return {ok: false, msg: 'Valor inválido.'};
    if (s.world.giftCd[key] > 0) return {ok: false, msg: 'Eles ainda lembram do último presente. Espere um pouco.'};
    if (s.cash < amount) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.cash -= amount;
    addRel(s, key, Math.min(12, amount / 300 * (1 + 0.1 * pw(s, 'diplomata'))));
    s.world.giftCd[key] = 2;
    return {ok: true};
  }
  function signTreaty(s, key) {
    if (s.over || !nb(key)) return {ok: false, msg: 'País inválido.'};
    if (s.world.treaty[key]) return {ok: false, msg: 'Tratado já assinado.'};
    if (s.world.rel[key] < 60) return {ok: false, msg: 'A relação precisa estar acima de 60.'};
    if (s.cash < TREATY_COST) return {ok: false, msg: 'Dinheiro insuficiente para o tratado.'};
    s.cash -= TREATY_COST; s.world.treaty[key] = true; return {ok: true};
  }
  function cancelTreaty(s, key) {
    if (!nb(key) || !s.world.treaty[key]) return {ok: false, msg: 'Não há tratado.'};
    s.world.treaty[key] = false; addRel(s, key, -6); return {ok: true};
  }
  function borrowForeign(s, key, amount) {
    if (s.over || !nb(key) || !(amount > 0)) return {ok: false, msg: 'Valor inválido.'};
    if (s.world.rel[key] < 40) return {ok: false, msg: 'Eles não confiam em você o bastante. Melhore a relação.'};
    const lim = foreignLimit(s, key);
    if (amount > lim) return {ok: false, msg: lim > 0 ? `Eles só emprestam até ${money(lim)}.` : 'Eles não têm mais crédito para você.'};
    s.world.owed[key] += amount; s.cash += amount; return {ok: true};
  }
  function repayForeign(s, key, amount) {
    const owed = s.world.owed[key];
    if (s.over || !nb(key) || !(amount > 0) || owed <= 0) return {ok: false, msg: 'Nada a pagar.'};
    const pay = Math.min(amount, owed, Math.max(0, s.cash));
    if (pay <= 0) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.world.owed[key] -= pay; s.cash -= pay;
    if (s.world.owed[key] < 1) { s.world.owed[key] = 0; addRel(s, key, 2); }
    return {ok: true};
  }
  // Pedido de empréstimo de um vizinho
  function answerRequest(s, accept) {
    const r = s.world.request;
    if (!r) return {ok: false, msg: 'Nenhum pedido.'};
    if (accept) {
      if (s.cash < r.amount) return {ok: false, msg: 'Dinheiro insuficiente para emprestar.'};
      s.cash -= r.amount;
      s.world.lent.push({who: r.who, left: r.months, monthly: Math.round(r.amount * (1 / r.months + r.rate)), amount: r.amount});
      addRel(s, r.who, 3);
    } else addRel(s, r.who, -3);
    s.world.request = null; return {ok: true};
  }
  // Dilemas políticos
  function dilemmaMaker(s) {
    const keys = NEIGHBORS.map(n => n.key), a = keys[Math.floor(mulberry(s) * keys.length)];
    let b = keys[Math.floor(mulberry(s) * keys.length)]; if (b === a) b = keys[(keys.indexOf(a) + 1) % keys.length];
    const A = nb(a), B = nb(b), kind = Math.floor(mulberry(s) * 4);
    if (kind === 0) return {text: `${A.icon} ${A.name} e ${B.icon} ${B.name} brigaram por causa de comércio e pedem que você escolha um lado.`, left: 6, options: [
      {label: `Apoiar ${A.name}`, rel: {[a]: 8, [b]: -6}}, {label: `Apoiar ${B.name}`, rel: {[a]: -6, [b]: 8}}, {label: 'Ficar neutro', rel: {[a]: -2, [b]: -2}}]};
    if (kind === 1) return {text: '🌍 Uma conferência internacional pede metas verdes de todos os países.', left: 6, options: [
      {label: 'Assinar o acordo (R$ 1.500)', cash: -1500, rel: Object.fromEntries(keys.map(k => [k, 4]))}, {label: 'Recusar', rel: Object.fromEntries(keys.map(k => [k, -3]))}]};
    if (kind === 2) return {text: `${A.icon} ${A.name} quer construir uma estrada cortando a sua cidade.`, left: 6, options: [
      {label: 'Aceitar (ganha R$ 1.500 de pedágio)', cash: 1500, rel: {[a]: 6}}, {label: 'Recusar', rel: {[a]: -4}}]};
    return {text: `${A.icon} Famílias refugiadas de ${A.name} pedem abrigo na sua cidade.`, left: 6, options: [
      {label: 'Acolher (R$ 800)', cash: -800, pop: 12, rel: {[a]: 6}}, {label: 'Recusar', rel: {[a]: -5}}]};
  }
  function answerDilemma(s, idx) {
    const d = s.world.dilemma;
    if (!d || !d.options[idx]) return {ok: false, msg: 'Nenhuma decisão pendente.'};
    const o = d.options[idx];
    if (o.cash && o.cash < 0 && s.cash < -o.cash) return {ok: false, msg: 'Dinheiro insuficiente.'};
    if (o.cash) s.cash += o.cash;
    if (o.pop) s.pop += Math.min(o.pop, Math.max(0, analyze(s).housing - s.pop));
    for (const k in (o.rel || {})) addRel(s, k, o.rel[k]);
    s.world.dilemma = null; return {ok: true};
  }

  // Resumo para a interface
  function worldInfo(s, key) {
    const n = nb(key), w = s.world;
    return {key, name: n.name, icon: n.icon, desc: n.desc, rel: w.rel[key], econ: w.econ[key], treaty: w.treaty[key], owed: w.owed[key],
      rate: foreignRate(s, key), limit: foreignLimit(s, key), giftCd: w.giftCd[key]};
  }

  function worldStep(s) {
    const w = s.world;
    NEIGHBORS.forEach(n => {
      const k = n.key;
      w.econ[k] = clamp(w.econ[k] + (1 - w.econ[k]) * 0.05 + 0.02 * gauss(s), 0.6, 1.5);
      // a relação esfria sozinha; o Diplomata ajuda a manter
      w.rel[k] = clamp(w.rel[k] + (50 - w.rel[k]) * 0.02 + 0.15 * pw(s, 'diplomata'), 0, 100);
      if (w.giftCd[k] > 0) w.giftCd[k]--;
      if (w.treaty[k] && w.rel[k] < 40) { w.treaty[k] = false; worldNote(s, `📜 O tratado com ${n.name} acabou porque a relação esfriou.`); }
    });
    // Dívida externa demais preocupa os credores
    if (foreignDebt(s) > Math.max(20000, netWorth(s) * 1.5)) NEIGHBORS.forEach(n => { if (w.owed[n.key] > 0) addRel(s, n.key, -1); });
    if (w.mods.commerceLeft > 0) w.mods.commerceLeft--;
    if (w.mods.upkeepLeft > 0) w.mods.upkeepLeft--;

    // Pagamentos de quem me deve
    w.lent = w.lent.filter(l => {
      const risk = w.econ[l.who] < 0.9 ? 0.015 : 0.003;
      if (mulberry(s) < risk) { addRel(s, l.who, -4); worldNote(s, `💸 ${nb(l.who).name} deu calote! Você perdeu o que faltava receber.`); return false; }
      s.cash += l.monthly; l.left--;
      if (l.left <= 0) { addRel(s, l.who, 4); worldNote(s, `🤝 ${nb(l.who).name} quitou o empréstimo e agradeceu.`); return false; }
      return true;
    });

    // Pedido de empréstimo (depois do primeiro ano)
    if (w.request) { w.request.left--; if (w.request.left <= 0) { addRel(s, w.request.who, -3); worldNote(s, `🙁 ${nb(w.request.who).name} ficou chateado porque você ignorou o pedido.`); w.request = null; } }
    else if (s.month > 12 && s.cash > 3000 && mulberry(s) < 0.06) {
      const cand = NEIGHBORS.filter(n => w.rel[n.key] >= 45), n = cand[Math.floor(mulberry(s) * cand.length)];
      if (n) {
        w.request = {who: n.key, amount: Math.round((2000 + mulberry(s) * 4000) / 500) * 500, months: 12, rate: 0.01, left: 3};
        worldNote(s, `📨 ${n.name} pediu um empréstimo de ${money(w.request.amount)}.`);
      }
    }
    // Dilema político
    if (w.dilemma) { w.dilemma.left--; if (w.dilemma.left <= 0) { const opt = w.dilemma.options[w.dilemma.options.length - 1]; for (const k in (opt.rel || {})) addRel(s, k, Math.min(0, opt.rel[k])); worldNote(s, '🕰️ Você demorou a decidir e perdeu a chance.'); w.dilemma = null; } }
    else if (s.month > 8 && mulberry(s) < 0.04) { w.dilemma = dilemmaMaker(s); worldNote(s, '🗳️ Surgiu uma decisão política para você.'); }

    // Acontecimentos pelo mundo (afetam um pouco)
    if (mulberry(s) < 0.10) {
      const n = NEIGHBORS[Math.floor(mulberry(s) * NEIGHBORS.length)], t = w.treaty[n.key] ? 1.5 : 1, r = mulberry(s);
      if (r < 0.25) { w.econ[n.key] *= 0.82; w.mods.commerce = 1 - 0.04 * t; w.mods.commerceLeft = 4; worldNote(s, `📉 Crise em ${n.name}: o comércio com eles sofre por 4 meses.`); }
      else if (r < 0.45) { w.econ[n.key] *= 1.12; w.mods.commerce = 1 + 0.05 * t; w.mods.commerceLeft = 4; worldNote(s, `🚀 Boom em ${n.name}: o comércio com eles aquece por 4 meses.`); }
      else if (r < 0.60) { w.mods.upkeep = 1.05; w.mods.upkeepLeft = 4; worldNote(s, '🛢️ O petróleo subiu no mundo: manutenção 5% mais cara por 4 meses.'); }
      else if (r < 0.75) { NEIGHBORS.forEach(m => addRel(s, m.key, 3)); worldNote(s, '🕊️ Cúpula da paz: todos os países se aproximaram.'); }
      else if (r < 0.88) { const g = Math.round((500 + mulberry(s) * 1000) * (0.6 + w.rel[n.key] / 100)); s.cash += g; worldNote(s, `🧳 Onda de turistas de ${n.name}: você ganhou ${money(g)}.`); }
      else { addRel(s, n.key, -8); worldNote(s, `⚔️ Tensão com ${n.name}: a relação piorou.`); }
    }
  }

  // ---------- Eventos ----------
  const EVENTS = [
    {w: () => 2, run(s) {
      const d = 1500 + Math.round(mulberry(s) * 2500); s.cash -= d; note(s, `🌊 Enchente! Reparos custaram ${money(d)}.`);
    }},
    {w: () => 3, run(s) {
      const g = 400 + Math.round(mulberry(s) * 800); s.cash += g; note(s, `🎉 Festival na cidade! Turismo rendeu ${money(g)}.`);
    }},
    {w: () => 2, run(s) {
      s.mods.econ = 0.75; s.mods.econLeft = 6;
      mult(s, {acoes: 0.78, cripto: 0.65, fii: 0.9, etf: 0.85, startup: 0.6, ouro: 1.08, dolar: 1.1});
      note(s, '📉 Crise econômica! Bolsa despenca e o comércio sofre por 6 meses (ouro e dólar sobem).');
    }},
    {w: () => 2, run(s) {
      s.mods.econ = 1.25; s.mods.econLeft = 6;
      mult(s, {acoes: 1.15, cripto: 1.3, fii: 1.05, etf: 1.1, startup: 1.35, ouro: 0.98, dolar: 0.97});
      note(s, '🚀 Boom econômico! Bolsa dispara e o comércio aquece por 6 meses.');
    }},
    {w: () => 2, run(s) {
      s.mods.upkeep = 1.3; s.mods.upkeepLeft = 6; mult(s, {ouro: 1.05, tesouro: 1.03});
      note(s, '🔥 Inflação! Manutenção 30% mais cara por 6 meses.');
    }},
    {w: () => 1, run(s) {
      const a = analyze(s), cut = Math.min(0.8, a.sum('fire') / Math.max(1, s.pop) * 1.2);
      const d = Math.round((2000 + mulberry(s) * 3000) * (1 - cut)); s.cash -= d;
      note(s, `🔥 Incêndio! O estrago custou ${money(d)}${cut > 0 ? ' (os bombeiros ajudaram)' : ''}.`);
    }},
    {w: s => analyze(s).cov.sewage < 0.7 ? 1.5 : 0.3, run(s) {
      const a = analyze(s), d = Math.round((1500 + mulberry(s) * 2000) * (1 - 0.5 * a.cov.health)); s.cash -= d;
      note(s, `🤒 Epidemia! O tratamento custou ${money(d)}.`);
    }},
    {w: s => analyze(s).cov.power < 0.8 ? 1.5 : 0, run(s) {
      const d = Math.round(800 + mulberry(s) * 1200); s.cash -= d;
      note(s, `🔌 Apagão! Prejuízo de ${money(d)} para as empresas.`);
    }},
  ];
  // Aplica choques de preço; o Gestor de Risco suaviza as quedas
  function mult(s, m) {
    const soft = shockSoftener(s);
    for (const k in m) if (s.assets[k]) s.assets[k].price *= m[k] < 1 ? 1 - (1 - m[k]) * (1 - soft) : m[k];
  }

  function step(s) {
    if (s.over) return s;
    s.month++;
    const a = analyze(s);
    const econ = s.mods.econLeft > 0 ? (s.mods.econ < 1 ? 1 - (1 - s.mods.econ) * (1 - econSoftener(s)) : s.mods.econ) : 1;
    const upk = (s.mods.upkeepLeft > 0 ? s.mods.upkeep : 1) * (s.world.mods.upkeepLeft > 0 ? s.world.mods.upkeep : 1);
    const power = 0.6 + 0.4 * a.cov.power;   // sem energia, as empresas rendem menos
    const trade = worldFactor(s) * 1;

    const taxes = a.employed * 8 * (s.taxRate / 10) * (1 + taxBoost(s));
    let slots = 0;
    for (const k in a.c) { const b = BUILDINGS[k]; if (b && b.housing) slots += b.housing * (b.rent || 5) * a.c[k]; }
    const rent = a.housing > 0 ? Math.min(1, s.pop / a.housing) * slots : 0;
    const consumption = a.employed * 12;
    const commerce = Math.min(consumption, a.sum('sales')) * 0.22 * econ * power * trade;
    const workerFactor = Math.min(1, a.workers / Math.max(1, a.jobs));
    let industry = 0;
    for (const k in a.c) {
      const b = BUILDINGS[k]; if (!b || !b.profit) continue;
      let p = b.profit * a.c[k];
      if (k === 'tecnologia') p *= 0.4 + 0.6 * a.cov.edu;
      industry += b.needsWorkers ? p * workerFactor * econ * power * trade : p;
    }
    const boom = 1 + 0.015 * pw(s, 'economista');
    const income = (taxes + rent + commerce + industry) * boom;
    let kindUp = {'Serviço': 0, 'Público': 0, 'Ambiente': 0};
    for (const k in a.c) { const b = BUILDINGS[k]; if (b && kindUp[b.kind] != null) kindUp[b.kind] += b.upkeep * a.c[k]; }
    const kindCut = kindUp['Serviço'] * Math.min(0.5, 0.06 * pw(s, 'infra')) + kindUp['Público'] * Math.min(0.5, 0.05 * pw(s, 'social'))
      + kindUp['Ambiente'] * Math.min(0.5, 0.06 * pw(s, 'ambiental'));
    const maint = Math.max(0, (a.upkeep - kindCut) * upk * (1 - upkeepCut(s)));
    const salaries = staffCost(s);
    const diplomacy = treatyCount(s) * TREATY_UPKEEP;
    let foreignInterest = 0;
    NEIGHBORS.forEach(n => { foreignInterest += s.world.owed[n.key] * foreignRate(s, n.key); });
    const interest = s.debt * loanRate(s) + foreignInterest;
    const overdraft = s.cash < 0 ? -s.cash * overdraftRate(s) : 0;
    const basic = s.pop * BASIC_COST * (1 - upkeepCut(s));
    const expenses = maint + basic + salaries + diplomacy + interest + overdraft;
    s.cash += income - expenses;

    // População
    s.happy = a.happy;
    if (a.happy >= 45 && s.pop < a.housing) {
      s.pop = Math.min(a.housing, s.pop + Math.max(1, s.pop * 0.06 * (a.happy - 35) / 30));
    } else if (a.happy < 35) {
      s.pop = Math.max(0, s.pop - Math.max(1, s.pop * 0.05 * (35 - a.happy) / 35));
    }
    if (s.pop > a.housing) s.pop = Math.max(a.housing, s.pop - Math.max(1, (s.pop - a.housing) * 0.3));

    // Mercado
    ASSETS.forEach(d => {
      const x = s.assets[d.key];
      x.price *= Math.max(0.2, 1 + d.drift + analystEdge(s, d.key) + d.vol * gauss(s));
      x.hist.push(x.price); if (x.hist.length > 36) x.hist.shift();
    });
    if (s.mods.econLeft > 0) s.mods.econLeft--;
    if (s.mods.upkeepLeft > 0) s.mods.upkeepLeft--;

    // Eventos aleatórios da cidade e do mundo
    if (mulberry(s) < 0.17) {
      const ws = EVENTS.map(e => e.w(s));
      let r = mulberry(s) * ws.reduce((t, w) => t + w, 0);
      for (let i = 0; i < EVENTS.length; i++) { if ((r -= ws[i]) < 0) { EVENTS[i].run(s); break; } }
    }
    worldStep(s);

    staffActs(s);

    // Banco cobre o rombo vendendo investimentos
    if (s.cash < 0) {
      for (const d of ASSETS.slice().reverse()) {
        const x = s.assets[d.key];
        if (s.cash >= 0) break;
        if (x.units > 0) {
          const need = -s.cash;
          sell(s, d.key, Math.min(need * 1.01, x.units * x.price));
          note(s, `🏦 Caixa negativo: o banco vendeu ${d.name} para cobrir o rombo.`);
        }
      }
    }

    s.report = {taxes, rent, commerce, industry, income, maint, basic, salaries, diplomacy, interest, overdraft, expenses, net: income - expenses};
    s.netHist.push(netWorth(s)); if (s.netHist.length > 48) s.netHist.shift();

    GOALS.forEach(g => { if (!s.goals[g.id] && g.test(s)) { s.goals[g.id] = s.month; note(s, `🏆 Meta cumprida: ${g.text}!`); } });

    STAFF_ORDER.forEach(k => {
      if (!hired(s, k) && !s.staffSeen[k] && isUnlocked(s, k)) { s.staffSeen[k] = true; note(s, `👔 Agora você pode contratar: ${STAFF[k].name}!`); }
    });

    s.lowHappy = s.pop > 0 && s.happy < 15 ? s.lowHappy + 1 : 0;
    if (s.cash < -OVERDRAFT_LIMIT) s.over = {title: 'Falência!', text: 'A prefeitura quebrou: dívidas demais e nenhum caixa.'};
    else if (s.lowHappy >= 6) s.over = {title: 'Revolta popular!', text: 'Os moradores estão infelizes demais e derrubaram você.'};
    if (s.over) s.over.score = Math.round(netWorth(s));
    return s;
  }

  // ---------- Funcionários: decisões automáticas (e erros) ----------
  // Sorteio próprio da equipe (não mexe nos eventos do jogo)
  function staffRand(s) {
    if (s.sseed == null) s.sseed = (s.seed * 7 + 13) | 0;
    s.sseed = (s.sseed + 0x6D2B79F5) | 0;
    let t = s.sseed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const blunder = (s, k) => staffRand(s) < errorChance(s, k);
  // Dinheiro gasto para corrigir um erro (o Auditor recupera uma parte)
  function lose(s, amount) {
    amount = Math.round(amount);
    const net = Math.round(amount * (1 - auditRefund(s)));
    s.cash -= net; s.staffStats.errors++; s.staffStats.cost += net;
    return net;
  }
  // Vende renda fixa (e afins) para juntar dinheiro, sem mexer nos investimentos de risco
  function liquidateSafe(s, need) {
    let got = 0;
    for (const k of SAFE_ASSETS.slice().reverse()) {
      if (got >= need) break;
      const x = s.assets[k], v = x.units * x.price;
      if (v <= 0) continue;
      const before = s.cash; sell(s, k, Math.min(need - got, v)); got += s.cash - before;
    }
    return got;
  }

  // Cada construtor cuida de uma área; compram terreno se faltar (só o Arquiteto)
  function builderActs(s, who, recFn, maxN, capCost) {
    if (!active(s, who) || !(s.month % 2 === 0 || efficiency(s, who) >= 0.5)) return;
    for (let i = 0; i < maxN; i++) {
      const a = analyze(s), k = recFn(s, a);
      if (!k) break;
      const cost = BUILDINGS[k].cost, net = buildCost(s, k);
      if (cost > capCost) break;
      if (freeTiles(s) === 0) {
        if (who !== 'arquiteto') break;
        const lc = landCost(s);
        if (s.cash - lc < reserve(s, a) + net) {
          const got = liquidateSafe(s, lc + net + reserve(s, a) - s.cash);
          if (got > 0) note(s, `${STAFF[who].icon} ${STAFF[who].name} usou ${money(got)} da renda fixa para comprar terreno.`);
          if (s.cash - lc < reserve(s, a) + net) break;
        }
        buyLand(s); note(s, `${STAFF[who].icon} ${STAFF[who].name} comprou um lote de terreno por ${money(lc)}.`);
        if (blunder(s, who)) note(s, `😅 ${STAFF[who].name} pagou caro demais no terreno e gastou ${money(lose(s, lc * 0.15))} a mais.`);
      }
      const need = net + reserve(s, a) - s.cash;
      if (need > 0) {
        const got = liquidateSafe(s, need);
        if (got > 0) note(s, `${STAFF[who].icon} ${STAFF[who].name} usou ${money(got)} da renda fixa para pagar a obra.`);
        if (s.cash - net < reserve(s, a)) break;
      }
      if (blunder(s, who) && staffRand(s) < 0.5) {
        note(s, `😅 ${STAFF[who].name} construiu no lugar errado e gastou ${money(lose(s, cost * 0.25 + 150))} para desfazer.`);
        break;
      }
      if (!buildAny(s, k).ok) break;
      note(s, `${STAFF[who].icon} ${STAFF[who].name} construiu: ${BUILDINGS[k].name}.`);
    }
  }

  function staffActs(s) {
    if (!s.staffStats) s.staffStats = {errors: 0, cost: 0};

    // Finanças
    if (active(s, 'gerente')) {
      if (s.cash < 0 && s.debt < loanLimit(s)) {
        const amt = Math.min(loanLimit(s) - s.debt, Math.ceil((-s.cash + 1000) / 1000) * 1000);
        s.debt += amt; s.cash += amt; note(s, `🏦 Gerente pegou ${money(amt)} emprestado para evitar o vermelho.`);
        if (blunder(s, 'gerente')) note(s, `😅 Gerente errou os papéis do empréstimo e pagou ${money(lose(s, amt * 0.03 + 100))} de taxas a mais.`);
      } else if (s.debt > 0) {
        const spare = s.cash - reserve(s, analyze(s)) - 4000;
        if (spare >= 500) {
          const pay = Math.floor(Math.min(s.debt, 3000 * lv(s, 'gerente'), spare));
          s.debt -= pay; s.cash -= pay; note(s, `🏦 Gerente pagou ${money(pay)} da dívida.`);
          if (blunder(s, 'gerente')) note(s, `😅 Gerente se confundiu na quitação e pagou ${money(lose(s, pay * 0.02 + 100))} de multa.`);
        }
      }
    }
    if (active(s, 'diplomata')) {
      NEIGHBORS.forEach(n => {
        if (s.world.rel[n.key] < 45 && s.world.giftCd[n.key] === 0 && s.cash > reserve(s, analyze(s)) + 600) {
          if (blunder(s, 'diplomata')) { addRel(s, n.key, -3); note(s, `😅 Diplomata deu um presente que ofendeu ${n.name} e gastou ${money(lose(s, 600))}.`); s.world.giftCd[n.key] = 2; }
          else { gift(s, n.key, 600); note(s, `🤝 Diplomata mandou um presente para ${n.name}.`); }
        }
      });
    }

    // Investimentos
    if (active(s, 'risco')) {
      RISKY_ASSETS.forEach(k => {
        const x = s.assets[k], v = x.units * x.price;
        if (x.units > 0 && x.spent > 0 && v < x.spent * (1 - stopLoss(s))) {
          sell(s, k, 'all'); note(s, `🛡️ Gestor de Risco vendeu ${ASSETS.find(d => d.key === k).name} para limitar o prejuízo.`);
        }
      });
      // Susto à toa: vende uma posição saudável e paga para desfazer
      if (staffRand(s) < errorChance(s, 'risco') * 0.25) {
        const k = RISKY_ASSETS.slice().sort((p, q) => s.assets[q].units * s.assets[q].price - s.assets[p].units * s.assets[p].price)[0];
        const v = s.assets[k].units * s.assets[k].price;
        if (v >= 500) {
          sell(s, k, 'all');
          note(s, `😅 Gestor de Risco se assustou à toa e vendeu ${ASSETS.find(d => d.key === k).name}; perdeu ${money(lose(s, v * 0.02 + 100))} em taxas.`);
        }
      }
    }
    if (active(s, 'corretor')) {
      // Guarda parte da sobra: metade vai para a renda fixa e o resto fica para a cidade
      const a = analyze(s), builders = ['arquiteto', 'infra', 'ambiental', 'social'].some(x => active(s, x)), want = builders ? recommend(s, a) : null;
      const budget = want ? BUILDINGS[want].cost : 0;
      const spare = s.cash - reserve(s, a) - 3000 - budget;
      if (spare >= 2000) {
        const amt = Math.floor(Math.min(1500 * lv(s, 'corretor'), spare * 0.5));
        buy(s, 'cdb', amt); note(s, `💼 Corretor aplicou ${money(amt)} em Renda Fixa.`);
        if (blunder(s, 'corretor')) note(s, `😅 Corretor errou a conta na aplicação e gastou ${money(lose(s, amt * 0.015 + 100))} para corrigir.`);
      }
    }

    // Construção: cada um cuida da sua área
    builderActs(s, 'arquiteto', recCity, maxBuilds(s), 3500 + 1000 * lv(s, 'arquiteto'));
    builderActs(s, 'infra', (st, a) => recInfra(st, a, false), 1 + (lv(s, 'infra') >= 5 ? 1 : 0), 3500 + 1000 * lv(s, 'infra'));
    builderActs(s, 'ambiental', (st, a) => recGreen(st, a), 1, 3000 + 600 * lv(s, 'ambiental'));
    builderActs(s, 'social', recSocial, 1 + (lv(s, 'social') >= 5 ? 1 : 0), 4000 + 1000 * lv(s, 'social'));
  }

  function money(v) {
    const sign = v < 0 ? '-' : '';
    return `${sign}R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;
  }

  function serialize(s) { return JSON.stringify(s); }
  const OLD_STAFF = {planejador: 'arquiteto'};
  function load(text) {
    try {
      const s = JSON.parse(text);
      if (!s || s.v !== 1 || !Array.isArray(s.tiles) || s.tiles.length < OLD_TILES) return null;
      while (s.tiles.length < COLS * START_ROWS) s.tiles.push(null);
      if (s.landBought == null) s.landBought = 0;
      if (!s.staff) s.staff = defaultStaff();
      for (const old in OLD_STAFF) if (s.staff[old]) { if (!s.staff[OLD_STAFF[old]] || !s.staff[OLD_STAFF[old]].hired) s.staff[OLD_STAFF[old]] = s.staff[old]; delete s.staff[old]; }
      if (!s.staffSeen) s.staffSeen = {};
      if (!s.staffStats) s.staffStats = {errors: 0, cost: 0};
      STAFF_ORDER.forEach(k => { if (!s.staff[k]) s.staff[k] = {hired: false, auto: true, level: 1}; if (!s.staff[k].level) s.staff[k].level = 1; });
      ASSETS.forEach(a => { if (!s.assets[a.key]) s.assets[a.key] = newAsset(); });
      if (!s.world) s.world = newWorld();
      return s;
    } catch (e) { return null; }
  }

  return {COLS, ROWS: START_ROWS, HALL, BUILDINGS, ASSETS, SAFE_ASSETS, RISKY_ASSETS, GOALS, STAFF, STAFF_ORDER, SALARY_ORDER, AREAS, MAX_LEVEL, NEIGHBORS,
    hired, active, levelOf, isUnlocked, lockReason, staffCost, salaryOf, efficiency, errorChance, staffInfo, upgrade, upgradeCost, teamBonus,
    loanRate, loanLimit, hire, fire, setAuto, recommend, recCity, recInfra, recGreen, recSocial, needs, advice, hint,
    freeTiles, landCost, buyLand, buildCost, LOT_SIZE, TREATY_COST, TREATY_UPKEEP, LOAN_LIMIT, OVERDRAFT_LIMIT,
    worldInfo, worldFactor, gift, signTreaty, cancelTreaty, borrowForeign, repayForeign, answerRequest, answerDilemma, foreignDebt, lentValue, foreignRate, foreignLimit,
    newGame, analyze, build, buildAny, demolish, demolishOne, counts, buy, sell, borrow, repay, setTax, step, netWorth, holdingsValue, money, serialize, load};
});
