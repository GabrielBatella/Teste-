// Motor da simulação: sem DOM, para poder ser testado em Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = 6, ROWS = 7, HALL = 3 * COLS + 2;
  const BASIC_COST = 1.5, ANALYST_EDGE = 0.002;
  const OVERDRAFT_LIMIT = 5000, LOAN_LIMIT = 30000, LOAN_RATE = 0.015, OVERDRAFT_RATE = 0.03, FEE = 0.003;

  const BUILDINGS = {
    casa:     {name: 'Casa',        icon: '🏠', cost: 800,  upkeep: 8,   housing: 12, kind: 'Privado',  desc: 'Abriga 12 moradores. Você recebe aluguel.'},
    predio:   {name: 'Prédio',      icon: '🏢', cost: 3200, upkeep: 30,  housing: 60, kind: 'Privado',  desc: 'Abriga 60 moradores. Aluguel maior.'},
    loja:     {name: 'Comércio',    icon: '🏪', cost: 1500, upkeep: 15,  jobs: 8,     kind: 'Privado',  desc: '8 empregos. Lucra com o consumo da cidade.'},
    fabrica:  {name: 'Fábrica',     icon: '🏭', cost: 4000, upkeep: 60,  jobs: 30,    kind: 'Privado',  desc: '30 empregos e lucro fixo, mas polui.'},
    escola:   {name: 'Escola',      icon: '🏫', cost: 2000, upkeep: 60,  kind: 'Público',  desc: 'Educação para ~150 moradores.'},
    hospital: {name: 'Hospital',    icon: '🏥', cost: 3500, upkeep: 100, kind: 'Público',  desc: 'Saúde para ~250 moradores.'},
    policia:  {name: 'Delegacia',   icon: '🚓', cost: 2500, upkeep: 70,  kind: 'Público',  desc: 'Segurança para ~200 moradores.'},
    parque:   {name: 'Parque',      icon: '🌳', cost: 800,  upkeep: 10,  kind: 'Público',  desc: 'Lazer para ~100 moradores e reduz poluição.'},
  };
  const HALL_UPKEEP = 50, HALL_JOBS = 5;

  const ASSETS = [
    {key: 'poupanca', name: 'Poupança',          icon: '🐖', drift: 0.005,  vol: 0,     desc: 'Segura e sem taxa. Rende pouco.'},
    {key: 'cdb',      name: 'Renda Fixa (CDB)',  icon: '🏦', drift: 0.0085, vol: 0.002, desc: 'Rende mais que a poupança, quase sem risco.'},
    {key: 'fii',      name: 'Fundo Imobiliário', icon: '🏘️', drift: 0.009,  vol: 0.025, desc: 'Risco moderado, acompanha o mercado.'},
    {key: 'acoes',    name: 'Ações',             icon: '📈', drift: 0.012,  vol: 0.07,  desc: 'Pode render muito ou cair forte.'},
    {key: 'cripto',   name: 'Criptomoeda',       icon: '🪙', drift: 0.015,  vol: 0.16,  desc: 'Altíssimo risco, altíssimo retorno.'},
  ];

  const STAFF = {
    planejador: {name: 'Planejador Urbano', icon: '🏗️', salary: 120, need: 'Libera com 50 habitantes', test: s => s.pop >= 50,
      desc: 'Mostra o que falta na cidade, constrói sozinho o que está faltando quando sobra dinheiro e reduz 25% da manutenção e consegue 15% de desconto nas obras.'},
    analista: {name: 'Analista de Investimentos', icon: '📊', salary: 100, need: 'Libera com R$ 15 mil de patrimônio', test: s => netWorth(s) >= 15000,
      desc: 'Diz se cada investimento está caro ou barato, aplica as sobras em renda fixa, vende se algo despencar 25% e zera a taxa de corretagem e consegue um retorno um pouco melhor (+0,2% ao mês).'},
    gerente: {name: 'Gerente Financeiro', icon: '🏦', salary: 70, need: 'Libera com 80 habitantes', test: s => s.pop >= 80,
      desc: 'Paga a dívida quando sobra dinheiro, pede um empréstimo pequeno para você não ficar no vermelho e consegue juros menores.'},
  };
  const SALARY_ORDER = ['planejador', 'analista', 'gerente'];

  const GOALS = [
    {id: 'pop100',  text: 'Chegar a 100 habitantes',  test: s => s.pop >= 100},
    {id: 'pop500',  text: 'Chegar a 500 habitantes',  test: s => s.pop >= 500},
    {id: 'pop1500', text: 'Chegar a 1.500 habitantes', test: s => s.pop >= 1500},
    {id: 'nw50',    text: 'Patrimônio de R$ 50 mil',  test: s => netWorth(s) >= 50000},
    {id: 'nw200',   text: 'Patrimônio de R$ 200 mil', test: s => netWorth(s) >= 200000},
    {id: 'nw1m',    text: 'Patrimônio de R$ 1 milhão', test: s => netWorth(s) >= 1000000},
    {id: 'diver',   text: 'Investir em 3 ativos diferentes', test: s => ASSETS.filter(a => s.assets[a.key].units > 0).length >= 3},
    {id: 'team',    text: 'Contratar 2 funcionários', test: s => SALARY_ORDER.filter(k => hired(s, k)).length >= 2},
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

  function newGame(seed) {
    const tiles = Array(COLS * ROWS).fill(null);
    tiles[HALL] = 'prefeitura';
    tiles[HALL - 1] = 'casa'; tiles[HALL + 1] = 'casa'; tiles[HALL + COLS] = 'loja';
    const assets = {};
    ASSETS.forEach(a => { assets[a.key] = {price: 100, units: 0, spent: 0, hist: [100]}; });
    return {
      v: 1, seed: seed == null ? (Date.now() | 0) : seed, month: 0, cash: 10000, debt: 0, taxRate: 10,
      tiles, pop: 20, happy: 55, assets, mods: {econ: 1, econLeft: 0, upkeep: 1, upkeepLeft: 0},
      log: ['Bem-vindo, prefeito! Cuide da cidade e faça o dinheiro render.'],
      report: null, over: null, staff: defaultStaff(), staffSeen: {}, lowHappy: 0, goals: {}, netHist: [10000],
    };
  }

  function defaultStaff() {
    const o = {};
    SALARY_ORDER.forEach(k => { o[k] = {hired: false, auto: true}; });
    return o;
  }
  const hired = (s, k) => !!(s.staff && s.staff[k] && s.staff[k].hired);
  const active = (s, k) => hired(s, k) && s.staff[k].auto;
  const isUnlocked = (s, k) => STAFF[k].test(s);
  function staffCost(s) { return SALARY_ORDER.reduce((t, k) => t + (hired(s, k) ? STAFF[k].salary : 0), 0); }
  const loanRate = s => hired(s, 'gerente') ? 0.010 : LOAN_RATE;

  function hire(s, k) {
    if (s.over || !STAFF[k]) return {ok: false, msg: 'Funcionário inválido.'};
    if (hired(s, k)) return {ok: false, msg: 'Já contratado.'};
    if (!isUnlocked(s, k)) return {ok: false, msg: STAFF[k].need + '.'};
    if (s.cash < STAFF[k].salary) return {ok: false, msg: 'Dinheiro insuficiente para o 1º salário.'};
    s.staff[k] = {hired: true, auto: true};
    return {ok: true};
  }
  function fire(s, k) {
    if (!hired(s, k)) return {ok: false, msg: 'Não está contratado.'};
    s.staff[k] = {hired: false, auto: true};
    return {ok: true};
  }
  function setAuto(s, k, on) {
    if (!hired(s, k)) return {ok: false, msg: 'Não está contratado.'};
    s.staff[k].auto = !!on; return {ok: true};
  }

  // O que a cidade mais precisa agora (usado pela dica e pelo Planejador)
  function recommend(s, a) {
    const pop = s.pop;
    if (a.empRate < 0.8) return 'loja';
    if (pop >= a.housing - 2) return 'casa';
    if (pop > 40 && a.cov.edu < 0.5) return 'escola';
    if (pop > 60 && a.cov.health < 0.5) return 'hospital';
    if (pop > 60 && a.cov.safety < 0.5) return 'policia';
    if (pop > 40 && a.cov.park < 0.4) return 'parque';
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
    return out;
  }
  // Opinião do analista sobre um investimento
  function advice(s, key) {
    const d = ASSETS.find(x => x.key === key), h = s.assets[key].hist;
    if (d.vol <= 0.002) return {icon: '✅', text: 'Seguro. Bom para guardar dinheiro.'};
    if (h.length < 6) return {icon: '⏳', text: 'Ainda coletando dados…'};
    const n = Math.min(12, h.length), recent = h.slice(-n);
    const base = recent.reduce((t, x) => t + x, 0) / n;
    const r = h[h.length - 1] / (base * Math.pow(1 + d.drift, (n - 1) / 2)) - 1, lim = Math.max(0.04, d.vol);
    if (r < -lim) return {icon: '✅', text: 'Está barato agora. Boa hora de comprar.'};
    if (r > lim) return {icon: '⚠️', text: 'Está caro agora. Melhor esperar ou vender um pouco.'};
    return {icon: '😐', text: 'Preço normal. Pode segurar.'};
  }
  const reserve = (s, a) => 1500 + (a.upkeep + s.pop * BASIC_COST + staffCost(s)) * 3;

  function counts(s) {
    const c = {};
    s.tiles.forEach(t => { if (t) c[t] = (c[t] || 0) + 1; });
    return c;
  }

  // Números derivados do estado atual (usados pela simulação e pela interface).
  function analyze(s) {
    const c = counts(s), n = k => c[k] || 0;
    const housing = n('casa') * BUILDINGS.casa.housing + n('predio') * BUILDINGS.predio.housing;
    const jobs = HALL_JOBS + n('loja') * BUILDINGS.loja.jobs + n('fabrica') * BUILDINGS.fabrica.jobs;
    const workers = s.pop * 0.6;
    const employed = Math.min(workers, jobs);
    const empRate = workers > 0 ? Math.min(1, jobs / workers) : 1;
    const per = Math.max(1, s.pop);
    const cov = {
      edu: Math.min(1, n('escola') * 150 / per),
      health: Math.min(1, n('hospital') * 250 / per),
      safety: Math.min(1, n('policia') * 200 / per),
      park: Math.min(1, n('parque') * 100 / per),
    };
    const pollution = Math.max(0, n('fabrica') * 4 - n('parque') * 3);
    const taxEffect = -(s.taxRate - 10) * 1.2;
    const happy = clamp(25 + 12 * cov.edu + 15 * cov.health + 12 * cov.safety + 8 * cov.park + 25 * empRate - pollution + taxEffect, 0, 100);
    let upkeep = HALL_UPKEEP;
    for (const k in c) if (BUILDINGS[k]) upkeep += BUILDINGS[k].upkeep * c[k];
    return {c, housing, jobs, workers, employed, empRate, cov, pollution, taxEffect, happy, upkeep};
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
    if (s.debt + amount > LOAN_LIMIT) return {ok: false, msg: 'Limite de crédito atingido.'};
    s.debt += amount; s.cash += amount; return {ok: true};
  }
  function repay(s, amount) {
    if (s.over || !(amount > 0) || s.debt <= 0) return {ok: false, msg: 'Nada a pagar.'};
    const pay = Math.min(amount, s.debt, Math.max(0, s.cash));
    if (pay <= 0) return {ok: false, msg: 'Dinheiro insuficiente.'};
    s.debt -= pay; s.cash -= pay; return {ok: true};
  }
  function setTax(s, rate) { s.taxRate = clamp(Math.round(rate), 0, 20); }

  function note(s, text) { s.log.unshift(`Mês ${s.month}: ${text}`); if (s.log.length > 40) s.log.pop(); }

  const EVENTS = [
    {w: 3, run(s) {
      const d = 1500 + Math.round(mulberry(s) * 2500); s.cash -= d; note(s, `🌊 Enchente! Reparos custaram ${money(d)}.`);
    }},
    {w: 2, run(s) {
      const g = 400 + Math.round(mulberry(s) * 800); s.cash += g; note(s, `🎉 Festival na cidade! Turismo rendeu ${money(g)}.`);
    }},
    {w: 2, run(s) {
      s.mods.econ = 0.75; s.mods.econLeft = 6;
      mult(s, {acoes: 0.78, cripto: 0.65, fii: 0.9});
      note(s, '📉 Crise econômica! Bolsa despenca e o comércio sofre por 6 meses.');
    }},
    {w: 2, run(s) {
      s.mods.econ = 1.25; s.mods.econLeft = 6;
      mult(s, {acoes: 1.15, cripto: 1.3, fii: 1.05});
      note(s, '🚀 Boom econômico! Bolsa dispara e o comércio aquece por 6 meses.');
    }},
    {w: 2, run(s) {
      s.mods.upkeep = 1.3; s.mods.upkeepLeft = 6; note(s, '🔥 Inflação! Manutenção 30% mais cara por 6 meses.');
    }},
  ];
  function mult(s, m) { for (const k in m) s.assets[k].price *= m[k]; }

  function step(s) {
    if (s.over) return s;
    s.month++;
    const a = analyze(s);
    const econ = s.mods.econLeft > 0 ? s.mods.econ : 1;
    const upk = s.mods.upkeepLeft > 0 ? s.mods.upkeep : 1;

    const taxes = a.employed * 8 * (s.taxRate / 10);
    const rent = Math.min(s.pop, a.housing) * 5;
    const consumption = a.employed * 12;
    const shops = (a.c.loja || 0) * 300;
    const commerce = Math.min(consumption, shops) * 0.22 * econ;
    const industry = (a.c.fabrica || 0) * 160 * Math.min(1, a.workers / Math.max(1, a.jobs)) * econ;
    const income = taxes + rent + commerce + industry;
    const maint = a.upkeep * upk * (hired(s, 'planejador') ? 0.75 : 1);
    const salaries = staffCost(s);
    const interest = s.debt * loanRate(s);
    const overdraft = s.cash < 0 ? -s.cash * OVERDRAFT_RATE : 0;
    const basic = s.pop * BASIC_COST;
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
      x.price *= Math.max(0.2, 1 + d.drift + (d.key !== 'poupanca' && hired(s, 'analista') ? ANALYST_EDGE : 0) + d.vol * gauss(s));
      x.hist.push(x.price); if (x.hist.length > 36) x.hist.shift();
    });
    if (s.mods.econLeft > 0) s.mods.econLeft--;
    if (s.mods.upkeepLeft > 0) s.mods.upkeepLeft--;

    // Eventos aleatórios
    if (mulberry(s) < 0.17) {
      let r = mulberry(s) * EVENTS.reduce((t, e) => t + e.w, 0);
      for (const e of EVENTS) { if ((r -= e.w) < 0) { e.run(s); break; } }
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

  // Decisões automáticas dos funcionários (só as simples e seguras)
  function staffActs(s) {
    if (active(s, 'gerente')) {
      if (s.cash < 0 && s.debt < LOAN_LIMIT) {
        const amt = Math.min(LOAN_LIMIT - s.debt, Math.ceil((-s.cash + 1000) / 1000) * 1000);
        s.debt += amt; s.cash += amt; note(s, `🏦 Gerente pegou ${money(amt)} emprestado para evitar o vermelho.`);
      } else if (s.debt > 0) {
        const spare = s.cash - reserve(s, analyze(s)) - 4000;
        if (spare >= 500) {
          const pay = Math.floor(Math.min(s.debt, 3000, spare));
          s.debt -= pay; s.cash -= pay; note(s, `🏦 Gerente pagou ${money(pay)} da dívida.`);
        }
      }
    }
    if (active(s, 'analista')) {
      ['acoes', 'cripto', 'fii'].forEach(k => {
        const x = s.assets[k], v = x.units * x.price;
        if (x.units > 0 && x.spent > 0 && v < x.spent * 0.75) {
          sell(s, k, 'all'); note(s, `📊 Analista vendeu ${ASSETS.find(d => d.key === k).name} para limitar o prejuízo.`);
        }
      });
      const spare = s.cash - reserve(s, analyze(s)) - 3000;
      if (spare >= 1000) {
        const amt = Math.floor(Math.min(3000, spare));
        buy(s, 'cdb', amt); note(s, `📊 Analista aplicou ${money(amt)} em Renda Fixa.`);
      }
    }
    if (active(s, 'planejador')) {
      const a = analyze(s), k = recommend(s, a);
      if (k) {
        const cost = BUILDINGS[k].cost;
        if (cost <= 4000 && s.cash - cost * 0.85 >= reserve(s, a) && build(s, s.tiles.findIndex(t => !t), k).ok) {
          s.cash += Math.round(cost * 0.15); note(s, `🏗️ Planejador construiu: ${BUILDINGS[k].name}.`);
        }
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
      if (!s || s.v !== 1 || !Array.isArray(s.tiles) || s.tiles.length !== COLS * ROWS) return null;
      if (!s.staff) s.staff = defaultStaff();
      if (!s.staffSeen) s.staffSeen = {};
      return s;
    } catch (e) { return null; }
  }

  return {COLS, ROWS, HALL, BUILDINGS, ASSETS, GOALS, STAFF, SALARY_ORDER, hired, active, isUnlocked, staffCost, loanRate, hire, fire, setAuto,
    recommend, needs, advice, LOAN_LIMIT, OVERDRAFT_LIMIT, newGame, analyze, build, buildAny, demolish, demolishOne, counts, buy, sell,
    borrow, repay, setTax, step, netWorth, holdingsValue, money, serialize, load};
});
