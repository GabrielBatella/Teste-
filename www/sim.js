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
  // Juros do país: sobem e descem; a renda fixa acompanha. Média de 0,65% ao mês.
  const BASE_RATE = 0.0065, MIN_RATE = 0.003, MAX_RATE = 0.012;
  const ERROR_BASE = 0.30;   // chance de erro de um funcionário em cada decisão (1,5 de 5)
  // Terreno: lotes de 12 terrenos, cada compra custa mais que a anterior (cidade sem limite)
  // Terreno ilimitado: o mapa cresce sozinho em lotes de 12 quando acaba
  const LOT_SIZE = 12;
  // Ritmo da economia: receitas e custos mensais da cidade são multiplicados por isso (metade do ritmo anterior)
  const FLOW = 0.5;
  // Dificuldade 130%: ajustada por simulação para o jogador equilibrado crescer cerca de 30% menos.
  // Custos da cidade 15% maiores; eventos ruins 5% mais frequentes e mais caros (multiplicar tudo por 1,3 quebrava o jogo).
  const DIFFICULTY = 1.3;
  const COST_HARD = 1.15, EVENT_HARD = 1.05;
  // Progressão: quanto maior a cidade e mais velho o jogo, mais pesado e mais demorado. O começo (até ~50 habitantes) não muda.
  const SIZE_K = 0.25, YEAR_K = 0.012;
  const sizeF = s => 1 + SIZE_K * Math.log(1 + Math.max(0, s.pop - 50) / 300);   // cresce devagar com o tamanho
  const yearsF = s => 1 + YEAR_K * (s.month / 12);                                // custos sobem um pouco a cada ano
  const pressure = s => sizeF(s) * yearsF(s);                                    // pesa na manutenção e nos serviços
  const priceF = s => 1 + 0.5 * (sizeF(s) - 1);                                  // obras e treinamento ficam mais caros
  const PHASES = [[0, 'Vilarejo', '🏕️'], [100, 'Cidade pequena', '🏘️'], [300, 'Cidade', '🏙️'], [800, 'Cidade grande', '🌆'], [2000, 'Metrópole', '🌃'], [5000, 'Megalópole', '🌐']];
  function phaseOf(s) {
    let i = 0; PHASES.forEach((p, j) => { if (s.pop >= p[0]) i = j; });
    return {n: i + 1, name: PHASES[i][1], icon: PHASES[i][2], next: PHASES[i + 1] ? PHASES[i + 1][0] : null, nextName: PHASES[i + 1] ? PHASES[i + 1][1] : null,
      costs: pressure(s), prices: priceF(s), events: sizeF(s)};
  }

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
  // Gastos públicos: tudo que é do governo (serviços, escolas, polícia, energia, água, meio ambiente) custa manutenção,
  // e cada unidade a mais do mesmo tipo custa mais que a anterior (+10% por unidade já existente). A base é 30% maior que a de um prédio privado.
  const PUBLIC_ESC = 0.10, PUBLIC_BASE = 1.3;
  const isPublic = k => !!BUILDINGS[k] && BUILDINGS[k].kind !== 'Privado';
  const upkeepTotal = (k, n) => { const b = BUILDINGS[k]; return b.kind === 'Privado' ? b.upkeep * n : b.upkeep * PUBLIC_BASE * (n + PUBLIC_ESC * n * (n - 1) / 2); };

  // ---------- Mundo: países com relação, economia, empréstimos, política e bolsa de valores ----------
  // eco: oscilação da economia do país; mkt: crescimento e risco da bolsa dele
  const NEIGHBORS = [
    {key: 'vizinha',  name: 'Cidade Vizinha',      short: 'Vizinha',     icon: '🏘️', wealth: 15000,  eco: 0.015, mkt: [0.006, 0.030], desc: 'Pequena e próxima. Boa para negócios do dia a dia.'},
    {key: 'republica', name: 'República do Norte', short: 'Norte',       icon: '🏔️', wealth: 40000,  eco: 0.020, mkt: [0.008, 0.035], desc: 'País industrial, valoriza trabalho e comércio.'},
    {key: 'reino',    name: 'Reino do Sul',        short: 'Sul',         icon: '👑', wealth: 80000,  eco: 0.015, mkt: [0.007, 0.030], desc: 'País rico, com bancos fortes e muito dinheiro.'},
    {key: 'uniao',    name: 'União dos Mares',     short: 'Mares',       icon: '🌊', wealth: 30000,  eco: 0.020, mkt: [0.008, 0.035], desc: 'Nação de portos e turismo.'},
    {key: 'imperio',  name: 'Império do Leste',    short: 'Leste',       icon: '🐉', wealth: 120000, eco: 0.025, mkt: [0.012, 0.050], desc: 'Gigante econômico: cresce rápido, mas oscila bastante.'},
    {key: 'federacao', name: 'Federação das Montanhas', short: 'Montanhas', icon: '⛰️', wealth: 50000, eco: 0.018, mkt: [0.008, 0.040], desc: 'Mineração e metais. Vai bem quando o mundo constrói.'},
    {key: 'ilhas',    name: 'Ilhas do Sol',        short: 'Ilhas',       icon: '🏝️', wealth: 20000,  eco: 0.035, mkt: [0.007, 0.060], desc: 'Turismo e praias. Muito sensível a crises.'},
    {key: 'pampas',   name: 'Pampas Unidos',       short: 'Pampas',      icon: '🌾', wealth: 35000,  eco: 0.015, mkt: [0.007, 0.030], desc: 'Campo, grãos e carne. Estável.'},
    {key: 'ducado',   name: 'Ducado do Gelo',      short: 'Gelo',        icon: '❄️', wealth: 45000,  eco: 0.018, mkt: [0.009, 0.040], desc: 'Energia e tecnologia limpa.'},
    {key: 'emirado',  name: 'Emirado das Areias',  short: 'Areias',      icon: '🛢️', wealth: 100000, eco: 0.030, mkt: [0.008, 0.060], desc: 'Petróleo e muito dinheiro. Depende do preço do petróleo.'},
    {key: 'arquip',   name: 'Arquipélago Tech',    short: 'Arquipélago', icon: '💾', wealth: 60000,  eco: 0.030, mkt: [0.013, 0.060], desc: 'Tecnologia e inovação: cresce muito, com risco.'},
  ];
  const GIFT_COST = 300, TREATY_COST = 1000, TREATY_UPKEEP = 50;

  // fixed: renda fixa (juros do país). bank: múltiplo dos juros que o banco paga; scare/hit: chance e tamanho da
  // crise de confiança; fail: chance de o banco quebrar. div: dividendo mensal (% do valor aplicado).
  const ASSETS = [
    {key: 'poupanca', name: 'Poupança',            icon: '🐖', fixed: true, mult: 0.6, drift: 0, vol: 0,      desc: 'Segura e sem taxa. Rende pouco.'},
    {key: 'tesouro',  name: 'Tesouro Direto',      icon: '🏛️', fixed: true, mult: 0.92, drift: 0, vol: 0.006, desc: 'Governo como devedor. Acompanha os juros do país.'},
    {key: 'cdb',      name: 'Banco Seguro (CDB)',  icon: '🏦', fixed: true, bank: true, mult: 0.85, drift: 0, vol: 0.001, scare: 0, fail: 0, desc: 'Banco gigante. Paga menos, mas não quebra.'},
    {key: 'cdb_b',    name: 'Banco da Cidade (CDB)', icon: '🏢', fixed: true, bank: true, mult: 1.05, drift: 0, vol: 0.002, scare: 0.004, hit: 0.06, fail: 0, desc: 'Paga a média do mercado. Raramente passa aperto.'},
    {key: 'cdb_c',    name: 'Banco Popular (CDB)', icon: '🏬', fixed: true, bank: true, mult: 1.35, drift: 0, vol: 0.004, scare: 0.01, hit: 0.12, fail: 0.0005, desc: 'Paga bem, mas às vezes tem crise de confiança.'},
    {key: 'cdb_d',    name: 'Banco Turbo (CDB)',   icon: '💳', fixed: true, bank: true, mult: 2.1, drift: 0, vol: 0.008, scare: 0.015, hit: 0.25, fail: 0.003, desc: 'Promete juros altíssimos, mas pode quebrar.'},
    {key: 'divid',    name: 'Ações de dividendos', icon: '💎', drift: 0.006, vol: 0.035, div: 0.005, desc: 'Empresas sólidas: crescem pouco e pagam dividendo todo mês.'},
    {key: 'fii',      name: 'Fundo Imobiliário',   icon: '🏘️', drift: 0.004, vol: 0.025, div: 0.0065, desc: 'Paga aluguel todo mês (dividendo alto), cresce devagar.'},
    {key: 'ouro',     name: 'Ouro',                icon: '🥇', drift: 0.006, vol: 0.035, desc: 'Sobe nas crises. Bom para se proteger.'},
    {key: 'etf',      name: 'Fundo de índice',     icon: '🌎', drift: 0.012, vol: 0.045, div: 0.002, desc: 'Um pouco de tudo da bolsa mundial, com dividendo baixo.'},
    {key: 'dolar',    name: 'Dólar',               icon: '💵', drift: 0.004, vol: 0.05,  desc: 'Dispara quando o mercado entra em pânico.'},
    {key: 'acoes',    name: 'Ações de crescimento', icon: '📈', drift: 0.016, vol: 0.07, div: 0.001, desc: 'Pode render muito ou cair forte. Dividendo mínimo.'},
    {key: 'cripto',   name: 'Criptomoeda',         icon: '🪙', drift: 0.022, vol: 0.16, cap: 5000,  desc: 'Altíssimo risco, altíssimo retorno.'},
    {key: 'startup',  name: 'Startups',            icon: '🚀', drift: 0.03,  vol: 0.28, cap: 3000,  desc: 'Quase sempre perde, mas uma pode multiplicar tudo.'},
  ];
  // Uma bolsa de valores por país: acompanha a economia dele, com dividendo baixo
  NEIGHBORS.forEach(n => ASSETS.push({key: 'b_' + n.key, name: 'Bolsa · ' + n.name, icon: n.icon, country: n.key, drift: n.mkt[0], vol: n.mkt[1], div: 0.002,
    desc: 'Acompanha a economia de ' + n.name + '. Sobe e cai com ela.'}));
  const SAFE_ASSETS = ['poupanca', 'cdb', 'cdb_b', 'tesouro'];
  const WORLD_ASSETS = ASSETS.filter(a => a.country).map(a => a.key);
  const RISKY_ASSETS = ['acoes', 'cripto', 'fii', 'etf', 'startup', 'divid'].concat(WORLD_ASSETS);
  const GLOBAL_ASSETS = ['ouro', 'dolar', 'etf'];
  const FIXED_ASSETS = ASSETS.filter(a => a.fixed).map(a => a.key);
  const RATE_SENSITIVITY = 0.15;   // juros altos puxam para baixo os ativos de risco

  // ---------- Equipe: 15 pessoas, 5 por área, 8 níveis cada ----------
  // Todos são iguais nas regras (sem supervisor, sem ordem): o que muda é quanto cada um rende.
  // area: bônus de time completo para quem é da mesma área.
  const STAFF = {
    arquiteto:  {area: 'obras', name: 'Arquiteto', icon: '📐', salary: 45, pop: 40,
      desc: 'Constrói moradias e empregos quando a cidade precisa e consegue desconto em todas as obras da cidade.'},
    obras:      {area: 'obras', name: 'Gerente de Obras', icon: '🧰', salary: 35, pop: 70,
      desc: 'Corta os custos de manutenção e dos serviços básicos da cidade.'},
    infra:      {area: 'obras', name: 'Engenheiro de Infraestrutura', icon: '🔧', salary: 30, pop: 90,
      desc: 'Constrói energia, água e esgoto quando faltam e faz as redes renderem mais.'},
    ambiental:  {area: 'obras', name: 'Engenheiro Ambiental', icon: '🌿', salary: 25, pop: 130,
      desc: 'Reduz a poluição e constrói filtros e florestas quando o ar piora.'},
    social:     {area: 'obras', name: 'Planejador Social', icon: '🤲', salary: 30, pop: 110,
      desc: 'Constrói escolas, hospitais, delegacias e parques quando faltam e deixa o povo mais feliz.'},
    analista:   {area: 'invest', name: 'Analista de Mercado', icon: '📊', salary: 45, nw: 40000,
      desc: 'Avisa quando um investimento está caro ou barato e melhora o retorno da carteira.'},
    corretor:   {area: 'invest', name: 'Corretor', icon: '💼', salary: 30, nw: 70000,
      desc: 'Corta as taxas de corretagem e aplica parte das sobras em renda fixa.'},
    risco:      {area: 'invest', name: 'Gestor de Risco', icon: '🛡️', salary: 45, nw: 90000,
      desc: 'Vende o que despenca, suaviza as quedas das crises e protege sua carteira.'},
    global:     {area: 'invest', name: 'Analista Global', icon: '🌍', salary: 55, nw: 200000,
      desc: 'Entende o mercado mundial: melhora o retorno de ouro, dólar e fundo de índice.'},
    contador:   {area: 'invest', name: 'Contador', icon: '🧮', salary: 35, nw: 50000,
      desc: 'Melhora a arrecadação de impostos da cidade.'},
    gerente:    {area: 'fin', name: 'Gerente Financeiro', icon: '🏦', salary: 35, pop: 80,
      desc: 'Paga dívidas quando sobra dinheiro, pede empréstimo para você não ficar no vermelho e consegue juros menores.'},
    tesoureiro: {area: 'fin', name: 'Tesoureiro', icon: '🏛️', salary: 40, pop: 150,
      desc: 'Aumenta seu limite de crédito e reduz os juros do cheque especial.'},
    diplomata:  {area: 'fin', name: 'Diplomata', icon: '🤝', salary: 40, pop: 120,
      desc: 'Cuida da relação com os vizinhos, manda presentes quando esfria e melhora os tratados.'},
    economista: {area: 'fin', name: 'Economista', icon: '📈', salary: 50, pop: 250,
      desc: 'Amortece as crises e faz o comércio render mais.'},
    auditor:    {area: 'fin', name: 'Auditor', icon: '⚖️', salary: 45, pop: 300,
      desc: 'Reduz os erros de toda a equipe e recupera parte do dinheiro perdido em erros.'},
  };
  // O que cada pessoa passa a fazer em cada nível
  const SKILLS = {
    arquiteto: [[1, 'Constrói casas e comércios'], [3, 'Constrói prédios e fazendas'], [4, 'Constrói shoppings'], [5, 'Constrói condomínios de luxo e polos tecnológicos'], [6, 'Constrói fábricas quando a poluição deixa']],
    infra: [[1, 'Constrói energia solar, água e esgoto'], [3, 'Passa a usar energia eólica'], [4, 'Age antes da falta ficar grave'], [6, 'Mantém folga nas redes']],
    ambiental: [[1, 'Constrói filtros industriais'], [4, 'Planta florestas e constrói usinas de reciclagem'], [6, 'Age cedo e mantém o ar sempre limpo']],
    social: [[1, 'Escolas, hospitais, delegacias e parques'], [3, 'Constrói bombeiros'], [4, 'Constrói universidades'], [5, 'Constrói estádios'], [6, 'Age antes da falta ficar grave']],
    corretor: [[1, 'Aplica em renda fixa (o banco que paga mais)'], [2, 'Compra ações de dividendos'], [4, 'Compra fundos de índice e ações'], [5, 'Compra ouro, dólar e bolsas de outros países'], [6, 'Faz uma pequena aposta em cripto e startups']],
    risco: [[1, 'Vende ativos que despencam'], [3, 'Corta posição acima de 35% da carteira'], [5, 'Compra ouro quando vem crise'], [7, 'Reduz risco se o mundo entrar em recessão']],
    global: [[1, 'Investe em bolsas de países em alta'], [4, 'Sai de bolsas de países em crise'], [6, 'Acompanha até 3 países ao mesmo tempo']],
    gerente: [[1, 'Evita o vermelho e paga a dívida'], [3, 'Compara banco e outros países e escolhe o mais barato'], [5, 'Paga primeiro a dívida mais cara']],
    tesoureiro: [[1, 'Troca dívida cara por dívida barata'], [4, 'Quita dívidas com outros países']],
    diplomata: [[1, 'Manda presentes quando a relação esfria'], [2, 'Decide as questões políticas'], [3, 'Assina tratados comerciais'], [4, 'Decide os pedidos de empréstimo']],
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
  const TRAIN_COST = [350, 750, 1250, 2000, 3000, 4750, 7500];   // para ir do nível 1→2, 2→3...
  const CAPACITY = [60, 110, 180, 290, 450, 700, 1100, 1800];       // habitantes que dá conta de atender

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
    {id: 'friends', text: 'Boa relação com 6 países', test: s => NEIGHBORS.filter(n => s.world.rel[n.key] >= 70).length >= 6},
    {id: 'treaty',  text: 'Assinar 3 tratados comerciais', test: s => NEIGHBORS.filter(n => s.world.treaty[n.key]).length >= 3},
    {id: 'world',   text: 'Investir em 3 países diferentes', test: s => WORLD_ASSETS.filter(k => s.assets[k].units > 0).length >= 3},
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
      market: {rate: BASE_RATE, prev: BASE_RATE}, world: newWorld(), lowHappy: 0, goals: {}, netHist: [10000],
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
  const salaryAt = (k, lvl) => Math.round(STAFF[k].salary * SALARY_MULT[lvl - 1] * FLOW);
  const salaryOf = (s, k) => hired(s, k) ? salaryAt(k, levelOf(s, k)) : 0;
  // Custo de coordenação: quanto maior a equipe, mais cara a folha (+2,5% por pessoa a mais)
  function staffCost(s) {
    const n = STAFF_ORDER.filter(k => hired(s, k)).length;
    return STAFF_ORDER.reduce((t, k) => t + salaryOf(s, k), 0) * (n > 1 ? 1 + 0.025 * (n - 1) : 1);
  }
  // Todos estão liberados desde o começo: quem decide é o jogador. Os campos pop/nw dizem a partir de quando compensa.
  function lockReason(s, k) { return null; }
  function readiness(s, k) {
    const f = STAFF[k], need = [];
    if (f.pop && s.pop < f.pop) need.push(`${f.pop} habitantes`);
    if (f.nw && netWorth(s) < f.nw) need.push(`patrimônio de ${money(f.nw)}`);
    return need.length
      ? {early: true, text: `Ainda cedo: ${f.name} só compensa a partir de uns ${need.join(' e ')}. Antes disso o salário pesa mais que o ganho.`}
      : {early: false, text: null};
  }
  // Aviso (não proíbe nada): contratar muito cedo é gastar salário sem retorno
  function hireWarnings(s, k) { const r = readiness(s, k); return r.early ? [r.text] : []; }
  const isUnlocked = (s, k) => lockReason(s, k) === null;
  // Eficiência: 1 = dá conta da cidade; menos que isso = sobrecarregado
  const capacityOf = (s, k) => CAPACITY[levelOf(s, k) - 1] || 0;
  const efficiency = (s, k) => hired(s, k) ? clamp(capacityOf(s, k) / Math.max(1, s.pop), 0.25, 1) : 0;
  // Bônus de time completo: +4% para cada colega da mesma área contratado
  const teamBonus = (s, k) => 1 + TEAM_BONUS * (STAFF_ORDER.filter(x => STAFF[x].area === STAFF[k].area && hired(s, x)).length - 1);
  // "Nível efetivo": nível × eficiência × bônus de time (é o que vira efeito no jogo)
  // Retorno decrescente: o nível 8 não rende 8 vezes o nível 1 (freia o efeito bola de neve)
  const LV_POW = 0.9, TEAM_BONUS = 0.03;
  const pw = (s, k) => hired(s, k) ? Math.pow(levelOf(s, k), LV_POW) * efficiency(s, k) * teamBonus(s, k) : 0;
  const lv = (s, k) => levelOf(s, k);
  // Chance de errar: 30% normalmente, mais se estiver sobrecarregado, menos com Auditor
  const errorChance = (s, k) => clamp(ERROR_BASE + 0.25 * (1 - efficiency(s, k)) - 0.03 * lv(s, 'auditor'), 0.08, 0.6);

  const loanLimit = s => LOAN_LIMIT + 5000 * lv(s, 'tesoureiro');
  const loanRate = s => LOAN_RATE - (hired(s, 'gerente') ? 0.003 + 0.001 * pw(s, 'gerente') : 0) - 0.0008 * pw(s, 'tesoureiro');
  const overdraftRate = s => OVERDRAFT_RATE * (1 - 0.06 * lv(s, 'tesoureiro'));
  const upkeepCut = s => Math.min(0.5, 0.09 * pw(s, 'obras'));
  const taxBoost = s => 0.06 * pw(s, 'contador');
  const buildDiscount = s => hired(s, 'arquiteto') ? 0.08 + 0.025 * lv(s, 'arquiteto') : 0;
  const gridBoost = s => 0.04 * pw(s, 'infra');
  const smogCut = s => Math.min(0.7, 0.07 * pw(s, 'ambiental'));
  const joyBonus = s => 0.6 * pw(s, 'social');
  const analystEdge = (s, key) => {
    if (key === 'poupanca') return 0;
    const brokerEdge = 0.0007 * pw(s, 'corretor');   // o corretor consegue melhores condições até na renda fixa
    if (FIXED_ASSETS.indexOf(key) >= 0) return brokerEdge;
    return brokerEdge + 0.0018 * pw(s, 'analista') + 0.0010 * pw(s, 'risco') + (GLOBAL_ASSETS.indexOf(key) >= 0 ? 0.0018 * pw(s, 'global') : 0);
  };
  const feeRate = s => FEE * Math.max(0, 1 - 0.14 * lv(s, 'corretor'));
  const stopLoss = s => Math.max(0.25, 0.45 - 0.025 * lv(s, 'risco'));
  const shockSoftener = s => Math.min(0.6, 0.05 * pw(s, 'risco'));
  const econSoftener = s => Math.min(0.6, 0.06 * pw(s, 'economista'));
  const auditRefund = s => Math.min(0.5, 0.04 * lv(s, 'auditor'));
  const maxBuilds = s => Math.ceil(lv(s, 'arquiteto') / 4);

  function upgradeCost(s, k) { return hired(s, k) && levelOf(s, k) < MAX_LEVEL ? Math.round(TRAIN_COST[levelOf(s, k) - 1] * priceF(s)) : null; }
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
      case 'analista': lines.push(`Retorno dos investimentos de risco +${rate2(0.0018 * pw(s, 'analista'))} ao mês`); break;
      case 'corretor': lines.push(`Taxa de corretagem ${rate2(feeRate(s))}`, `Aplica até ${money(1500 * L)} por mês`); break;
      case 'risco': lines.push(`Vende se cair ${pct(stopLoss(s))}`, `Crises doem ${pct(shockSoftener(s))} menos`); break;
      case 'global': lines.push(`Ouro, dólar e índice +${rate2(analystEdge(s, 'ouro') - analystEdge(s, 'acoes'))} ao mês`); break;
      case 'contador': lines.push(`Impostos +${pct(taxBoost(s))}`); break;
      case 'gerente': lines.push(`Juros de ${rate2(loanRate(s))} ao mês`, `Caixa parado rende ${rate2(0.0012 * pw(s, 'gerente'))} ao mês`); break;
      case 'tesoureiro': lines.push(`Limite de crédito ${money(loanLimit(s))}`, `Juros do vermelho ${rate2(overdraftRate(s))}`); break;
      case 'diplomata': lines.push(`Relações +${(0.8 * pw(s, 'diplomata')).toFixed(1).replace('.', ',')} por mês`, `Tratados rendem +${pct(0.02 * pw(s, 'diplomata'))}`); break;
      case 'economista': lines.push(`Crises doem ${pct(econSoftener(s))} menos`, `Receita da cidade +${pct(0.025 * pw(s, 'economista'))}`); break;
      case 'auditor': lines.push(`Erros -${Math.round(3 * L)} pontos`, `Recupera ${pct(auditRefund(s))} do prejuízo`); break;
    }
    const skills = (SKILLS[k] || []).map(([lvl, text]) => ({lvl, text, on: L >= lvl}));
    return {level: L, skills, salary: salaryOf(s, k), efficiency: efficiency(s, k), capacity: capacityOf(s, k), errorChance: errorChance(s, k),
      teamBonus: teamBonus(s, k), lines, nextCost: upgradeCost(s, k), nextSalary: L < MAX_LEVEL ? salaryAt(k, L + 1) : null};
  }

  function hire(s, k) {
    if (s.over || !STAFF[k]) return {ok: false, msg: 'Funcionário inválido.'};
    if (hired(s, k)) return {ok: false, msg: 'Já contratado.'};
    const why = lockReason(s, k);
    if (why) return {ok: false, msg: why + '.'};
    if (s.cash < STAFF[k].salary) return {ok: false, msg: 'Dinheiro insuficiente para o 1º salário.'};
    s.staff[k] = {hired: true, auto: true, level: 1};
    return {ok: true, warnings: hireWarnings(s, k)};
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
  // Quanto o ativo rende hoje por mês: crescimento esperado + dividendo
  function assetYield(s, key) {
    const d = ASSETS.find(x => x.key === key), rate = (s.market || {rate: BASE_RATE}).rate;
    const growth = d.fixed ? rate * d.mult : d.drift - RATE_SENSITIVITY * (rate - BASE_RATE) + analystEdge(s, key);
    return {growth, div: d.div || 0, total: growth + (d.div || 0)};
  }
  const reserve = (s, a) => 1500 + ((a.upkeep + s.pop * BASIC_COST) * FLOW * COST_HARD * pressure(s) + staffCost(s)) * 2;

  function counts(s) {
    const c = {};
    s.tiles.forEach(t => { if (t) c[t] = (c[t] || 0) + 1; });
    return c;
  }

  // ---------- Terreno: infinito ----------
  const freeTiles = s => s.tiles.reduce((t, x) => t + (x ? 0 : 1), 0);

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
    for (const k in c) if (BUILDINGS[k]) upkeep += upkeepTotal(k, c[k]);
    return {c, housing, jobs, workers, employed, empRate, cov, pollution, taxEffect, happy, upkeep, sum,
      powerDeficit: Math.max(0, powerDemand - powerSupply), waterDeficit: Math.max(0, waterDemand - waterSupply),
      sewageDeficit: Math.max(0, sewageDemand - sewageSupply)};
  }

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // Quanto custa por mês (já com tudo aplicado) manter n unidades de um tipo, e a próxima unidade
  const maintScale = s => FLOW * COST_HARD * pressure(s) * (1 - upkeepCut(s));
  function upkeepInfo(s, k) {
    const n = counts(s)[k] || 0, f = maintScale(s);
    return {n, now: upkeepTotal(k, n) * f, next: (upkeepTotal(k, n + 1) - upkeepTotal(k, n)) * f, first: upkeepTotal(k, 1) * f, public: isPublic(k)};
  }
  // Resumo dos gastos públicos do governo
  function publicCosts(s) {
    const c = counts(s), rows = [];
    Object.keys(BUILDINGS).forEach(k => { if (isPublic(k) && c[k]) { const i = upkeepInfo(s, k); rows.push({key: k, n: c[k], total: i.now, next: i.next, first: i.first, extra: i.now - i.first * c[k]}); } });
    return {rows, total: rows.reduce((t, r) => t + r.total, 0), extra: rows.reduce((t, r) => t + r.extra, 0)};
  }

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
  const buildCost = (s, type) => Math.round(BUILDINGS[type].cost * (1 - buildDiscount(s)) * priceF(s));
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
    let idx = s.tiles.findIndex(t => !t);
    if (idx < 0) { for (let i = 0; i < LOT_SIZE; i++) s.tiles.push(null); idx = s.tiles.length - LOT_SIZE; }
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
      f += ((s.world.rel[n.key] - 50) / 50) * 0.008;
      if (s.world.treaty[n.key]) f += 0.015 * s.world.econ[n.key];
    });
    f += treatyCount(s) * 0.005 * pw(s, 'diplomata');
    if (s.world.mods.commerceLeft > 0) f *= s.world.mods.commerce;
    return clamp(f, 0.85, 1.25);
  }
  // Crise ou boom em um país: mexe na economia e na bolsa dele
  function shockCountry(s, key, f) {
    s.world.econ[key] = clamp(s.world.econ[key] * f, 0.6, 1.5);
    const bx = s.assets['b_' + key]; if (bx) bx.price = Math.max(1, bx.price * clamp(Math.pow(f, 1.5), 0.5, 1.6));
  }
  function addRel(s, key, d) { s.world.rel[key] = clamp(s.world.rel[key] + d, 0, 100); }

  function gift(s, key, amount) {
    if (s.over || !nb(key) || !(amount > 0)) return {ok: false, msg: 'Valor inválido.'};
    if (s.world.giftCd[key] > 0) return {ok: false, msg: 'Eles ainda lembram do último presente. Espere um pouco.'};
    if (s.cash < amount) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.cash -= amount;
    addRel(s, key, Math.min(12, amount / 150 * (1 + 0.1 * pw(s, 'diplomata'))));
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
    const keys = NEIGHBORS.map(n => n.key), a = keys[Math.floor(worldRand(s) * keys.length)];
    let b = keys[Math.floor(worldRand(s) * keys.length)]; if (b === a) b = keys[(keys.indexOf(a) + 1) % keys.length];
    const A = nb(a), B = nb(b), kind = Math.floor(worldRand(s) * 4);
    if (kind === 0) return {text: `${A.icon} ${A.name} e ${B.icon} ${B.name} brigaram por causa de comércio e pedem que você escolha um lado.`, left: 6, options: [
      {label: `Apoiar ${A.name}`, rel: {[a]: 8, [b]: -6}}, {label: `Apoiar ${B.name}`, rel: {[a]: -6, [b]: 8}}, {label: 'Ficar neutro', rel: {[a]: -2, [b]: -2}}]};
    if (kind === 1) return {text: '🌍 Uma conferência internacional pede metas verdes de todos os países.', left: 6, options: [
      {label: 'Assinar o acordo (R$ 750)', cash: -750, rel: Object.fromEntries(keys.map(k => [k, 4]))}, {label: 'Recusar', rel: Object.fromEntries(keys.map(k => [k, -3]))}]};
    if (kind === 2) return {text: `${A.icon} ${A.name} quer construir uma estrada cortando a sua cidade.`, left: 6, options: [
      {label: 'Aceitar (ganha R$ 750 de pedágio)', cash: 750, rel: {[a]: 6}}, {label: 'Recusar', rel: {[a]: -4}}]};
    return {text: `${A.icon} Famílias refugiadas de ${A.name} pedem abrigo na sua cidade.`, left: 6, options: [
      {label: 'Acolher (R$ 400)', cash: -400, pop: 12, rel: {[a]: 6}}, {label: 'Recusar', rel: {[a]: -5}}]};
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

  // Sorteio próprio do mundo para as coisas que dependem do que a equipe decide (calotes, pedidos, dilemas)
  function worldRand(s) {
    if (s.wseed == null) s.wseed = (s.seed * 13 + 5) | 0;
    s.wseed = (s.wseed + 0x6D2B79F5) | 0;
    let t = s.wseed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function worldStep(s) {
    const w = s.world;
    NEIGHBORS.forEach(n => {
      const k = n.key, old = w.econ[k];
      w.econ[k] = clamp(old + (1 - old) * 0.05 + n.eco * gauss(s), 0.6, 1.5);
      // a bolsa do país acompanha a economia dele
      const bx = s.assets['b_' + k]; if (bx) bx.price = Math.max(1, bx.price * clamp(Math.pow(w.econ[k] / old, 1.5), 0.5, 1.6));
      // a relação esfria sozinha; o Diplomata ajuda a manter
      w.rel[k] = clamp(w.rel[k] + (50 - w.rel[k]) * 0.02 + 0.8 * pw(s, 'diplomata'), 0, 100);
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
      if (worldRand(s) < risk) { addRel(s, l.who, -4); worldNote(s, `💸 ${nb(l.who).name} deu calote! Você perdeu o que faltava receber.`); return false; }
      s.cash += l.monthly; l.left--;
      if (l.left <= 0) { addRel(s, l.who, 4); worldNote(s, `🤝 ${nb(l.who).name} quitou o empréstimo e agradeceu.`); return false; }
      return true;
    });

    // Pedido de empréstimo (depois do primeiro ano)
    if (w.request) { w.request.left--; if (w.request.left <= 0) { addRel(s, w.request.who, -3); worldNote(s, `🙁 ${nb(w.request.who).name} ficou chateado porque você ignorou o pedido.`); w.request = null; } }
    else if (s.month > 12 && s.cash > 3000 && worldRand(s) < 0.06) {
      const cand = NEIGHBORS.filter(n => w.rel[n.key] >= 45), n = cand[Math.floor(worldRand(s) * cand.length)];
      if (n) {
        w.request = {who: n.key, amount: Math.round((1000 + worldRand(s) * 2000) / 250) * 250, months: 12, rate: 0.01, left: 3};
        worldNote(s, `📨 ${n.name} pediu um empréstimo de ${money(w.request.amount)}.`);
      }
    }
    // Dilema político
    if (w.dilemma) { w.dilemma.left--; if (w.dilemma.left <= 0) { const opt = w.dilemma.options[w.dilemma.options.length - 1]; for (const k in (opt.rel || {})) addRel(s, k, Math.min(0, opt.rel[k])); worldNote(s, '🕰️ Você demorou a decidir e perdeu a chance.'); w.dilemma = null; } }
    else if (s.month > 8 && worldRand(s) < 0.04) { w.dilemma = dilemmaMaker(s); worldNote(s, '🗳️ Surgiu uma decisão política para você.'); }

    // Acontecimentos pelo mundo (afetam um pouco)
    if (mulberry(s) < 0.10) {
      const n = NEIGHBORS[Math.floor(mulberry(s) * NEIGHBORS.length)], t = w.treaty[n.key] ? 1.5 : 1, r = mulberry(s);
      if (r < 0.25) { shockCountry(s, n.key, 0.82); w.mods.commerce = 1 - 0.04 * t; w.mods.commerceLeft = 4; worldNote(s, `📉 Crise em ${n.name}: o comércio com eles sofre por 4 meses.`); }
      else if (r < 0.45) { shockCountry(s, n.key, 1.12); w.mods.commerce = 1 + 0.05 * t; w.mods.commerceLeft = 4; worldNote(s, `🚀 Boom em ${n.name}: o comércio com eles aquece por 4 meses.`); }
      else if (r < 0.60) { w.mods.upkeep = 1.05; w.mods.upkeepLeft = 4; worldNote(s, '🛢️ O petróleo subiu no mundo: manutenção 5% mais cara por 4 meses.'); }
      else if (r < 0.75) { NEIGHBORS.forEach(m => addRel(s, m.key, 3)); worldNote(s, '🕊️ Cúpula da paz: todos os países se aproximaram.'); }
      else if (r < 0.88) { const g = Math.round((500 + mulberry(s) * 1000) * (0.6 + w.rel[n.key] / 100) * FLOW); s.cash += g; worldNote(s, `🧳 Onda de turistas de ${n.name}: você ganhou ${money(g)}.`); }
      else { addRel(s, n.key, -8); worldNote(s, `⚔️ Tensão com ${n.name}: a relação piorou.`); }
    }
  }

  // ---------- Eventos ----------
  const EVENTS = [
    {w: () => 2, run(s) {
      const d = Math.round((1500 + mulberry(s) * 2500) * FLOW * EVENT_HARD * sizeF(s)); s.cash -= d; note(s, `🌊 Enchente! Reparos custaram ${money(d)}.`);
    }},
    {w: () => 3, run(s) {
      const g = Math.round((400 + mulberry(s) * 800) * FLOW); s.cash += g; note(s, `🎉 Festival na cidade! Turismo rendeu ${money(g)}.`);
    }},
    {w: () => 2, run(s) {
      s.mods.econ = 0.75; s.mods.econLeft = 6;
      mult(s, {acoes: 0.78, cripto: 0.65, fii: 0.9, etf: 0.85, startup: 0.6, divid: 0.88, ouro: 1.08, dolar: 1.1});
      s.market.rate = clamp(s.market.rate + 0.0015, MIN_RATE, MAX_RATE);
      note(s, '📉 Crise econômica! Bolsa despenca e o comércio sofre por 6 meses (ouro e dólar sobem).');
    }},
    {w: () => 2, run(s) {
      s.mods.econ = 1.25; s.mods.econLeft = 6;
      mult(s, {acoes: 1.15, cripto: 1.3, fii: 1.05, etf: 1.1, startup: 1.35, divid: 1.06, ouro: 0.98, dolar: 0.97});
      s.market.rate = clamp(s.market.rate - 0.002, MIN_RATE, MAX_RATE);
      note(s, '🚀 Boom econômico! Bolsa dispara e o comércio aquece por 6 meses.');
    }},
    {w: () => 2, run(s) {
      s.mods.upkeep = 1.3; s.mods.upkeepLeft = 6; mult(s, {ouro: 1.05, tesouro: 1.03});
      s.market.rate = clamp(s.market.rate + 0.001, MIN_RATE, MAX_RATE);
      note(s, '🔥 Inflação! Manutenção 30% mais cara por 6 meses.');
    }},
    {w: () => 1, run(s) {
      const a = analyze(s), cut = Math.min(0.8, a.sum('fire') / Math.max(1, s.pop) * 1.2);
      const d = Math.round((2000 + mulberry(s) * 3000) * (1 - cut) * FLOW * EVENT_HARD * sizeF(s)); s.cash -= d;
      note(s, `🔥 Incêndio! O estrago custou ${money(d)}${cut > 0 ? ' (os bombeiros ajudaram)' : ''}.`);
    }},
    {w: s => analyze(s).cov.sewage < 0.7 ? 1.5 : 0.3, run(s) {
      const a = analyze(s), d = Math.round((1500 + mulberry(s) * 2000) * (1 - 0.5 * a.cov.health) * FLOW * EVENT_HARD * sizeF(s)); s.cash -= d;
      note(s, `🤒 Epidemia! O tratamento custou ${money(d)}.`);
    }},
    {w: s => analyze(s).cov.power < 0.8 ? 1.5 : 0, run(s) {
      const d = Math.round((800 + mulberry(s) * 1200) * FLOW * EVENT_HARD * sizeF(s)); s.cash -= d;
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

    const taxes = a.employed * 8 * (s.taxRate / 10) * (1 + taxBoost(s)) * FLOW;
    let slots = 0;
    for (const k in a.c) { const b = BUILDINGS[k]; if (b && b.housing) slots += b.housing * (b.rent || 5) * a.c[k]; }
    const rent = (a.housing > 0 ? Math.min(1, s.pop / a.housing) * slots : 0) * FLOW;
    const consumption = a.employed * 12;
    const commerce = Math.min(consumption, a.sum('sales')) * 0.22 * econ * power * trade * FLOW;
    const workerFactor = Math.min(1, a.workers / Math.max(1, a.jobs));
    let industry = 0;
    for (const k in a.c) {
      const b = BUILDINGS[k]; if (!b || !b.profit) continue;
      let p = b.profit * a.c[k];
      if (k === 'tecnologia') p *= 0.4 + 0.6 * a.cov.edu;
      industry += (b.needsWorkers ? p * workerFactor * econ * power * trade : p) * FLOW;
    }
    const boom = 1 + 0.025 * pw(s, 'economista');
    let exports = 0;
    NEIGHBORS.forEach(n => { if (s.world.treaty[n.key]) exports += s.world.econ[n.key] * (25 + 0.35 * s.pop) * (1 + 0.02 * pw(s, 'diplomata')); });
    const income = (taxes + rent + commerce + industry + exports) * boom;
    let kindUp = {'Serviço': 0, 'Público': 0, 'Ambiente': 0};
    for (const k in a.c) { const b = BUILDINGS[k]; if (b && kindUp[b.kind] != null) kindUp[b.kind] += upkeepTotal(k, a.c[k]); }
    const kindCut = kindUp['Serviço'] * Math.min(0.5, 0.06 * pw(s, 'infra')) + kindUp['Público'] * Math.min(0.5, 0.05 * pw(s, 'social'))
      + kindUp['Ambiente'] * Math.min(0.5, 0.06 * pw(s, 'ambiental'));
    const maint = Math.max(0, (a.upkeep - kindCut) * upk * (1 - upkeepCut(s))) * FLOW * COST_HARD * pressure(s);
    const salaries = staffCost(s);
    const diplomacy = treatyCount(s) * TREATY_UPKEEP;
    let foreignInterest = 0;
    NEIGHBORS.forEach(n => { foreignInterest += s.world.owed[n.key] * foreignRate(s, n.key); });
    const interest = s.debt * loanRate(s) + foreignInterest;
    const overdraft = s.cash < 0 ? -s.cash * overdraftRate(s) : 0;
    const basic = s.pop * BASIC_COST * (1 - upkeepCut(s)) * FLOW * COST_HARD * pressure(s);
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

    // Juros do país e mercado
    const m = s.market; m.prev = m.rate;
    m.rate = clamp(m.rate + (BASE_RATE - m.rate) * 0.08 + 0.0004 * gauss(s), MIN_RATE, MAX_RATE);
    let dividends = 0;
    ASSETS.forEach(d => {
      const x = s.assets[d.key], y = assetYield(s, d.key);
      x.price = Math.min(d.cap || 1e12, x.price * Math.max(0.2, 1 + y.growth + d.vol * gauss(s)));
      // Crise de confiança ou quebra de banco
      if (d.bank) {
        const r = mulberry(s);
        if (d.fail && r < d.fail) { x.price *= 0.4; note(s, `💥 O ${d.name.replace(' (CDB)', '')} quebrou! Quem tinha dinheiro lá perdeu boa parte.`); }
        else if (d.scare && r < d.scare + (d.fail || 0)) { x.price *= 1 - d.hit; note(s, `⚠️ ${d.name.replace(' (CDB)', '')} passou por uma crise de confiança: o CDB caiu ${Math.round(d.hit * 100)}%.`); }
      }
      x.hist.push(x.price); if (x.hist.length > 36) x.hist.shift();
      if (d.div && x.units > 0) dividends += x.units * x.price * d.div;
    });
    // O Gerente Financeiro faz o caixa parado render
    const cashYield = Math.max(0, s.cash - reserve(s, a)) * 0.0012 * pw(s, 'gerente');
    dividends += cashYield;
    s.cash += dividends;
    if (s.mods.econLeft > 0) s.mods.econLeft--;
    if (s.mods.upkeepLeft > 0) s.mods.upkeepLeft--;

    // Eventos aleatórios da cidade e do mundo
    if (mulberry(s) < 0.17 * EVENT_HARD) {
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

    s.report = {taxes, rent, commerce, industry, exports, cashYield, dividends, income, maint, basic, salaries, diplomacy, interest, overdraft, expenses, net: income + dividends - expenses};
    s.netHist.push(netWorth(s)); if (s.netHist.length > 48) s.netHist.shift();

    GOALS.forEach(g => { if (!s.goals[g.id] && g.test(s)) { s.goals[g.id] = s.month; note(s, `🏆 Meta cumprida: ${g.text}!`); } });


    s.lowHappy = s.pop > 0 && s.happy < 15 ? s.lowHappy + 1 : 0;
    if (s.cash < -OVERDRAFT_LIMIT) s.over = {title: 'Falência!', text: 'A prefeitura quebrou: dívidas demais e nenhum caixa.'};
    else if (s.lowHappy >= 6) s.over = {title: 'Revolta popular!', text: 'Os moradores estão infelizes demais e derrubaram você.'};
    if (s.over) s.over.score = Math.round(netWorth(s));
    return s;
  }

  // ---------- Funcionários: decisões automáticas (e erros) ----------
  // Cada nível libera comportamentos novos (veja SKILLS). Eles erram de vez em quando e gastam para corrigir.
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
  const assetName = k => ASSETS.find(d => d.key === k).name;
  // Dinheiro vendido pelo Gestor de Risco vai para a renda fixa que paga mais (não fica parado)
  function parkSafe(s, amt) {
    if (amt < 200) return;
    const alvo = ['cdb', 'cdb_b', 'tesouro'].sort((p, q) => assetYield(s, q).total - assetYield(s, p).total)[0];
    buy(s, alvo, Math.min(amt, s.cash));
  }
  function portfolio(s) {
    const v = {}; let tot = 0;
    ASSETS.forEach(d => { const x = s.assets[d.key]; v[d.key] = x.units * x.price; tot += v[d.key]; });
    return {v, tot};
  }
  // Sobra de caixa que os bots podem usar (depois da reserva e do que as obras vão precisar)
  function spareCash(s, a) {
    const builders = ['arquiteto', 'infra', 'ambiental', 'social'].some(x => active(s, x));
    const want = builders ? recommend(s, a) : null;
    return s.cash - reserve(s, a) - 3000 - (want ? BUILDINGS[want].cost : 0);
  }

  // ----- O que cada construtor escolhe, conforme o nível -----
  function pickCity(s, a, L) {
    if (a.empRate < 0.8) {
      const lack = a.employed * 12 > 0.8 * a.sum('sales') && s.pop > 150;
      if (L >= 5 && a.cov.edu >= 0.5) return 'tecnologia';
      if (L >= 4 && (lack || a.empRate < 0.7)) return 'mercado';
      if (L >= 6 && a.pollution < 6 && a.cov.power >= 0.9) return 'fabrica';
      if (L >= 3 && a.cov.water >= 0.85) return 'fazenda';
      return 'loja';
    }
    if (s.pop >= a.housing - 2) {
      if (L >= 5 && a.happy >= 65 && a.empRate >= 0.9 && s.pop > 200) return 'condominio';
      if (L >= 3 && s.pop >= 100 && a.cov.water >= 0.8 && a.cov.sewage >= 0.8) return 'predio';
      return 'casa';
    }
    return null;
  }
  function pickInfra(s, a, L) {
    const lim = Math.min(0.95, 0.7 + 0.04 * (L - 1));
    if (s.pop > 70 && a.cov.power < lim) return L >= 3 && a.powerDeficit > 150 ? 'eolica' : 'solar';
    if (s.pop > 70 && a.cov.water < lim) return 'agua';
    if (s.pop > 70 && a.cov.sewage < lim) return 'esgoto';
    return null;
  }
  function pickGreen(s, a, L) {
    if (a.pollution < Math.max(2, 16 - 2 * L)) return null;
    if (L < 4) return 'filtro';
    return a.pollution >= 10 ? 'reciclagem' : 'floresta';
  }
  function pickSocial(s, a, L) {
    const k = Math.min(0.85, 0.5 + 0.05 * (L - 1)), pk = Math.min(0.8, 0.4 + 0.05 * (L - 1)), pop = s.pop;
    if (pop > 40 && a.cov.edu < k) return L >= 4 && pop > 300 && a.cov.edu < 0.4 ? 'universidade' : 'escola';
    if (pop > 60 && a.cov.health < k) return 'hospital';
    if (pop > 60 && a.cov.safety < k) return 'policia';
    if (L >= 3 && pop > 150 && a.sum('fire') / pop < 0.5) return 'bombeiros';
    if (pop > 40 && a.cov.park < pk) return 'parque';
    if (L >= 4 && pop > 400 && a.cov.edu >= 0.5 && a.c.tecnologia && !a.c.universidade) return 'universidade';
    if (L >= 5 && pop > 300 && a.cov.park >= 0.7 && a.happy < 85 && !a.c.estadio) return 'estadio';
    return null;
  }

  // Cada construtor cuida de uma área e usa renda fixa se faltar caixa
  function builderActs(s, who, pick, maxN, capCost) {
    if (!active(s, who) || !(s.month % 2 === 0 || efficiency(s, who) >= 0.5)) return;
    for (let i = 0; i < maxN; i++) {
      const a = analyze(s), k = pick(s, a, lv(s, who));
      if (!k) break;
      const cost = BUILDINGS[k].cost, net = buildCost(s, k);
      if (cost > capCost) break;
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

  // ----- Investimentos: carteira por grupos, cada nível diversifica mais -----
  const GROUP_ASSETS = {safe: ['cdb', 'cdb_b', 'tesouro', 'cdb_c'], div: ['divid', 'fii'], index: ['etf', 'acoes'], hedge: ['ouro', 'dolar'], world: WORLD_ASSETS, lotto: ['cripto', 'startup']};
  const TARGETS = [
    {safe: 1}, {safe: 0.85, div: 0.15}, {safe: 0.65, div: 0.35}, {safe: 0.5, div: 0.3, index: 0.2},
    {safe: 0.4, div: 0.25, index: 0.2, hedge: 0.1, world: 0.05}, {safe: 0.3, div: 0.2, index: 0.2, hedge: 0.1, world: 0.15, lotto: 0.05},
    {safe: 0.25, div: 0.2, index: 0.2, hedge: 0.1, world: 0.2, lotto: 0.05}, {safe: 0.2, div: 0.2, index: 0.2, hedge: 0.1, world: 0.25, lotto: 0.05},
  ];
  function pickAsset(s, group, L) {
    let cand = GROUP_ASSETS[group];
    if (group === 'safe' && L < 4) cand = cand.filter(k => k !== 'cdb_c');
    if (group === 'lotto') return cand[Math.floor(staffRand(s) * cand.length)];
    const {v} = portfolio(s), groupTot = cand.reduce((t, k) => t + v[k], 0) + 1;
    const score = k => {
      const d = ASSETS.find(x => x.key === k), adv = advice(s, k);
      // rendimento + oportunidade, com uma multa para quem já concentra o grupo (espalha a aplicação)
      return assetYield(s, k).total + (adv ? (adv.icon === '✅' ? 0.003 : -0.003) : 0) + (d.country ? (s.world.econ[d.country] - 1) * 0.02 + (s.world.rel[d.country] - 50) / 5000 : 0) - 0.008 * (v[k] / groupTot);
    };
    return cand.slice().sort((p, q) => score(q) - score(p))[0];
  }
  function bestGroup(s, L, amt) {
    const {v, tot} = portfolio(s), tgt = TARGETS[Math.min(L, 8) - 1], V = tot + amt;
    let best = 'safe', def = -Infinity;
    for (const g in tgt) {
      const cur = GROUP_ASSETS[g].reduce((t, k) => t + v[k], 0), d = tgt[g] * V - cur;
      if (d > def) { def = d; best = g; }
    }
    return best;
  }

  // ----- Dívidas: banco da cidade ou países, o que for mais barato -----
  const debts = s => [{src: 'banco', rate: loanRate(s), owed: s.debt}].concat(NEIGHBORS.map(n => ({src: n.key, rate: foreignRate(s, n.key), owed: s.world.owed[n.key]}))).filter(d => d.owed > 0);
  function cheapestSource(s, need, L) {
    let best = {src: 'banco', rate: loanRate(s), room: loanLimit(s) - s.debt};
    if (L >= 3) NEIGHBORS.forEach(n => {
      const room = foreignLimit(s, n.key);
      if (s.world.rel[n.key] >= 50 && room >= need && (best.room < need || foreignRate(s, n.key) < best.rate)) best = {src: n.key, rate: foreignRate(s, n.key), room};
    });
    return best;
  }

  function staffActs(s) {
    if (!s.staffStats) s.staffStats = {errors: 0, cost: 0};

    // ===== Finanças =====
    if (active(s, 'gerente')) {
      const L = lv(s, 'gerente');
      if (s.cash < 0) {
        const need = Math.ceil((-s.cash + 1000) / 1000) * 1000, src = cheapestSource(s, need, L);
        let amt = 0, who = 'do banco';
        if (src.src === 'banco') { amt = Math.min(Math.max(0, loanLimit(s) - s.debt), need); if (amt > 0) { s.debt += amt; s.cash += amt; } }
        else if (borrowForeign(s, src.src, need).ok) { amt = need; who = 'de ' + nb(src.src).name; }
        if (amt > 0) {
          note(s, `🏦 Gerente pegou ${money(amt)} emprestado ${who} (juros de ${rate2(src.rate)} ao mês) para evitar o vermelho.`);
          if (blunder(s, 'gerente')) note(s, `😅 Gerente errou os papéis do empréstimo e pagou ${money(lose(s, amt * 0.03 + 100))} de taxas a mais.`);
        }
      } else {
        const list = debts(s).sort((p, q) => q.rate - p.rate), top = L >= 3 ? list[0] : list.find(d => d.src === 'banco');
        const spare = s.cash - reserve(s, analyze(s)) - 4000;
        if (top && spare >= 250) {
          const pay = Math.floor(Math.min(top.owed, 3000 * L * FLOW * 2, spare));
          if (top.src === 'banco') { s.debt -= pay; s.cash -= pay; } else repayForeign(s, top.src, pay);
          note(s, `🏦 Gerente pagou ${money(pay)} da dívida ${top.src === 'banco' ? 'do banco' : 'com ' + nb(top.src).name} (a mais cara).`);
          if (blunder(s, 'gerente')) note(s, `😅 Gerente se confundiu na quitação e pagou ${money(lose(s, pay * 0.02 + 100))} de multa.`);
        }
      }
    }
    if (active(s, 'tesoureiro')) {
      const L = lv(s, 'tesoureiro');
      // Troca dívida cara do banco por dívida barata de outro país (refinanciar)
      if (s.debt >= 1500) {
        const amt = Math.min(s.debt, 3000 * L * FLOW * 2);
        const best = NEIGHBORS.filter(n => s.world.rel[n.key] >= 50 && foreignLimit(s, n.key) >= amt).sort((p, q) => foreignRate(s, p.key) - foreignRate(s, q.key))[0];
        if (best && foreignRate(s, best.key) <= loanRate(s) - 0.002 && borrowForeign(s, best.key, amt).ok) {
          s.debt -= amt; s.cash -= amt;
          note(s, `🏛️ Tesoureiro trocou ${money(amt)} da dívida do banco por um empréstimo mais barato de ${best.name}.`);
          if (blunder(s, 'tesoureiro')) note(s, `😅 Tesoureiro pagou ${money(lose(s, amt * 0.01 + 80))} de taxas na troca da dívida.`);
        }
      }
      // Com folga, quita dívidas com outros países
      if (L >= 4) {
        const spare = s.cash - reserve(s, analyze(s)) - 6000, ext = debts(s).filter(d => d.src !== 'banco').sort((p, q) => q.rate - p.rate)[0];
        if (ext && spare >= 500) { const pay = Math.floor(Math.min(ext.owed, spare, 2000 * L * FLOW * 2)); repayForeign(s, ext.src, pay); note(s, `🏛️ Tesoureiro quitou ${money(pay)} da dívida com ${nb(ext.src).name}.`); }
      }
    }
    if (active(s, 'diplomata')) {
      const L = lv(s, 'diplomata'), a0 = analyze(s);
      // presentes: quando a relação esfria (até 2 por mês)
      let gifts = 0;
      NEIGHBORS.forEach(n => {
        if (gifts < 2 && s.world.rel[n.key] < 45 && s.world.giftCd[n.key] === 0 && s.cash > reserve(s, a0) + GIFT_COST && (s.world.treaty[n.key] || s.world.owed[n.key] > 0 || s.world.econ[n.key] >= 1.05)) {
          gifts++;
          if (blunder(s, 'diplomata')) { addRel(s, n.key, -3); note(s, `😅 Diplomata deu um presente que ofendeu ${n.name} e gastou ${money(lose(s, GIFT_COST))}.`); s.world.giftCd[n.key] = 2; }
          else { gift(s, n.key, GIFT_COST); note(s, `🤝 Diplomata mandou um presente para ${n.name}.`); }
        }
      });
      // decisões políticas
      const d = s.world.dilemma;
      if (L >= 2 && d) {
        const value = o => {
          let v = 0; for (const k in (o.rel || {})) v += o.rel[k] * (0.6 + s.world.econ[k] + (s.world.treaty[k] ? 0.8 : 0));
          if (o.cash && o.cash < 0 && s.cash < -o.cash + reserve(s, a0)) v -= 99;
          return v + (o.cash || 0) / 400;
        };
        const ranked = d.options.map((o, i) => ({i, v: value(o)})).sort((p, q) => q.v - p.v);
        const pick = blunder(s, 'diplomata') ? ranked[ranked.length - 1] : ranked[0];
        const label = d.options[pick.i].label;
        if (answerDilemma(s, pick.i).ok) note(s, `🤝 Diplomata decidiu: ${label}.`);
      }
      // pedidos de empréstimo dos vizinhos
      const r = s.world.request;
      if (L >= 4 && r) {
        const exposure = lentValue(s) + r.amount;
        let yes = s.world.rel[r.who] >= 55 && s.world.econ[r.who] >= 0.95 && s.cash - r.amount > reserve(s, a0) * 1.5 && exposure < Math.max(5000, netWorth(s) * 0.25);
        if (blunder(s, 'diplomata')) yes = !yes;
        if (answerRequest(s, yes).ok) note(s, `🤝 Diplomata ${yes ? 'aceitou' : 'recusou'} o pedido de ${nb(r.who).name}.`);
      }
      // tratados comerciais com os melhores parceiros
      if (L >= 3 && treatyCount(s) < Math.floor((L + 1) / 2)) {
        const best = NEIGHBORS.filter(n => !s.world.treaty[n.key] && s.world.rel[n.key] >= 60)
          .sort((p, q) => s.world.econ[q.key] * s.world.rel[q.key] - s.world.econ[p.key] * s.world.rel[p.key])[0];
        if (best && s.cash < TREATY_COST + reserve(s, a0) + 1500) liquidateSafe(s, TREATY_COST + reserve(s, a0) + 1500 - s.cash);
        if (best && s.cash - TREATY_COST > reserve(s, a0) + 1500 && signTreaty(s, best.key).ok) {
          note(s, `🤝 Diplomata assinou um tratado comercial com ${best.name}.`);
          if (blunder(s, 'diplomata')) note(s, `😅 Diplomata negociou mal e gastou ${money(lose(s, TREATY_COST * 0.3))} a mais no tratado.`);
        }
      }
    }

    // ===== Investimentos =====
    if (active(s, 'risco')) {
      const L = lv(s, 'risco');
      RISKY_ASSETS.forEach(k => {
        const x = s.assets[k], v = x.units * x.price;
        if (x.units > 0 && x.spent > 0 && v < x.spent * (1 - stopLoss(s))) { sell(s, k, 'all'); parkSafe(s, v * 0.97); note(s, `🛡️ Gestor de Risco vendeu ${assetName(k)} para limitar o prejuízo e guardou na renda fixa.`); }
      });
      const {v, tot} = portfolio(s);
      // não deixa uma posição passar de 35% da carteira
      if (L >= 3 && tot > 3000) {
        const big = RISKY_ASSETS.find(k => v[k] > 0.35 * tot);
        if (big) { sell(s, big, v[big] - 0.30 * tot); parkSafe(s, (v[big] - 0.30 * tot) * 0.97); note(s, `🛡️ Gestor de Risco reduziu ${assetName(big)} porque passou de 35% da carteira.`); }
      }
      // compra ouro quando vem crise
      const crise = s.mods.econLeft > 0 && s.mods.econ < 1;
      if (L >= 5 && crise && (v.ouro + v.dolar) < 0.05 * Math.max(tot, 1)) {
        const amt = Math.floor(Math.min(spareCash(s, analyze(s)) * 0.3, Math.max(tot, 2000) * 0.1));
        if (amt >= 300) { buy(s, 'ouro', amt); note(s, `🛡️ Gestor de Risco comprou ${money(amt)} em ouro para se proteger da crise.`); }
      }
      // recessão mundial: vende pedaço da posição mais arriscada
      const media = NEIGHBORS.reduce((t, n) => t + s.world.econ[n.key], 0) / NEIGHBORS.length;
      if (L >= 7 && media < 0.9) {
        const k = ['startup', 'cripto', 'acoes'].find(x => v[x] > 800);
        if (k) { sell(s, k, v[k] * 0.25); parkSafe(s, v[k] * 0.25 * 0.97); note(s, `🛡️ Gestor de Risco vendeu 25% de ${assetName(k)} porque o mundo entrou em recessão.`); }
      }
      // susto à toa
      if (staffRand(s) < errorChance(s, 'risco') * 0.25) {
        const k = RISKY_ASSETS.slice().sort((p, q) => v[q] - v[p])[0];
        if (v[k] >= 500) note(s, `😅 Gestor de Risco fez uma operação errada em ${assetName(k)} e pagou ${money(lose(s, v[k] * 0.02 + 100))} em taxas.`);
      }
    }
    if (active(s, 'corretor')) {
      const L = lv(s, 'corretor'), a = analyze(s), spare = spareCash(s, a);
      if (spare >= 1000) {
        const amt = Math.floor(Math.min(1500 * L * FLOW * 2, spare * 0.5));
        const g = bestGroup(s, L, amt), k = pickAsset(s, g, L);
        buy(s, k, amt); note(s, `💼 Corretor aplicou ${money(amt)} em ${assetName(k)}.`);
        if (blunder(s, 'corretor')) note(s, `😅 Corretor errou a conta na aplicação e gastou ${money(lose(s, amt * 0.015 + 60))} para corrigir.`);
      }
    }
    if (active(s, 'global')) {
      const L = lv(s, 'global'), maxC = L < 4 ? 1 : L < 6 ? 2 : 3, {v, tot} = portfolio(s);
      if (L >= 4) NEIGHBORS.forEach(n => { if (v['b_' + n.key] > 0 && s.world.econ[n.key] < 0.85) { sell(s, 'b_' + n.key, 'all'); note(s, `🌍 Analista Global saiu da bolsa de ${n.name}, que está em crise.`); } });
      const held = NEIGHBORS.filter(n => v['b_' + n.key] > 200).length, spare = spareCash(s, analyze(s));
      const best = NEIGHBORS.filter(n => s.world.econ[n.key] >= 1.08 && s.world.rel[n.key] >= 45 && v['b_' + n.key] < 0.15 * Math.max(tot, 5000))
        .sort((p, q) => s.world.econ[q.key] - s.world.econ[p.key])[0];
      if (best && spare >= 1500 && (held < maxC || v['b_' + best.key] > 0)) {
        const amt = Math.floor(Math.min(800 * L * FLOW * 2, spare * 0.3));
        buy(s, 'b_' + best.key, amt); note(s, `🌍 Analista Global investiu ${money(amt)} na bolsa de ${best.name}, que está aquecida.`);
      }
    }

    // ===== Construção: cada um cuida da sua área =====
    builderActs(s, 'arquiteto', pickCity, maxBuilds(s), 3500 + 1000 * lv(s, 'arquiteto'));
    builderActs(s, 'infra', pickInfra, 1 + (lv(s, 'infra') >= 5 ? 1 : 0), 3500 + 1000 * lv(s, 'infra'));
    builderActs(s, 'ambiental', pickGreen, 1, 3000 + 600 * lv(s, 'ambiental'));
    builderActs(s, 'social', pickSocial, 1 + (lv(s, 'social') >= 5 ? 1 : 0), 4000 + 1000 * lv(s, 'social'));
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
      NEIGHBORS.forEach(n => { const w = s.world; if (w.econ[n.key] == null) { w.econ[n.key] = 1; w.rel[n.key] = 50; w.treaty[n.key] = false; w.owed[n.key] = 0; w.giftCd[n.key] = 0; } });
      if (!s.market) s.market = {rate: BASE_RATE, prev: BASE_RATE};
      return s;
    } catch (e) { return null; }
  }

  return {COLS, ROWS: START_ROWS, HALL, BUILDINGS, ASSETS, SAFE_ASSETS, RISKY_ASSETS, FIXED_ASSETS, BASE_RATE, assetYield, GOALS, STAFF, STAFF_ORDER, SALARY_ORDER, AREAS, MAX_LEVEL, NEIGHBORS,
    hired, active, levelOf, isUnlocked, lockReason, readiness, hireWarnings, DIFFICULTY, COST_HARD, EVENT_HARD, PUBLIC_ESC, isPublic, upkeepInfo, publicCosts, pressure, priceF, sizeF, phaseOf, PHASES, staffCost, salaryOf, efficiency, errorChance, staffInfo, upgrade, upgradeCost, teamBonus,
    loanRate, loanLimit, hire, fire, setAuto, recommend, recCity, recInfra, recGreen, recSocial, needs, advice, hint,
    picks: {city: pickCity, infra: pickInfra, green: pickGreen, social: pickSocial, asset: pickAsset, group: bestGroup}, TARGETS, freeTiles, buildCost, SKILLS, LOT_SIZE, GIFT_COST, TREATY_COST, TREATY_UPKEEP, FLOW, WORLD_ASSETS, LOAN_LIMIT, OVERDRAFT_LIMIT,
    worldInfo, worldFactor, gift, signTreaty, cancelTreaty, borrowForeign, repayForeign, answerRequest, answerDilemma, foreignDebt, lentValue, foreignRate, foreignLimit,
    newGame, analyze, build, buildAny, demolish, demolishOne, counts, buy, sell, borrow, repay, setTax, step, netWorth, holdingsValue, money, serialize, load};
});
