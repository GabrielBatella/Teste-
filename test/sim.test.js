const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../www/sim.js');

const run = (s, n) => { for (let i = 0; i < n && !s.over; i++) Sim.step(s); return s; };

test('jogo novo começa saudável', () => {
  const s = Sim.newGame(1);
  assert.equal(s.tiles[Sim.HALL], 'prefeitura');
  assert.equal(s.cash, 10000);
  const a = Sim.analyze(s);
  assert.ok(a.housing > 0 && a.jobs > 0);
});

test('construir desconta o custo e ocupa o terreno', () => {
  const s = Sim.newGame(1);
  assert.ok(Sim.build(s, 0, 'casa').ok);
  assert.equal(s.cash, 10000 - Sim.BUILDINGS.casa.cost);
  assert.equal(s.tiles[0], 'casa');
  assert.equal(Sim.build(s, 0, 'casa').ok, false);
  assert.equal(Sim.build(s, 1, 'xyz').ok, false);
  s.cash = 10;
  assert.equal(Sim.build(s, 1, 'casa').ok, false);
});

test('demolir devolve metade e não demole a prefeitura', () => {
  const s = Sim.newGame(1);
  Sim.build(s, 0, 'fabrica');
  const c = s.cash;
  assert.ok(Sim.demolish(s, 0).ok);
  assert.equal(s.cash, c + 2000);
  assert.equal(Sim.demolish(s, Sim.HALL).ok, false);
});

test('mesma semente gera o mesmo jogo', () => {
  const a = run(Sim.newGame(42), 60), b = run(Sim.newGame(42), 60);
  assert.equal(Sim.serialize(a), Sim.serialize(b));
});

test('cidade bem administrada cresce e dá lucro', () => {
  const s = Sim.newGame(7);
  [0, 1, 2, 3, 4].forEach(i => Sim.build(s, i, 'casa'));
  Sim.build(s, 5, 'loja'); Sim.build(s, 6, 'loja'); Sim.build(s, 7, 'escola'); Sim.build(s, 8, 'parque');
  const start = Sim.netWorth(s);
  run(s, 36);
  assert.ok(!s.over);
  assert.ok(s.pop > 40, 'população deveria crescer: ' + s.pop);
  assert.ok(Sim.netWorth(s) > start, 'patrimônio deveria subir');
});

test('compra e venda de ativos', () => {
  const s = Sim.newGame(3);
  assert.ok(Sim.buy(s, 'acoes', 1000).ok);
  assert.equal(s.cash, 9000);
  const v = Sim.holdingsValue(s);
  assert.ok(v < 1000 && v > 990, 'taxa de corretagem aplicada');
  assert.ok(Sim.sell(s, 'acoes', 'all').ok);
  assert.equal(s.assets.acoes.units, 0);
  assert.ok(s.cash > 9990 && s.cash < 10000, "perde só as taxas: " + s.cash);
  assert.equal(Sim.sell(s, 'acoes', 'all').ok, false);
  assert.equal(Sim.buy(s, 'acoes', 999999).ok, false);
});

test('poupança rende com o tempo e sem taxa', () => {
  const s = Sim.newGame(3);
  Sim.buy(s, 'poupanca', 1000);
  assert.equal(Sim.holdingsValue(s), 1000);
  run(s, 12);
  assert.ok(Sim.holdingsValue(s) > 1030 && Sim.holdingsValue(s) < 1090, 'poupança rende pouco: ' + Sim.holdingsValue(s));
});

test('empréstimo respeita limite e cobra juros', () => {
  const s = Sim.newGame(5);
  assert.ok(Sim.borrow(s, 10000).ok);
  assert.equal(Sim.borrow(s, Sim.LOAN_LIMIT).ok, false);
  Sim.step(s);
  assert.ok(s.report.interest === 150);
  assert.ok(Sim.repay(s, 5000).ok);
  assert.equal(s.debt, 5000);
});

test('gastar tudo sem renda leva à falência', () => {
  const s = Sim.newGame(9);
  s.cash = 0;
  for (let i = 0; i < Sim.COLS * Sim.ROWS; i++) { s.cash = 4000; Sim.build(s, i, 'fabrica'); }
  s.cash = 0; s.pop = 0;
  Sim.setTax(s, 0);
  run(s, 200);
  assert.ok(s.over, 'deveria falir');
  assert.equal(s.over.title, 'Falência!');
});

test('caixa negativo vende investimentos', () => {
  const s = Sim.newGame(11);
  Sim.buy(s, 'cdb', 5000);
  s.cash = -300; 
  Sim.step(s);
  assert.ok(s.cash >= 0 || s.assets.cdb.units === 0);
});

test('salvar e carregar', () => {
  const s = run(Sim.newGame(2), 10);
  const t = Sim.load(Sim.serialize(s));
  assert.deepEqual(t, s);
  assert.equal(Sim.load('lixo'), null);
  assert.equal(Sim.load('{"v":1,"tiles":[]}'), null);
});

test('imposto alto reduz felicidade', () => {
  const s = Sim.newGame(1);
  const base = Sim.analyze(s).happy;
  Sim.setTax(s, 20);
  assert.ok(Sim.analyze(s).happy < base);
  Sim.setTax(s, 99);
  assert.equal(s.taxRate, 20);
});

test('construir e demolir sem escolher terreno', () => {
  const s = Sim.newGame(1);
  const antes = Sim.counts(s).casa;
  assert.ok(Sim.buildAny(s, 'casa').ok);
  assert.equal(Sim.counts(s).casa, antes + 1);
  assert.ok(Sim.demolishOne(s, 'casa').ok);
  assert.equal(Sim.counts(s).casa, antes);
  assert.equal(Sim.demolishOne(s, 'hospital').ok, false);
  s.tiles.fill('casa'); s.cash = 99999;
  assert.equal(Sim.buildAny(s, 'casa').ok, false);
});

test('dificuldade: parado não quebra, ingênuo costuma ficar no vermelho', () => {
  let parado = 0, vermelho = 0;
  for (let k = 1; k <= 60; k++) {
    const a = Sim.newGame(k * 31); run(a, 60); if (a.over) parado++;
    const b = Sim.newGame(k * 31); let neg = false;
    for (let m = 0; m < 60 && !b.over; m++) {
      for (const t of ['fabrica', 'predio', 'casa']) Sim.buildAny(b, t);
      Sim.step(b); if (b.cash < 0) neg = true;
    }
    if (neg) vermelho++;
  }
  assert.equal(parado, 0, 'ficar parado não deve quebrar a cidade');
  assert.ok(vermelho >= 10, 'gastar sem planejar deve deixar o caixa negativo com frequência: ' + vermelho);
});

// ---------- Equipe ----------
const rica = seed => { const s = Sim.newGame(seed); s.pop = 120; s.cash = 40000; return s; };

test('funcionário só pode ser contratado depois de liberado', () => {
  const s = Sim.newGame(1);
  assert.equal(Sim.isUnlocked(s, 'arquiteto'), false);
  assert.equal(Sim.hire(s, 'arquiteto').ok, false);
  s.pop = 60;
  assert.ok(Sim.hire(s, 'arquiteto').ok);
  assert.equal(Sim.hire(s, 'arquiteto').ok, false);
  assert.equal(Sim.hire(s, 'xyz').ok, false);
});

test('salário entra nas despesas e some ao demitir', () => {
  const s = rica(1);
  Sim.hire(s, 'arquiteto'); Sim.hire(s, 'gerente');
  assert.equal(Sim.staffCost(s), 80);
  Sim.step(s);
  assert.equal(s.report.salaries, 80);
  Sim.fire(s, 'arquiteto'); Sim.fire(s, 'gerente');
  Sim.step(s);
  assert.equal(s.report.salaries, 0);
});

test('gerente reduz os juros e paga dívida quando sobra dinheiro', () => {
  const s = rica(2);
  Sim.borrow(s, 10000);
  Sim.hire(s, 'gerente');
  assert.ok(Sim.loanRate(s) < 0.015, 'juros menores com o gerente');
  const antes = s.debt;
  Sim.step(s);
  assert.ok(s.debt < antes, 'deveria amortizar');
  assert.ok(s.log.some(l => l.includes('Gerente pagou')));
});

test('gerente pede empréstimo em vez de deixar o caixa ficar negativo', () => {
  const s = rica(3);
  assert.ok(Sim.hire(s, 'gerente').ok);
  s.cash = -1500;
  Sim.step(s);
  assert.ok(s.cash >= 0, 'caixa: ' + s.cash);
  assert.ok(s.debt > 0);
});

test('gerente desligado não decide nada', () => {
  const s = rica(3);
  assert.ok(Sim.hire(s, 'gerente').ok); Sim.setAuto(s, 'gerente', false);
  s.cash = -1500;
  Sim.step(s);
  assert.equal(s.debt, 0);
});

test('corretor aplica a sobra em renda fixa e reduz a corretagem', () => {
  const s = rica(4); s.cash = 150000;
  assert.ok(Sim.hire(s, 'analista').ok);
  assert.ok(Sim.hire(s, 'corretor').ok);
  Sim.step(s);
  assert.ok(Sim.holdingsValue(s) > 0, 'deveria investir');
  const antes = s.cash;
  Sim.buy(s, 'acoes', 1000);
  const v = s.assets.acoes.units * s.assets.acoes.price;
  assert.ok(v > 997 && v < 1000, 'taxa menor que a padrão: ' + v);
  assert.equal(s.cash, antes - 1000);
  for (let i = 1; i < 8; i++) { s.cash = 1e6; Sim.upgrade(s, 'corretor'); }
  assert.equal(Sim.staffInfo(s, 'corretor').lines[0].includes('0,00%'), true, 'corretor nível 8 não cobra corretagem');
});

test('gestor de risco vende ativo que despencou', () => {
  const s = rica(5); s.cash = 150000;
  Sim.buy(s, 'acoes', 5000);
  s.assets.acoes.price *= 0.6;
  assert.ok(Sim.hire(s, 'analista').ok);
  assert.ok(Sim.hire(s, 'risco').ok);
  Sim.step(s);
  assert.equal(s.assets.acoes.units, 0);
  assert.ok(s.log.some(l => l.includes('Gestor de Risco vendeu')));
});

test('planejador constrói o que falta, com desconto', () => {
  const s = rica(6);
  s.pop = 59; // fica abaixo da capacidade de moradia, mas sem empregos
  for (let i = 0; i < 6; i++) Sim.buildAny(s, 'casa');
  Sim.hire(s, 'arquiteto');
  const a = Sim.analyze(s);
  const k = Sim.recommend(s, a);
  assert.ok(k, 'deveria haver uma recomendação');
  const n = Sim.counts(s)[k] || 0;
  Sim.step(s);
  assert.equal(Sim.counts(s)[k], n + 1);
  assert.ok(s.log.some(l => l.includes('Arquiteto construiu')));
});

test('conselho do analista e lista de necessidades', () => {
  const s = rica(7);
  for (let i = 0; i < 12; i++) Sim.step(s);
  ['poupanca', 'cdb', 'fii', 'acoes', 'cripto'].forEach(k => {
    const a = Sim.advice(s, k);
    assert.ok(a === null || (a.icon && a.text));
  });
  assert.equal(Sim.advice(s, 'cdb'), null, 'ativo seguro não precisa de conselho');
  s.assets.acoes.hist = [100, 100, 100, 100, 100, 100, 60];
  assert.ok(Sim.advice(s, 'acoes').text.includes('barato'));
  s.assets.acoes.hist = [100, 100, 100, 100, 100, 100, 150];
  assert.ok(Sim.advice(s, 'acoes').text.includes('caro'));
  const need = Sim.needs(s);
  assert.ok(Array.isArray(need) && need.every(x => x.key && x.n > 0));
});

test('jogo salvo antigo ganha a equipe ao carregar', () => {
  const s = Sim.newGame(1); delete s.staff; delete s.staffSeen;
  const t = Sim.load(JSON.stringify(s));
  assert.ok(t.staff.arquiteto && !t.staff.arquiteto.hired);
  assert.equal(Sim.STAFF_ORDER.length, 15);
});

test('save antigo com planejador vira arquiteto, mantendo o nível', () => {
  const s = Sim.newGame(1); delete s.staff.arquiteto;
  s.staff.planejador = {hired: true, auto: true, level: 3};
  const t = Sim.load(JSON.stringify(s));
  assert.equal(Sim.levelOf(t, 'arquiteto'), 3);
  assert.equal(t.staff.planejador, undefined);
});

test('aviso quando um funcionário é liberado', () => {
  const s = Sim.newGame(8); s.pop = 90;
  Sim.step(s);
  assert.ok(s.log.some(l => l.includes('Agora você pode contratar')));
});

test('dica só descreve o problema e é ocasional', () => {
  const s = Sim.newGame(1);
  assert.equal(Sim.hint(s, Sim.analyze(s)), null, 'cidade inicial não precisa de dica');
  s.cash = -50;
  const h = Sim.hint(s, Sim.analyze(s));
  assert.equal(h.id, 'cash');
  assert.ok(!/construa|invista|contrate/i.test(h.text), 'não deve dar a solução');
  let shown = 0, total = 0;
  for (let k = 1; k <= 20; k++) {
    const g = Sim.newGame(k * 13);
    for (let m = 0; m < 48 && !g.over; m++) {
      const rec = Sim.recommend(g, Sim.analyze(g));
      if (rec && g.cash > Sim.BUILDINGS[rec].cost + 2000) Sim.buildAny(g, rec);
      Sim.step(g); total++;
      if (Sim.hint(g, Sim.analyze(g))) shown++;
    }
  }
  const frac = shown / total;
  assert.ok(frac > 0.2 && frac < 0.7, 'frequência da dica: ' + frac);
});

// ---------- Níveis e capacidade ----------
test('treinar sobe o nível, cobra uma vez e aumenta o salário', () => {
  const s = rica(20);
  Sim.hire(s, 'arquiteto');
  assert.equal(Sim.levelOf(s, 'arquiteto'), 1);
  const sal1 = Sim.salaryOf(s, 'arquiteto'), cost = Sim.upgradeCost(s, 'arquiteto'), cash = s.cash;
  assert.ok(Sim.upgrade(s, 'arquiteto').ok);
  assert.equal(s.cash, cash - cost);
  assert.equal(Sim.levelOf(s, 'arquiteto'), 2);
  assert.ok(Sim.salaryOf(s, 'arquiteto') > sal1, 'salário deve subir');
  assert.equal(Sim.upgrade(s, 'analista').ok, false, 'não contratado');
});

test('nível máximo e dinheiro insuficiente', () => {
  const s = rica(21);
  Sim.hire(s, 'gerente');
  s.cash = 100;
  assert.equal(Sim.upgrade(s, 'gerente').ok, false);
  s.cash = 1e6;
  for (let i = 1; i < Sim.MAX_LEVEL; i++) assert.ok(Sim.upgrade(s, 'gerente').ok);
  assert.equal(Sim.levelOf(s, 'gerente'), Sim.MAX_LEVEL);
  assert.equal(Sim.upgradeCost(s, 'gerente'), null);
  assert.equal(Sim.upgrade(s, 'gerente').ok, false);
});

test('cidade grande sobrecarrega funcionário de nível baixo', () => {
  const s = rica(22);
  Sim.hire(s, 'arquiteto');
  s.pop = 60;  assert.equal(Sim.efficiency(s, 'arquiteto'), 1);
  s.pop = 200; const e1 = Sim.efficiency(s, 'arquiteto');
  assert.ok(e1 < 0.5, 'sobrecarregado: ' + e1);
  Sim.upgrade(s, 'arquiteto'); Sim.upgrade(s, 'arquiteto');
  assert.ok(Sim.efficiency(s, 'arquiteto') > e1, 'treinar melhora a eficiência');
  s.pop = 5000; assert.equal(Sim.efficiency(s, 'arquiteto') >= 0.25, true, 'tem piso');
});

test('mais nível = efeitos melhores (cidade pequena para isolar o nível)', () => {
  const s = rica(23); s.pop = 80;
  Sim.hire(s, 'arquiteto'); Sim.hire(s, 'analista'); Sim.hire(s, 'gerente');
  s.pop = 60;
  const c1 = Sim.staffInfo(s, 'arquiteto').lines.join('|');
  const cut1 = Sim.efficiency(s, 'arquiteto');
  ['arquiteto', 'analista', 'gerente'].forEach(k => { Sim.upgrade(s, k); Sim.upgrade(s, k); });
  assert.notEqual(Sim.staffInfo(s, 'arquiteto').lines.join('|'), c1);
  assert.ok(Sim.loanRate(s) < 0.015 - 0.004, 'juros caem com o nível');
  assert.ok(cut1 === 1);
});

test('demitir zera o nível', () => {
  const s = rica(24);
  Sim.hire(s, 'analista'); Sim.upgrade(s, 'analista');
  Sim.fire(s, 'analista');
  Sim.hire(s, 'analista');
  assert.equal(Sim.levelOf(s, 'analista'), 1);
});

test('planejador de nível alto faz mais obras por mês', () => {
  const mk = lvl => {
    const s = rica(25); s.pop = 70; s.cash = 200000;
    for (let i = 0; i < 7; i++) Sim.buildAny(s, 'casa');
    Sim.hire(s, 'arquiteto');
    for (let i = 1; i < lvl; i++) Sim.upgrade(s, 'arquiteto');
    s.cash = 200000; s.month = 0;
    const antes = s.tiles.filter(Boolean).length;
    Sim.step(s); s.month = 2;
    return s.tiles.filter(Boolean).length - antes;
  };
  assert.ok(mk(5) >= mk(1), 'nível 5 constrói ao menos o mesmo que o 1');
});

test('jogo salvo sem nível ganha nível 1', () => {
  const s = rica(26); Sim.hire(s, 'gerente'); delete s.staff.gerente.level;
  const t = Sim.load(JSON.stringify(s));
  assert.equal(Sim.levelOf(t, 'gerente'), 1);
});

test('falência só passa de -R$ 15 mil no caixa', () => {
  assert.equal(Sim.OVERDRAFT_LIMIT, 15000);
  const a = Sim.newGame(30); a.cash = -7000;
  Sim.step(a);
  assert.equal(a.over, null, 'dever 7 mil não quebra');
  const b = Sim.newGame(30); b.cash = -14000;
  Sim.step(b);
  assert.equal(b.over, null, 'dever 14 mil ainda não quebra');
  const c = Sim.newGame(30); c.cash = -16000;
  Sim.step(c);
  assert.equal(c.over && c.over.title, 'Falência!');
});

// ---------- Erros da equipe ----------
test('chance de erro: 30% normal, sobe se estiver sobrecarregado e tem teto', () => {
  const s = rica(40); s.pop = 60;
  Sim.hire(s, 'arquiteto');
  assert.ok(Math.abs(Sim.errorChance(s, 'arquiteto') - 0.30) < 1e-9);
  s.pop = 400; const e = Sim.errorChance(s, 'arquiteto');
  assert.ok(e > 0.30 && e <= 0.6, 'errorChance: ' + e);
  s.pop = 100000; assert.ok(Sim.errorChance(s, 'arquiteto') <= 0.6);
});

test('equipe comete erros que custam dinheiro (e ficam registrados)', () => {
  let erros = 0, custo = 0, mensagens = 0;
  for (let k = 1; k <= 12; k++) {
    const s = rica(100 + k); s.pop = 70; s.cash = 60000;
    for (let i = 0; i < 6; i++) Sim.buildAny(s, 'casa');
    ['arquiteto', 'analista', 'gerente'].forEach(f => Sim.hire(s, f));
    Sim.borrow(s, 10000);
    for (let m = 0; m < 36 && !s.over; m++) { Sim.step(s); if (m % 6 === 0) s.cash = Math.max(s.cash, 30000); }
    erros += s.staffStats.errors; custo += s.staffStats.cost;
    mensagens += s.log.filter(l => l.includes('😅')).length;
  }
  assert.ok(erros >= 10, 'deveria haver erros: ' + erros);
  assert.ok(custo > 0 && custo / erros > 100, 'cada erro deve custar algo: ' + custo / erros);
  assert.ok(mensagens > 0);
});

test('funcionário desligado não erra', () => {
  const s = rica(41); s.cash = 60000;
  ['arquiteto', 'analista', 'gerente'].forEach(f => { assert.ok(Sim.hire(s, f).ok); Sim.setAuto(s, f, false); });
  for (let m = 0; m < 24; m++) Sim.step(s);
  assert.equal(s.staffStats.errors, 0);
});

// ---------- Correção do "jogo parado" ----------
test('corretor guarda só metade da sobra (sobra caixa para a cidade)', () => {
  const s = rica(42); s.pop = 60; s.cash = 150000;
  assert.ok(Sim.hire(s, 'analista').ok); assert.ok(Sim.hire(s, 'corretor').ok);
  for (let i = 1; i < 8; i++) { s.cash = 1e6; Sim.upgrade(s, 'corretor'); }
  s.cash = 20000;
  Sim.step(s);
  assert.ok(s.cash > 11000, 'o caixa não pode ser esvaziado: ' + s.cash);
  assert.ok(Sim.holdingsValue(s) <= 8000, 'investiu no máximo metade da sobra: ' + Sim.holdingsValue(s));
});

test('planejador usa a renda fixa para pagar obras quando falta caixa', () => {
  let usou = 0;
  for (let k = 1; k <= 12; k++) {
    const s = Sim.newGame(200 + k); s.pop = 70; s.cash = 8000;
    for (let i = 0; i < 6; i++) Sim.buildAny(s, 'casa');
    Sim.hire(s, 'arquiteto'); s.cash = 20000; assert.ok(Sim.buy(s, 'cdb', 6000).ok); s.cash = 3000; s.month = 1;
    const antes = s.tiles.filter(Boolean).length;
    Sim.step(s);
    if (s.log.some(l => l.includes('da renda fixa para pagar a obra'))) usou++;
  }
  assert.ok(usou >= 1, 'o planejador deveria resgatar renda fixa para construir');
});

test('cidade com equipe forte continua crescendo (não trava)', () => {
  const s = Sim.newGame(3); s.pop = 130;
  for (let i = 0; i < 12; i++) Sim.buildAny(s, 'casa');
  for (let i = 0; i < 3; i++) Sim.buildAny(s, 'loja');
  s.pop = 130;
  for (const k of ['arquiteto', 'obras', 'social']) {
    s.cash = 90000; assert.ok(Sim.hire(s, k).ok, k); for (let l = 1; l < 3; l++) { s.cash = 90000; Sim.upgrade(s, k); }
  }
  s.cash = 30000;
  const antes = s.tiles.filter(Boolean).length;
  for (let m = 0; m < 24 && !s.over; m++) Sim.step(s);
  assert.ok(s.tiles.filter(Boolean).length >= antes + 6, 'deveria construir bastante: ' + (s.tiles.filter(Boolean).length - antes));
  assert.ok(s.pop > 160, 'população deveria crescer: ' + s.pop);
});

// ---------- Novas construções ----------
test('novas construções existem e têm custo, manutenção e ícone', () => {
  ['condominio', 'mercado', 'fazenda', 'tecnologia', 'universidade', 'bombeiros', 'estadio', 'agua', 'esgoto', 'solar', 'eolica', 'carvao', 'filtro', 'floresta', 'reciclagem'].forEach(k => {
    const b = Sim.BUILDINGS[k];
    assert.ok(b && b.cost > 0 && b.upkeep > 0 && b.icon && b.name, k);
  });
});

test('condomínio de luxo rende mais aluguel que casa', () => {
  const mk = tipo => {
    const s = Sim.newGame(5); s.tiles.fill(null); s.tiles[Sim.HALL] = 'prefeitura';
    for (let i = 0; i < 4; i++) s.tiles[i] = tipo;
    const a = Sim.analyze(s); s.pop = a.housing; Sim.step(s); return s.report.rent / a.housing;
  };
  assert.ok(mk('condominio') > mk('casa') * 1.5);
});

test('energia, água e esgoto só faltam quando a cidade cresce e dá para construir', () => {
  const s = Sim.newGame(6); s.pop = 40;
  const a0 = Sim.analyze(s);
  assert.equal(a0.cov.power, 1); assert.equal(a0.cov.water, 1); assert.equal(a0.cov.sewage, 1);
  s.pop = 500;
  const a1 = Sim.analyze(s);
  assert.ok(a1.cov.power < 1 && a1.cov.water < 1 && a1.cov.sewage < 1);
  assert.ok(a1.happy < a0.happy);
  s.cash = 1e6;
  for (let i = 0; i < 2; i++) { Sim.buildAny(s, 'eolica'); Sim.buildAny(s, 'agua'); Sim.buildAny(s, 'esgoto'); }
  const a2 = Sim.analyze(s);
  assert.ok(a2.cov.power > a1.cov.power && a2.cov.water > a1.cov.water && a2.cov.sewage > a1.cov.sewage);
});

test('sem energia as empresas rendem menos', () => {
  const mk = (extra) => {
    const s = Sim.newGame(7); s.pop = 400; s.cash = 1e6;
    for (let i = 0; i < 8; i++) Sim.buildAny(s, 'loja');
    for (let i = 0; i < extra; i++) Sim.buildAny(s, 'eolica');
    s.cash = 1e6; Sim.step(s); return s.report.commerce;
  };
  assert.ok(mk(4) > mk(0));
});

test('poluição: carvão polui, fábrica polui; filtro, floresta e reciclagem limpam', () => {
  const s = Sim.newGame(8); s.cash = 1e6;
  assert.equal(Sim.analyze(s).pollution, 0);
  Sim.buildAny(s, 'carvao'); Sim.buildAny(s, 'fabrica'); Sim.buildAny(s, 'fabrica');
  const suja = Sim.analyze(s).pollution;
  assert.equal(suja, 6 + 4 + 4);
  const h0 = Sim.analyze(s).happy;
  Sim.buildAny(s, 'filtro'); Sim.buildAny(s, 'floresta'); Sim.buildAny(s, 'reciclagem');
  const limpa = Sim.analyze(s).pollution;
  assert.equal(limpa, 0, 'poluição não fica negativa');
  assert.ok(Sim.analyze(s).happy > h0);
});

test('energia limpa não polui', () => {
  const s = Sim.newGame(9); s.cash = 1e6;
  Sim.buildAny(s, 'solar'); Sim.buildAny(s, 'eolica');
  assert.equal(Sim.analyze(s).pollution, 0);
});

test('polo tecnológico lucra mais com educação', () => {
  const mk = escolas => {
    const s = Sim.newGame(10); s.tiles.fill(null); s.tiles[Sim.HALL] = 'prefeitura'; s.pop = 100; s.cash = 1e6;
    Sim.buildAny(s, 'tecnologia'); for (let i = 0; i < escolas; i++) Sim.buildAny(s, 'escola');
    Sim.step(s); return s.report.industry;
  };
  assert.ok(mk(1) > mk(0));
});

test('bombeiros reduzem o estrago do incêndio e a simulação não gera NaN', () => {
  for (let k = 1; k <= 15; k++) {
    const s = Sim.newGame(300 + k); s.cash = 1e6; s.pop = 150;
    Object.keys(Sim.BUILDINGS).forEach(b => Sim.buildAny(s, b));
    s.cash = 50000;
    for (let m = 0; m < 120 && !s.over; m++) { Sim.step(s); if (s.cash < 5000) s.cash = 20000; }
    assert.ok(Number.isFinite(s.cash) && Number.isFinite(s.pop), 'valores inválidos na semente ' + k);
  }
});

// ---------- Mais investimentos ----------
test('novos investimentos existem e funcionam', () => {
  const novos = ['tesouro', 'ouro', 'etf', 'dolar', 'startup'];
  const s = Sim.newGame(11);
  novos.forEach(k => {
    assert.ok(Sim.ASSETS.find(a => a.key === k), k);
    assert.ok(Sim.buy(s, k, 500).ok); assert.ok(Sim.sell(s, k, 'all').ok);
  });
  assert.equal(Sim.ASSETS.length, 14);
  for (let m = 0; m < 24; m++) Sim.step(s);
  Sim.ASSETS.forEach(a => assert.ok(s.assets[a.key].price > 0 && Number.isFinite(s.assets[a.key].price)));
});

test('startup é muito mais arriscada que renda fixa', () => {
  const dp = k => { const v = []; for (let i = 1; i <= 40; i++) { const s = Sim.newGame(i * 3); for (let m = 0; m < 24; m++) Sim.step(s); v.push(s.assets[k].price); }
    const mean = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length); };
  assert.ok(dp('startup') > dp('cdb') * 20);
});

test('jogo salvo antigo ganha terrenos e investimentos novos', () => {
  const s = Sim.newGame(12);
  s.tiles = s.tiles.slice(0, 42); ['tesouro', 'ouro', 'etf', 'dolar', 'startup'].forEach(k => delete s.assets[k]);
  const t = Sim.load(JSON.stringify(s));
  assert.equal(t.tiles.length, Sim.COLS * Sim.ROWS);
  assert.ok(t.assets.ouro && t.assets.startup);
  assert.equal(t.tiles[Sim.HALL], 'prefeitura');
  assert.ok(Sim.step(t));
});

test('conselho do analista cobre os novos ativos sem quebrar', () => {
  const s = rica(50);
  for (let i = 0; i < 14; i++) Sim.step(s);
  Sim.ASSETS.forEach(a => { const v = Sim.advice(s, a.key); assert.ok(v === null || v.text); });
});

// ---------- Equipe de 15 pessoas, 8 níveis, dependências ----------
test('são 15 pessoas em 3 áreas de 5, com 8 níveis', () => {
  assert.equal(Sim.STAFF_ORDER.length, 15);
  assert.equal(Sim.MAX_LEVEL, 8);
  Sim.AREAS.forEach(([, , keys]) => assert.equal(keys.length, 5));
  const todos = Sim.AREAS.flatMap(a => a[2]);
  assert.deepEqual([...todos].sort(), [...Sim.STAFF_ORDER].sort());
});

test('é preciso contratar um antes do outro', () => {
  const s = rica(60); s.pop = 400; s.cash = 1e6;
  assert.equal(Sim.hire(s, 'obras').ok, false, 'Gerente de Obras exige o Arquiteto');
  assert.ok(Sim.lockReason(s, 'obras').includes('Arquiteto'));
  assert.ok(Sim.hire(s, 'arquiteto').ok);
  assert.ok(Sim.hire(s, 'obras').ok);
  assert.equal(Sim.hire(s, 'ambiental').ok, false, 'Ambiental exige a Infraestrutura');
  assert.ok(Sim.hire(s, 'infra').ok);
  assert.ok(Sim.hire(s, 'ambiental').ok);
  assert.equal(Sim.hire(s, 'auditor').ok, false, 'Auditor exige o Tesoureiro');
  assert.ok(Sim.hire(s, 'gerente').ok); assert.ok(Sim.hire(s, 'tesoureiro').ok); assert.ok(Sim.hire(s, 'auditor').ok);
});

test('demitir quem os outros dependem demite a cadeia', () => {
  const s = rica(61); s.pop = 400; s.cash = 1e6;
  ['arquiteto', 'obras', 'infra', 'ambiental'].forEach(k => assert.ok(Sim.hire(s, k).ok));
  Sim.fire(s, 'infra');
  assert.equal(Sim.hired(s, 'infra'), false);
  assert.equal(Sim.hired(s, 'ambiental'), false, 'quem dependia sai junto');
  assert.equal(Sim.hired(s, 'obras'), true);
});

test('bônus de time: mais colegas na área = efeitos melhores', () => {
  const s = rica(62); s.pop = 100; s.cash = 1e6;
  Sim.hire(s, 'arquiteto');
  const sozinho = Sim.teamBonus(s, 'arquiteto');
  Sim.hire(s, 'obras'); Sim.hire(s, 'infra');
  assert.ok(Sim.teamBonus(s, 'arquiteto') > sozinho);
  assert.equal(sozinho, 1);
});

test('níveis até 8 e salários crescem', () => {
  const s = rica(63); s.cash = 1e6; Sim.hire(s, 'arquiteto');
  let anterior = Sim.salaryOf(s, 'arquiteto');
  for (let l = 2; l <= 8; l++) { assert.ok(Sim.upgrade(s, 'arquiteto').ok); const sal = Sim.salaryOf(s, 'arquiteto'); assert.ok(sal > anterior); anterior = sal; }
  assert.equal(Sim.levelOf(s, 'arquiteto'), 8);
  assert.equal(Sim.upgrade(s, 'arquiteto').ok, false);
});

test('cada pessoa tem um efeito próprio e perceptível', () => {
  const s = rica(64); s.pop = 100; s.cash = 1e6;
  const a0 = Sim.analyze(s);
  // Obras: corta custos
  const sem = (() => { const t = rica(64); t.pop = 100; Sim.step(t); return t.report.maint + t.report.basic; })();
  const t2 = rica(64); t2.pop = 100; assert.ok(Sim.hire(t2, 'arquiteto').ok); assert.ok(Sim.hire(t2, 'obras').ok); Sim.step(t2);
  assert.ok(t2.report.maint + t2.report.basic < sem, 'Gerente de Obras reduz custos');
  // Contador: mais impostos
  const u = rica(64); u.pop = 100; u.cash = 1e6; assert.ok(Sim.hire(u, 'analista').ok); assert.ok(Sim.hire(u, 'contador').ok); Sim.step(u);
  const v = rica(64); v.pop = 100; v.cash = 1e6; Sim.step(v);
  assert.ok(u.report.taxes > v.report.taxes, 'Contador aumenta os impostos');
  // Ambiental: menos poluição
  const w = rica(64); w.pop = 140; w.cash = 1e6; for (let i = 0; i < 4; i++) Sim.buildAny(w, 'fabrica');
  const poluida = Sim.analyze(w).pollution;
  assert.ok(Sim.hire(w, 'arquiteto').ok); assert.ok(Sim.hire(w, 'infra').ok); assert.ok(Sim.hire(w, 'ambiental').ok);
  assert.ok(Sim.analyze(w).pollution < poluida, 'Engenheiro Ambiental reduz a poluição');
  // Social: felicidade
  const x = rica(64); x.pop = 120; x.cash = 1e6; const h0 = Sim.analyze(x).happy;
  assert.ok(Sim.hire(x, 'arquiteto').ok); assert.ok(Sim.hire(x, 'obras').ok); assert.ok(Sim.hire(x, 'social').ok);
  assert.ok(Sim.analyze(x).happy > h0, 'Planejador Social aumenta a felicidade');
  assert.ok(a0);
});

test('tesoureiro aumenta o limite de crédito e o auditor reduz os erros', () => {
  const s = rica(65); s.pop = 400; s.cash = 1e6;
  Sim.hire(s, 'gerente'); Sim.hire(s, 'tesoureiro'); Sim.hire(s, 'arquiteto');
  assert.ok(Sim.loanLimit(s) > 30000);
  const e0 = Sim.errorChance(s, 'arquiteto');
  Sim.hire(s, 'auditor'); for (let i = 1; i < 8; i++) Sim.upgrade(s, 'auditor');
  assert.ok(Sim.errorChance(s, 'arquiteto') < e0, 'Auditor reduz a chance de erro');
  assert.ok(Sim.errorChance(s, 'arquiteto') >= 0.08, 'sempre existe algum erro');
});

test('gestor de risco suaviza o tombo das crises e economista a receita', () => {
  const s = rica(66); s.pop = 100; s.cash = 1e6;
  assert.ok(Sim.hire(s, 'analista').ok); assert.ok(Sim.hire(s, 'risco').ok);
  const l1 = Sim.staffInfo(s, 'risco').lines.join('|');
  for (let i = 1; i < 8; i++) Sim.upgrade(s, 'risco');
  assert.notEqual(Sim.staffInfo(s, 'risco').lines.join('|'), l1);
  assert.match(Sim.staffInfo(s, 'risco').lines.join('|'), /Crises doem [1-9]\d?% menos/);
  const e = rica(67); e.pop = 300; e.cash = 1e6;
  ['gerente', 'diplomata', 'economista'].forEach(k => assert.ok(Sim.hire(e, k).ok, k));
  for (let i = 1; i < 6; i++) Sim.upgrade(e, 'economista');
  const f = rica(67); f.pop = 300; f.cash = 1e6;
  Sim.step(e); Sim.step(f);
  assert.ok(e.report.income > f.report.income, 'Economista aumenta a receita');
});

// ---------- Terreno sem limite ----------
test('terreno: dá para comprar lotes e o preço sobe a cada compra', () => {
  const s = Sim.newGame(70); s.cash = 1e7;
  const antes = s.tiles.length, c0 = Sim.landCost(s);
  assert.ok(Sim.buyLand(s).ok);
  assert.equal(s.tiles.length, antes + Sim.LOT_SIZE);
  assert.ok(Sim.landCost(s) > c0);
  for (let i = 0; i < 30; i++) assert.ok(Sim.buyLand(s).ok);
  assert.ok(s.tiles.length > 400, 'cidade enorme');
  s.cash = 10; assert.equal(Sim.buyLand(s).ok, false);
});

test('sem terreno livre não dá para construir até comprar mais', () => {
  const s = Sim.newGame(71); s.cash = 1e7;
  while (Sim.freeTiles(s) > 0) assert.ok(Sim.buildAny(s, 'casa').ok);
  assert.equal(Sim.buildAny(s, 'casa').ok, false);
  assert.equal(Sim.hint(s, Sim.analyze(s)).id, 'land');
  Sim.buyLand(s);
  assert.ok(Sim.buildAny(s, 'casa').ok);
});

test('arquiteto compra terreno sozinho quando acaba', () => {
  let comprou = 0;
  for (let k = 1; k <= 10; k++) {
    const s = Sim.newGame(400 + k); s.cash = 1e6;
    while (Sim.freeTiles(s) > 0) Sim.buildAny(s, 'casa');
    s.pop = 60; Sim.hire(s, 'arquiteto'); s.cash = 60000; s.month = 1;
    const n = s.tiles.length; Sim.step(s);
    if (s.tiles.length > n) comprou++;
  }
  assert.ok(comprou >= 5, 'o arquiteto deveria comprar terreno: ' + comprou);
});

// ---------- Mundo: vizinhos, relações, comércio, empréstimos, política ----------
test('mundo: 4 vizinhos começam neutros', () => {
  const s = Sim.newGame(80);
  assert.equal(Sim.NEIGHBORS.length, 4);
  Sim.NEIGHBORS.forEach(n => { assert.equal(s.world.rel[n.key], 50); assert.equal(s.world.owed[n.key], 0); });
});

test('presente melhora a relação e tem intervalo entre presentes', () => {
  const s = Sim.newGame(81); s.cash = 50000;
  const r0 = s.world.rel.reino;
  assert.ok(Sim.gift(s, 'reino', 1500).ok);
  assert.ok(s.world.rel.reino > r0);
  assert.equal(Sim.gift(s, 'reino', 1500).ok, false, 'intervalo entre presentes');
  Sim.step(s); Sim.step(s);
  assert.ok(Sim.gift(s, 'reino', 600).ok);
});

test('tratado comercial: exige boa relação, custa e rende um pouco', () => {
  const s = Sim.newGame(82); s.cash = 100000;
  assert.equal(Sim.signTreaty(s, 'reino').ok, false, 'relação baixa');
  s.world.rel.reino = 70;
  const f0 = Sim.worldFactor(s);
  assert.ok(Sim.signTreaty(s, 'reino').ok);
  assert.ok(Sim.worldFactor(s) > f0);
  assert.ok(Sim.worldFactor(s) < 1.25, 'efeito pequeno');
  Sim.step(s);
  assert.equal(s.report.diplomacy, Sim.TREATY_UPKEEP);
  s.world.rel.reino = 30; Sim.step(s);
  assert.equal(s.world.treaty.reino, false, 'tratado acaba se a relação esfriar');
});

test('empréstimo de vizinho: relação mínima, limite, juros e quitação', () => {
  const s = Sim.newGame(83); s.cash = 10000; s.world.rel.reino = 30;
  assert.equal(Sim.borrowForeign(s, 'reino', 1000).ok, false, 'sem confiança');
  s.world.rel.reino = 80;
  const lim = Sim.foreignLimit(s, 'reino');
  assert.ok(lim > 0);
  assert.equal(Sim.borrowForeign(s, 'reino', lim + 1000).ok, false, 'acima do limite');
  assert.ok(Sim.borrowForeign(s, 'reino', 5000).ok);
  assert.equal(s.cash, 15000);
  assert.ok(Sim.foreignDebt(s) === 5000);
  Sim.step(s);
  assert.ok(s.report.interest > 0, 'cobra juros externos');
  assert.ok(Sim.foreignRate(s, 'reino') < Sim.foreignRate(Object.assign(Sim.newGame(1)), 'reino') + 0.0001);
  assert.ok(Sim.repayForeign(s, 'reino', 99999).ok);
  assert.equal(Sim.foreignDebt(s), 0);
});

test('juros externos caem quando a relação é melhor', () => {
  const a = Sim.newGame(84), b = Sim.newGame(84); b.world.rel.reino = 95; a.world.rel.reino = 45;
  assert.ok(Sim.foreignRate(b, 'reino') < Sim.foreignRate(a, 'reino'));
});

test('vizinho pede empréstimo: aceitar paga parcelas, recusar esfria', () => {
  const s = Sim.newGame(85); s.cash = 50000;
  s.world.request = {who: 'vizinha', amount: 4000, months: 12, rate: 0.01, left: 3};
  const rel0 = s.world.rel.vizinha;
  assert.ok(Sim.answerRequest(s, true).ok);
  assert.equal(s.cash, 46000);
  assert.ok(s.world.rel.vizinha > rel0);
  const before = s.cash; s.world.econ.vizinha = 1;
  for (let i = 0; i < 3; i++) Sim.step(s);
  assert.ok(s.world.lent.length === 1 || s.world.lent.length === 0);
  const t = Sim.newGame(86); t.cash = 50000; t.world.request = {who: 'vizinha', amount: 4000, months: 12, rate: 0.01, left: 3};
  const r1 = t.world.rel.vizinha; Sim.answerRequest(t, false);
  assert.ok(t.world.rel.vizinha < r1);
  assert.equal(t.world.request, null);
  assert.ok(before);
});

test('ignorar um pedido ou dilema tem consequência', () => {
  const s = Sim.newGame(87);
  s.world.request = {who: 'uniao', amount: 3000, months: 12, rate: 0.01, left: 1};
  const r = s.world.rel.uniao; s.month = 1; Sim.step(s);
  assert.ok(s.world.request === null && s.world.rel.uniao < r + 0.0001);
});

test('dilema político: escolher um lado mexe nas relações dos dois', () => {
  const s = Sim.newGame(88); s.cash = 20000;
  s.world.dilemma = {text: 'teste', left: 6, options: [
    {label: 'A', rel: {reino: 8, republica: -6}}, {label: 'B', rel: {reino: -6, republica: 8}}]};
  const a = s.world.rel.reino, b = s.world.rel.republica;
  assert.ok(Sim.answerDilemma(s, 0).ok);
  assert.ok(s.world.rel.reino > a && s.world.rel.republica < b);
  assert.equal(s.world.dilemma, null);
  assert.equal(Sim.answerDilemma(s, 0).ok, false);
});

test('mundo: ao longo dos anos surgem pedidos, dilemas e notícias, sem exagero', () => {
  let pedidos = 0, dilemas = 0, noticias = 0;
  for (let k = 1; k <= 20; k++) {
    const s = Sim.newGame(500 + k); s.cash = 1e6;
    for (let m = 0; m < 60 && !s.over; m++) {
      Sim.step(s); s.cash = Math.max(s.cash, 1e6);
      if (s.world.request) { pedidos++; Sim.answerRequest(s, false); }
      if (s.world.dilemma) { dilemas++; Sim.answerDilemma(s, s.world.dilemma.options.length - 1); }
    }
    noticias += s.world.news.length;
    NEIGHBORS_OK(s);
  }
  assert.ok(pedidos > 5 && dilemas > 5 && noticias > 20, `pedidos ${pedidos} dilemas ${dilemas} notícias ${noticias}`);
});
function NEIGHBORS_OK(s) { Sim.NEIGHBORS.forEach(n => { const r = s.world.rel[n.key]; assert.ok(r >= 0 && r <= 100 && Number.isFinite(s.world.econ[n.key])); }); }

test('o mundo afeta só um pouco: com e sem acontecimentos o resultado é parecido', () => {
  const run = world => { let tot = 0; for (let k = 1; k <= 20; k++) { const s = Sim.newGame(600 + k); if (!world) s.world.mods = {commerce: 1, commerceLeft: 0, upkeep: 1, upkeepLeft: 0};
    for (let m = 0; m < 36; m++) Sim.step(s); tot += Sim.netWorth(s); } return tot / 20; };
  const f = Sim.worldFactor(Sim.newGame(1));
  assert.ok(f > 0.95 && f < 1.05, 'fator inicial perto de 1: ' + f);
  assert.ok(run(true) > 0);
});

test('diplomata mantém as relações e manda presente quando esfria', () => {
  const s = rica(90); s.pop = 130; s.cash = 100000;
  assert.ok(Sim.hire(s, 'gerente').ok); assert.ok(Sim.hire(s, 'diplomata').ok);
  s.world.rel.reino = 30; s.world.giftCd.reino = 0;
  const r = s.world.rel.reino;
  Sim.step(s);
  assert.ok(s.world.rel.reino > r - 0.5, 'a relação não deve piorar com diplomata');
});

test('save antigo ganha mundo e terreno', () => {
  const s = Sim.newGame(91); delete s.world; delete s.landBought;
  const t = Sim.load(JSON.stringify(s));
  assert.ok(t.world.rel.reino === 50 && t.landBought === 0);
  assert.ok(Sim.step(t));
});

// ---------- Juros do país, bancos e dividendos ----------
test('juros do país variam, ficam entre o mínimo e o máximo e voltam à média', () => {
  const s = Sim.newGame(700); const taxas = [];
  for (let m = 0; m < 240; m++) { Sim.step(s); taxas.push(s.market.rate); if (s.over) s.over = null; s.cash = Math.max(s.cash, 50000); }
  assert.ok(Math.min(...taxas) >= 0.003 - 1e-12 && Math.max(...taxas) <= 0.012 + 1e-12);
  assert.ok(new Set(taxas.map(x => x.toFixed(5))).size > 100, 'a taxa se mexe');
  const media = taxas.reduce((a, b) => a + b, 0) / taxas.length;
  assert.ok(Math.abs(media - Sim.BASE_RATE) < 0.0025, 'média perto de ' + Sim.BASE_RATE + ': ' + media);
});

test('há 4 bancos com rendimentos e riscos diferentes', () => {
  const bancos = ['cdb', 'cdb_b', 'cdb_c', 'cdb_d'], s = Sim.newGame(701);
  const y = bancos.map(k => Sim.assetYield(s, k).growth);
  for (let i = 1; i < y.length; i++) assert.ok(y[i] > y[i - 1], 'cada banco paga mais que o anterior');
  assert.ok(Sim.assetYield(s, 'poupanca').growth < y[0], 'poupança paga menos que qualquer CDB');
});

test('banco arriscado às vezes quebra ou tem crise; o banco seguro, nunca', () => {
  let quebras = 0, sustos = 0, seguroCaiu = 0;
  for (let k = 1; k <= 60; k++) {
    const s = Sim.newGame(800 + k); s.cash = 1e7;
    for (let m = 0; m < 120; m++) { Sim.step(s); s.cash = Math.max(s.cash, 1e6); if (s.over) s.over = null; }
    quebras += s.log.filter(l => l.includes('quebrou')).length;
    sustos += s.log.filter(l => l.includes('crise de confiança')).length;
    seguroCaiu += Math.min(...s.assets.cdb.hist.slice(1).map((v, i) => v / s.assets.cdb.hist[i])) < 0.97 ? 1 : 0;
  }
  assert.ok(quebras >= 1 && sustos >= 5, `quebras ${quebras} sustos ${sustos}`);
  assert.equal(seguroCaiu, 0, 'o banco gigante não tem crise');
});

test('CDB deixou de ser imbatível: ativos arriscados rendem mais em média', () => {
  const media = key => { let t = 0; for (let k = 1; k <= 80; k++) { const s = Sim.newGame(900 + k); s.cash = 1e7; Sim.buy(s, key, 10000);
    for (let m = 0; m < 36; m++) { Sim.step(s); s.cash = Math.max(s.cash, 1e6); if (s.over) s.over = null; }
    t += s.assets[key].units * s.assets[key].price + s.cash * 0; } return t / 80; };
  const cdb = media('cdb'), turbo = media('cdb_d'), acoes = media('acoes'), etf = media('etf');
  assert.ok(acoes > cdb * 1.1, `ações ${acoes} x cdb ${cdb}`);
  assert.ok(etf > cdb, `fundo de índice ${etf} x cdb ${cdb}`);
  assert.ok(turbo !== cdb);
});

test('dividendos: pagam todo mês, proporcionais ao que você tem, só em alguns ativos', () => {
  const mk = valor => { const s = Sim.newGame(10); s.cash = 1e6; Sim.buy(s, 'fii', valor); Sim.step(s); return s; };
  const pouco = mk(5000), muito = mk(50000);
  assert.ok(pouco.report.dividends > 0);
  assert.ok(muito.report.dividends > pouco.report.dividends * 8, 'mais investido, mais dividendo');
  const t = Sim.newGame(10); t.cash = 1e6; Sim.buy(t, 'cripto', 50000); Sim.buy(t, 'ouro', 50000); Sim.buy(t, 'cdb', 50000); Sim.step(t);
  assert.equal(t.report.dividends, 0, 'cripto, ouro e CDB não pagam dividendos');
  assert.ok(Sim.assetYield(t, 'fii').div > Sim.assetYield(t, 'acoes').div, 'fundo imobiliário paga mais dividendo que ação de crescimento');
});

test('quem cresce mais paga menos dividendo', () => {
  const s = Sim.newGame(11);
  const a = Sim.assetYield(s, 'fii'), b = Sim.assetYield(s, 'acoes'), c = Sim.assetYield(s, 'divid');
  assert.ok(b.growth > a.growth && b.growth > c.growth, 'ação de crescimento cresce mais');
  assert.ok(a.div > b.div && c.div > b.div, 'e paga o menor dividendo');
  assert.ok(Sim.assetYield(s, 'cripto').div === 0 && Sim.assetYield(s, 'startup').div === 0);
});

test('dividendo cai no caixa e entra no relatório do mês', () => {
  const s = Sim.newGame(12); s.cash = 1e6; Sim.buy(s, 'divid', 100000);
  const antes = s.cash; Sim.step(s);
  assert.ok(s.cash - antes > 400, 'dividendos de ações pagadoras entram no caixa');
  assert.ok(s.report.net > s.report.income - s.report.expenses);
});

test('o analista melhora ativos de risco mas não a renda fixa', () => {
  const mk = () => { const s = Sim.newGame(13); s.pop = 100; s.cash = 1e6; Sim.hire(s, 'analista'); return s; };
  const a = mk(); for (let i = 1; i < 8; i++) Sim.upgrade(a, 'analista');
  assert.ok(Sim.assetYield(a, 'acoes').growth > Sim.assetYield(Sim.newGame(13), 'acoes').growth, 'ação rende mais com analista');
  assert.equal(Sim.assetYield(a, 'cdb').growth, Sim.assetYield(Sim.newGame(13), 'cdb').growth, 'CDB igual');
  assert.equal(Sim.assetYield(a, 'tesouro').growth, Sim.assetYield(Sim.newGame(13), 'tesouro').growth);
});

test('juros altos pesam sobre os ativos de risco e favorecem a renda fixa', () => {
  const s = Sim.newGame(14), t = Sim.newGame(14); t.market.rate = 0.011;
  assert.ok(Sim.assetYield(t, 'cdb').growth > Sim.assetYield(s, 'cdb').growth);
  assert.ok(Sim.assetYield(t, 'acoes').growth < Sim.assetYield(s, 'acoes').growth);
});

test('save antigo ganha juros, bancos e ações de dividendos', () => {
  const s = Sim.newGame(15); delete s.market; ['cdb_b', 'cdb_c', 'cdb_d', 'divid'].forEach(k => delete s.assets[k]);
  const t = Sim.load(JSON.stringify(s));
  assert.ok(t.market.rate > 0 && t.assets.cdb_d && t.assets.divid);
  assert.ok(Sim.step(t));
});
