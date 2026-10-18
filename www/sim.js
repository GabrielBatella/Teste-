// Motor da simulação: sem DOM, para poder ser testado em Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 6, ROWS = 10, HALL = 3 * COLS + 2, OLD_TILES = 42;
  const BASIC_COST = 1.5;
  const OVERDRAFT_LIMIT = 15000, LOAN_LIMIT = 30000, LOAN_RATE = 0.015, OVERDRAFT_RATE = 0.03, FEE = 0.003;
  // Redes básicas que a cidade já recebe de graça (só começam a faltar quando ela cresce)
  const BASE_POWER = 150, BASE_WATER = 100, BASE_SEWAGE = 80;
  const ERROR_BASE = 0.30;   // chance de erro de um funcionário em cada decisão (1,5 de 5)

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

  const STAFF = {
    planejador: {name: 'Planejador Urbano', icon: '🏗️', salary: 120, need: 'Libera com 50 habitantes', test: s => s.pop >= 50,
      desc: 'Mostra o que falta na cidade, constrói sozinho o que está faltando quando sobra dinheiro, reduz custos de manutenção e de serviços e consegue desconto nas obras.'},
    analista: {name: 'Analista de Investimentos', icon: '📊', salary: 100, need: 'Libera com R$ 15 mil de patrimônio', test: s => netWorth(s) >= 15000,
      desc: 'Avisa quando um investimento está caro ou barato, aplica parte das sobras em renda fixa, vende se algo despencar, zera a taxa de corretagem e melhora o retorno.'},
    gerente: {name: 'Gerente Financeiro', icon: '🏦', salary: 70, need: 'Libera com 80 habitantes', test: s => s.pop >= 80,
      desc: 'Paga a dívida quando sobra dinheiro, pede um empréstimo pequeno para você não ficar no vermelho, consegue juros menores, mais crédito e melhora a arrecadação de impostos.'},
  };
  const SALARY_ORDER = ['planejador', 'analista', 'gerente'];
  // Níveis de 1 a 5: salário sobe, treinamento custa uma vez, e cada nível aguenta uma cidade maior.
  const MAX_LEVEL = 5;
  const SALARY_MULT = [1, 1.3, 1.7, 2.2, 3];
  const TRAIN_COST = [1500, 3000, 5000, 8000];      // para ir do nível 1→2, 2→3...
  const CAPACITY = [80, 150, 260, 450, 800];         // habitantes que dá conta de atender

  const GOALS = [
    {id: 'pop100',  text: 'Chegar a 100 habitantes',  test: s => s.pop >= 100},
    {id: 'pop500',  text: 'Chegar a 500 habitantes',  test: s => s.pop >= 500},
    {id: 'pop1500', text: 'Chegar a 1.500 habitantes', test: s => s.pop >= 1500},
    {id: 'nw50',    text: 'Patrimônio de R$ 50 mil',  test: s => netWorth(s) >= 50000},
    {id: 'nw200',   text: 'Patrimônio de R$ 200 mil', test: s => netWorth(s) >= 200000},
    {id: 'nw1m',    text: 'Patrimônio de R$ 1 milhão', test: s => netWorth(s) >= 1000000},
    {id: 'diver',   text: 'Investir em 3 ativos diferentes', test: s => ASSETS.filter(a => s.assets[a.key].units > 0).length >= 3},
    {id: 'team',    text: 'Contratar 2 funcionários', test: s => SALARY_ORDER.filter(k => hired(s, k)).length >= 2},
    {id: 'train',   text: 'Treinar um funcionário até o nível 3', test: s => SALARY_ORDER.some(k => levelOf(s, k) >= 3)},
    {id: 'clean',   text: 'Ar limpo com 300 habitantes', test: s => s.pop >= 300 && analyze(s).pollution === 0},
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

  function newGame(seed) {
    const tiles = Array(COLS * ROWS).fill(null);
    tiles[HALL] = 'prefeitura';
    tiles[HALL - 1] = 'casa'; tiles[HALL + 1] = 'casa'; tiles[HALL + COLS] = 'loja';
    const assets = {};
    ASSETS.forEach(a => { assets[a.key] = newAsset(); });
    return {
      v: 1, seed: seed == null ? (Date.now() | 0) : seed, month: 0, cash: 10000, debt: 0, taxRate: 10,
      tiles, pop: 20, happy: 55, assets, mods: {econ: 1, econLeft: 0, upkeep: 1, upkeepLeft: 0},
      log: ['Bem-vindo, prefeito! Cuide da cidade e faça o dinheiro render.'],
      report: null, over: null, staff: defaultStaff(), staffSeen: {}, staffStats: {errors: 0, cost: 0},
      lowHappy: 0, goals: {}, netHist: [10000],
    };
  }

  function defaultStaff() {
    const o = {};
    SALARY_ORDER.forEach(k => { o[k] = {hired: false, auto: true, level: 1}; });
    return o;
  }
  const hired = (s, k) => !!(s.staff && s.staff[k] && s.staff[k].hired);
  const active = (s, k) => hired(s, k) && s.staff[k].auto;
  const levelOf = (s, k) => hired(s, k) ? (s.staff[k].level || 1) : 0;
  const isUnlocked = (s, k) => STAFF[k].test(s);
  const salaryAt = (k, lvl) => Math.round(STAFF[k].salary * SALARY_MULT[lvl - 1] / 10) * 10;
  const salaryOf = (s, k) => hired(s, k) ? salaryAt(k, levelOf(s, k)) : 0;
  function staffCost(s) { return SALARY_ORDER.reduce((t, k) => t + salaryOf(s, k), 0); }
  // Eficiência: 1 = dá conta da cidade; menos que isso = sobrecarregado
  const capacityOf = (s, k) => CAPACITY[levelOf(s, k) - 1] || 0;
  const efficiency = (s, k) => hired(s, k) ? clamp(capacityOf(s, k) / Math.max(1, s.pop), 0.25, 1) : 0;
  // Chance de errar: 30% normalmente, mais se estiver sobrecarregado
  const errorChance = (s, k) => clamp(ERROR_BASE + 0.25 * (1 - efficiency(s, k)), 0, 0.6);
  const loanLimit = s => LOAN_LIMIT + (hired(s, 'gerente') ? 8000 * (levelOf(s, 'gerente') - 1) : 0);
  const loanRate = s => LOAN_RATE - (hired(s, 'gerente') ? (0.004 + 0.0012 * (levelOf(s, 'gerente') - 1)) * efficiency(s, 'gerente') : 0);
  const upkeepCut = s => hired(s, 'planejador') ? (0.30 + 0.06 * (levelOf(s, 'planejador') - 1)) * efficiency(s, 'planejador') : 0;
  const taxBoost = s => hired(s, 'gerente') ? 0.045 * levelOf(s, 'gerente') * efficiency(s, 'gerente') : 0;
  const buildDiscount = s => 0.10 + 0.03 * (levelOf(s, 'planejador') - 1);
  const analystEdge = s => hired(s, 'analista') ? (0.003 + 0.001 * (levelOf(s, 'analista') - 1)) * efficiency(s, 'analista') : 0;
  const stopLoss = s => [0.25, 0.22, 0.20, 0.17, 0.15][levelOf(s, 'analista') - 1] || 0.25;

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
  // Resumo para a interface
  function staffInfo(s, k) {
    const L = levelOf(s, k), e = efficiency(s, k), lines = [];
    if (k === 'planejador') {
      lines.push(`Manutenção e serviços -${Math.round(upkeepCut(s) * 100)}%`, `Obras com ${Math.round(buildDiscount(s) * 100)}% de desconto`,
        `Até ${[1, 1, 2, 2, 3][L - 1]} obra(s) por mês`);
    } else if (k === 'analista') {
      lines.push(`Retorno +${(analystEdge(s) * 100).toFixed(2).replace('.', ',')}% ao mês`, `Vende se cair ${Math.round(stopLoss(s) * 100)}%`,
        `Aplica até ${money(3000 * L)} por mês`);
    } else {
      lines.push(`Arrecadação de impostos +${Math.round(taxBoost(s) * 100)}%`, `Juros de ${(loanRate(s) * 100).toFixed(2).replace('.', ',')}% ao mês`, `Limite ${money(loanLimit(s))}`,
        `Paga até ${money(3000 * L)} de dívida por mês`);
    }
    return {level: L, salary: salaryOf(s, k), efficiency: e, capacity: capacityOf(s, k), errorChance: errorChance(s, k), lines,
      nextCost: upgradeCost(s, k), nextSalary: L < MAX_LEVEL ? salaryAt(k, L + 1) : null};
  }

  function hire(s, k) {
    if (s.over || !STAFF[k]) return {ok: false, msg: 'Funcionário inválido.'};
    if (hired(s, k)) return {ok: false, msg: 'Já contratado.'};
    if (!isUnlocked(s, k)) return {ok: false, msg: STAFF[k].need + '.'};
    if (s.cash < STAFF[k].salary) return {ok: false, msg: 'Dinheiro insuficiente para o 1º salário.'};
    s.staff[k] = {hired: true, auto: true, level: 1};
    return {ok: true};
  }
  function fire(s, k) {
    if (!hired(s, k)) return {ok: false, msg: 'Não está contratado.'};
    s.staff[k] = {hired: false, auto: true, level: 1};
    return {ok: true};
  }
  function setAuto(s, k, on) {
    if (!hired(s, k)) return {ok: false, msg: 'Não está contratado.'};
    s.staff[k].auto = !!on; return {ok: true};
  }

  // O que a cidade mais precisa agora (usado pelo Planejador)
  function recommend(s, a) {
    const pop = s.pop;
    if (pop > 70 && a.cov.power < 0.5) return a.powerDeficit > 200 ? 'eolica' : 'solar';
    if (pop > 70 && a.cov.water < 0.5) return 'agua';
    if (pop > 70 && a.cov.sewage < 0.5) return 'esgoto';
    if (a.empRate < 0.8) return 'loja';
    if (pop >= a.housing - 2) return 'casa';
    if (pop > 40 && a.cov.edu < 0.5) return 'escola';
    if (pop > 60 && a.cov.health < 0.5) return 'hospital';
    if (pop > 60 && a.cov.safety < 0.5) return 'policia';
    if (pop > 40 && a.cov.park < 0.4) return 'parque';
    if (pop > 70 && a.cov.power < 0.7) return a.powerDeficit > 200 ? 'eolica' : 'solar';
    if (pop > 70 && a.cov.water < 0.7) return 'agua';
    if (pop > 70 && a.cov.sewage < 0.7) return 'esgoto';
    if (a.pollution >= 14) return 'filtro';
    return null;
  }
  // Dica ocasional: só descreve o PROBLEMA (nunca a solução) e só quando está sério.
  function hint(s, a) {
    const pop = s.pop;
    if (s.cash < 0) return {id: 'cash', icon: '🚨', text: 'O caixa da prefeitura está no vermelho.'};
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
    const r = h[h.length - 1] / (base * Math.pow(1 + d.drift, (n - 1) / 2)) - 1, lim = Math.max(0.04, d.vol * (1.4 - 0.1 * (levelOf(s, 'analista') || 1)));
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
    const powerDemand = s.pop + sum('powerUse'), powerSupply = BASE_POWER + sum('power');
    const waterDemand = s.pop + sum('waterUse'), waterSupply = BASE_WATER + sum('water');
    const sewageDemand = s.pop * 0.8 + sum('sewageUse'), sewageSupply = BASE_SEWAGE + sum('sewage');
    const cov = {
      edu: Math.min(1, sum('edu') / per),
      health: Math.min(1, sum('health') / per),
      safety: Math.min(1, sum('safety') / per),
      park: Math.min(1, sum('park') / per),
      power: Math.min(1, powerSupply / Math.max(1, powerDemand)),
      water: Math.min(1, waterSupply / Math.max(1, waterDemand)),
      sewage: Math.min(1, sewageSupply / Math.max(1, sewageDemand)),
    };
    const pollution = Math.max(0, sum('pollution'));
    const taxEffect = -(s.taxRate - 10) * 1.2;
    const happy = clamp(25 + 12 * cov.edu + 15 * cov.health + 12 * cov.safety + 8 * cov.park + 25 * empRate
      - pollution + taxEffect - 18 * (1 - cov.power) - 15 * (1 - cov.water) - 10 * (1 - cov.sewage), 0, 100);
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
  function netWorth(s) { return s.cash + holdingsValue(s) + buildingsValue(s) - s.debt; }

  function build(s, idx, type) {
    const b = BUILDINGS[type];
    if (s.over) return {ok: false, msg: 'O jogo acabou.'};
    if (!b) return {ok: false, msg: 'Construção inválida.'};
    if (idx < 0 || idx >= s.tiles.length) return {ok: false, msg: 'Terreno inválido.'};
    if (s.tiles[idx]) return {ok: false, msg: 'Terreno ocupado.'};
    if (s.cash < b.cost) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.cash -= b.cost; s.tiles[idx] = type;
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
    if (idx < 0) return {ok: false, msg: 'Sem terreno livre!'};
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
    const fee = key === 'poupanca' || hired(s, 'analista') ? 0 : amount * FEE;
    s.cash -= amount; a.units += (amount - fee) / a.price; a.spent += amount;
    return {ok: true};
  }
  function sell(s, key, amount) {
    const a = s.assets[key];
    if (s.over || !a || a.units <= 0) return {ok: false, msg: 'Você não tem esse ativo.'};
    const value = a.units * a.price;
    const gross = amount === 'all' ? value : Math.min(amount, value);
    if (!(gross > 0)) return {ok: false, msg: 'Valor inválido.'};
    const frac = gross / value, fee = key === 'poupanca' || hired(s, 'analista') ? 0 : gross * FEE;
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

  function note(s, text) { s.log.unshift(`Mês ${s.month}: ${text}`); if (s.log.length > 60) s.log.pop(); }

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
  function mult(s, m) { for (const k in m) if (s.assets[k]) s.assets[k].price *= m[k]; }

  function step(s) {
    if (s.over) return s;
    s.month++;
    const a = analyze(s);
    const econ = s.mods.econLeft > 0 ? s.mods.econ : 1;
    const upk = s.mods.upkeepLeft > 0 ? s.mods.upkeep : 1;
    const power = 0.6 + 0.4 * a.cov.power;   // sem energia, as empresas rendem menos

    const taxes = a.employed * 8 * (s.taxRate / 10) * (1 + taxBoost(s));
    let slots = 0;
    for (const k in a.c) { const b = BUILDINGS[k]; if (b && b.housing) slots += b.housing * (b.rent || 5) * a.c[k]; }
    const rent = a.housing > 0 ? Math.min(1, s.pop / a.housing) * slots : 0;
    const consumption = a.employed * 12;
    const commerce = Math.min(consumption, a.sum('sales')) * 0.22 * econ * power;
    const workerFactor = Math.min(1, a.workers / Math.max(1, a.jobs));
    let industry = 0;
    for (const k in a.c) {
      const b = BUILDINGS[k]; if (!b || !b.profit) continue;
      let p = b.profit * a.c[k];
      if (k === 'tecnologia') p *= 0.4 + 0.6 * a.cov.edu;
      industry += b.needsWorkers ? p * workerFactor * econ * power : p;
    }
    const income = taxes + rent + commerce + industry;
    const maint = a.upkeep * upk * (1 - upkeepCut(s));
    const salaries = staffCost(s);
    const interest = s.debt * loanRate(s);
    const overdraft = s.cash < 0 ? -s.cash * OVERDRAFT_RATE : 0;
    const basic = s.pop * BASIC_COST * (1 - upkeepCut(s));
    const expenses = maint + basic + salaries + interest + overdraft;
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
      x.price *= Math.max(0.2, 1 + d.drift + (d.key !== 'poupanca' ? analystEdge(s) : 0) + d.vol * gauss(s));
      x.hist.push(x.price); if (x.hist.length > 36) x.hist.shift();
    });
    if (s.mods.econLeft > 0) s.mods.econLeft--;
    if (s.mods.upkeepLeft > 0) s.mods.upkeepLeft--;

    // Eventos aleatórios
    if (mulberry(s) < 0.17) {
      const ws = EVENTS.map(e => e.w(s));
      let r = mulberry(s) * ws.reduce((t, w) => t + w, 0);
      for (let i = 0; i < EVENTS.length; i++) { if ((r -= ws[i]) < 0) { EVENTS[i].run(s); break; } }
    }

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

    s.report = {taxes, rent, commerce, industry, income, maint, basic, salaries, interest, overdraft, expenses, net: income - expenses};
    s.netHist.push(netWorth(s)); if (s.netHist.length > 48) s.netHist.shift();

    GOALS.forEach(g => { if (!s.goals[g.id] && g.test(s)) { s.goals[g.id] = s.month; note(s, `🏆 Meta cumprida: ${g.text}!`); } });

    SALARY_ORDER.forEach(k => {
      if (!hired(s, k) && !s.staffSeen[k] && isUnlocked(s, k)) { s.staffSeen[k] = true; note(s, `👔 Agora você pode contratar: ${STAFF[k].name}!`); }
    });

    s.lowHappy = s.pop > 0 && s.happy < 15 ? s.lowHappy + 1 : 0;
    if (s.cash < -OVERDRAFT_LIMIT) s.over = {title: 'Falência!', text: 'A prefeitura quebrou: dívidas demais e nenhum caixa.'};
    else if (s.lowHappy >= 6) s.over = {title: 'Revolta popular!', text: 'Os moradores estão infelizes demais e derrubaram você.'};
    if (s.over) s.over.score = Math.round(netWorth(s));
    return s;
  }

  // ---------- Funcionários: decisões automáticas (e erros) ----------
  const blunder = (s, k) => mulberry(s) < errorChance(s, k);
  // Dinheiro gasto para corrigir um erro
  function lose(s, amount) {
    amount = Math.round(amount); s.cash -= amount;
    s.staffStats.errors++; s.staffStats.cost += amount;
    return amount;
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

  function staffActs(s) {
    if (!s.staffStats) s.staffStats = {errors: 0, cost: 0};

    if (active(s, 'gerente')) {
      if (s.cash < 0 && s.debt < loanLimit(s)) {
        const amt = Math.min(loanLimit(s) - s.debt, Math.ceil((-s.cash + 1000) / 1000) * 1000);
        s.debt += amt; s.cash += amt; note(s, `🏦 Gerente pegou ${money(amt)} emprestado para evitar o vermelho.`);
        if (blunder(s, 'gerente')) note(s, `😅 Gerente errou os papéis do empréstimo e pagou ${money(lose(s, amt * 0.03 + 100))} de taxas a mais.`);
      } else if (s.debt > 0) {
        const spare = s.cash - reserve(s, analyze(s)) - 4000;
        if (spare >= 500) {
          const pay = Math.floor(Math.min(s.debt, 3000 * levelOf(s, 'gerente'), spare));
          s.debt -= pay; s.cash -= pay; note(s, `🏦 Gerente pagou ${money(pay)} da dívida.`);
          if (blunder(s, 'gerente')) note(s, `😅 Gerente se confundiu na quitação e pagou ${money(lose(s, pay * 0.02 + 100))} de multa.`);
        }
      }
    }

    if (active(s, 'analista')) {
      RISKY_ASSETS.forEach(k => {
        const x = s.assets[k], v = x.units * x.price;
        if (x.units > 0 && x.spent > 0 && v < x.spent * (1 - stopLoss(s))) {
          sell(s, k, 'all'); note(s, `📊 Analista vendeu ${ASSETS.find(d => d.key === k).name} para limitar o prejuízo.`);
        }
      });
      // Susto à toa: vende uma posição saudável e paga para desfazer
      if (mulberry(s) < errorChance(s, 'analista') * 0.25) {
        const k = RISKY_ASSETS.slice().sort((p, q) => s.assets[q].units * s.assets[q].price - s.assets[p].units * s.assets[p].price)[0];
        const v = s.assets[k].units * s.assets[k].price;
        if (v >= 500) {
          sell(s, k, 'all');
          note(s, `😅 Analista se assustou à toa e vendeu ${ASSETS.find(d => d.key === k).name}; perdeu ${money(lose(s, v * 0.02 + 100))} em taxas.`);
        }
      }
      // Guarda parte da sobra: metade vai para a renda fixa e o resto fica para a cidade
      const a = analyze(s), want = active(s, 'planejador') ? recommend(s, a) : null;
      const budget = want ? BUILDINGS[want].cost : 0;
      const spare = s.cash - reserve(s, a) - 3000 - budget;
      if (spare >= 2000) {
        const amt = Math.floor(Math.min(3000 * levelOf(s, 'analista'), spare * 0.5));
        buy(s, 'cdb', amt); note(s, `📊 Analista aplicou ${money(amt)} em Renda Fixa.`);
        if (blunder(s, 'analista')) note(s, `😅 Analista errou a conta na aplicação e gastou ${money(lose(s, amt * 0.03 + 150))} para corrigir.`);
      }
    }

    if (active(s, 'planejador') && (s.month % 2 === 0 || efficiency(s, 'planejador') >= 0.5)) {
      const L = levelOf(s, 'planejador'), maxBuilds = [1, 1, 2, 2, 3][L - 1], cap = 4000 + 1500 * (L - 1);
      for (let i = 0; i < maxBuilds; i++) {
        let a = analyze(s); const k = recommend(s, a);
        if (!k) break;
        const cost = BUILDINGS[k].cost, net = cost * (1 - buildDiscount(s)), free = s.tiles.findIndex(t => !t);
        if (cost > cap || free < 0) break;
        let need = net + reserve(s, a) - s.cash;
        if (need > 0) {
          const got = liquidateSafe(s, need);
          if (got > 0) note(s, `🏗️ Planejador usou ${money(got)} da renda fixa para pagar a obra.`);
          if (s.cash - net < reserve(s, a)) break;
        }
        if (blunder(s, 'planejador') && mulberry(s) < 0.5) {
          note(s, `😅 Planejador construiu no lugar errado e gastou ${money(lose(s, cost * 0.5 + 300))} para desfazer.`);
          break;
        }
        if (!build(s, free, k).ok) break;
        s.cash += Math.round(cost * buildDiscount(s));
        note(s, `🏗️ Planejador construiu: ${BUILDINGS[k].name}.`);
      }
    }
  }

  function money(v) {
    const sign = v < 0 ? '-' : '';
    return `${sign}R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;
  }

  function serialize(s) { return JSON.stringify(s); }
  function load(text) {
    try {
      const s = JSON.parse(text);
      if (!s || s.v !== 1 || !Array.isArray(s.tiles) || s.tiles.length < OLD_TILES) return null;
      while (s.tiles.length < COLS * ROWS) s.tiles.push(null);
      if (!s.staff) s.staff = defaultStaff();
      if (!s.staffSeen) s.staffSeen = {};
      if (!s.staffStats) s.staffStats = {errors: 0, cost: 0};
      SALARY_ORDER.forEach(k => { if (!s.staff[k]) s.staff[k] = {hired: false, auto: true, level: 1}; if (!s.staff[k].level) s.staff[k].level = 1; });
      ASSETS.forEach(a => { if (!s.assets[a.key]) s.assets[a.key] = newAsset(); });
      return s;
    } catch (e) { return null; }
  }

  return {COLS, ROWS, HALL, BUILDINGS, ASSETS, SAFE_ASSETS, RISKY_ASSETS, GOALS, STAFF, SALARY_ORDER, MAX_LEVEL, hired, active, levelOf, isUnlocked, staffCost, salaryOf,
    efficiency, errorChance, staffInfo, upgrade, upgradeCost, loanRate, loanLimit, hire, fire, setAuto,
    recommend, needs, advice, hint, LOAN_LIMIT, OVERDRAFT_LIMIT, newGame, analyze, build, buildAny, demolish, demolishOne, counts, buy, sell,
    borrow, repay, setTax, step, netWorth, holdingsValue, money, serialize, load};
});
