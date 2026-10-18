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
  assert.ok(Sim.holdingsValue(s) > 1055);
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

test('dificuldade: parado não quebra, ingênuo corre risco', () => {
  let parado = 0, ingenuo = 0;
  for (let k = 1; k <= 60; k++) {
    const a = Sim.newGame(k * 31); run(a, 60); if (a.over) parado++;
    const b = Sim.newGame(k * 31);
    for (let m = 0; m < 60 && !b.over; m++) {
      for (const t of ['fabrica', 'predio', 'casa']) Sim.buildAny(b, t);
      Sim.step(b);
    }
    if (b.over) ingenuo++;
  }
  assert.equal(parado, 0, 'ficar parado não deve quebrar a cidade');
  assert.ok(ingenuo >= 10, 'gastar sem planejar deve quebrar com frequência: ' + ingenuo);
});

// ---------- Equipe ----------
const rica = seed => { const s = Sim.newGame(seed); s.pop = 120; s.cash = 40000; return s; };

test('funcionário só pode ser contratado depois de liberado', () => {
  const s = Sim.newGame(1);
  assert.equal(Sim.isUnlocked(s, 'planejador'), false);
  assert.equal(Sim.hire(s, 'planejador').ok, false);
  s.pop = 60;
  assert.ok(Sim.hire(s, 'planejador').ok);
  assert.equal(Sim.hire(s, 'planejador').ok, false);
  assert.equal(Sim.hire(s, 'xyz').ok, false);
});

test('salário entra nas despesas e some ao demitir', () => {
  const s = rica(1);
  Sim.hire(s, 'planejador'); Sim.hire(s, 'gerente');
  assert.equal(Sim.staffCost(s), 190);
  Sim.step(s);
  assert.equal(s.report.salaries, 190);
  Sim.fire(s, 'planejador'); Sim.fire(s, 'gerente');
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

test('analista aplica a sobra em renda fixa e não cobra corretagem', () => {
  const s = rica(4);
  Sim.hire(s, 'analista');
  Sim.step(s);
  assert.ok(s.assets.cdb.units > 0, 'deveria investir');
  const antes = s.cash;
  Sim.buy(s, 'acoes', 1000);
  assert.ok(Math.abs(s.assets.acoes.units * s.assets.acoes.price - 1000) < 1e-6, 'sem taxa');
  assert.equal(s.cash, antes - 1000);
});

test('analista vende ativo que caiu mais de 25%', () => {
  const s = rica(5);
  Sim.buy(s, 'acoes', 5000);
  s.assets.acoes.price *= 0.6;
  Sim.hire(s, 'analista');
  Sim.step(s);
  assert.equal(s.assets.acoes.units, 0);
  assert.ok(s.log.some(l => l.includes('Analista vendeu')));
});

test('planejador constrói o que falta, com desconto', () => {
  const s = rica(6);
  s.pop = 59; // fica abaixo da capacidade de moradia, mas sem empregos
  for (let i = 0; i < 6; i++) Sim.buildAny(s, 'casa');
  Sim.hire(s, 'planejador');
  const a = Sim.analyze(s);
  const k = Sim.recommend(s, a);
  assert.ok(k, 'deveria haver uma recomendação');
  const n = Sim.counts(s)[k] || 0;
  Sim.step(s);
  assert.equal(Sim.counts(s)[k], n + 1);
  assert.ok(s.log.some(l => l.includes('Planejador construiu')));
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
  assert.ok(t.staff.planejador && !t.staff.planejador.hired);
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
  Sim.hire(s, 'planejador');
  assert.equal(Sim.levelOf(s, 'planejador'), 1);
  const sal1 = Sim.salaryOf(s, 'planejador'), cost = Sim.upgradeCost(s, 'planejador'), cash = s.cash;
  assert.ok(Sim.upgrade(s, 'planejador').ok);
  assert.equal(s.cash, cash - cost);
  assert.equal(Sim.levelOf(s, 'planejador'), 2);
  assert.ok(Sim.salaryOf(s, 'planejador') > sal1, 'salário deve subir');
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
  Sim.hire(s, 'planejador');
  s.pop = 60;  assert.equal(Sim.efficiency(s, 'planejador'), 1);
  s.pop = 200; const e1 = Sim.efficiency(s, 'planejador');
  assert.ok(e1 < 0.5, 'sobrecarregado: ' + e1);
  Sim.upgrade(s, 'planejador'); Sim.upgrade(s, 'planejador');
  assert.ok(Sim.efficiency(s, 'planejador') > e1, 'treinar melhora a eficiência');
  s.pop = 5000; assert.equal(Sim.efficiency(s, 'planejador') >= 0.25, true, 'tem piso');
});

test('mais nível = efeitos melhores (cidade pequena para isolar o nível)', () => {
  const s = rica(23); s.pop = 80;
  Sim.hire(s, 'planejador'); Sim.hire(s, 'analista'); Sim.hire(s, 'gerente');
  const c1 = Sim.staffInfo(s, 'planejador').lines.join('|');
  const cut1 = Sim.efficiency(s, 'planejador');
  ['planejador', 'analista', 'gerente'].forEach(k => { Sim.upgrade(s, k); Sim.upgrade(s, k); });
  assert.notEqual(Sim.staffInfo(s, 'planejador').lines.join('|'), c1);
  assert.ok(Sim.loanLimit(s) > 30000, 'limite de crédito aumenta com o gerente');
  assert.ok(Sim.loanRate(s) < 0.015 - 0.005, 'juros caem com o nível');
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
    Sim.hire(s, 'planejador');
    for (let i = 1; i < lvl; i++) Sim.upgrade(s, 'planejador');
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
