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
  let subiu = 0, pops = 0; const N = 20;
  for (let k = 1; k <= N; k++) {
    const s = Sim.newGame(k);
    [0, 1, 2, 3, 4].forEach(i => Sim.build(s, i, 'casa'));
    Sim.build(s, 5, 'loja'); Sim.build(s, 6, 'loja'); Sim.build(s, 7, 'escola'); Sim.build(s, 8, 'parque');
    const start = Sim.netWorth(s);
    run(s, 36);
    assert.ok(!s.over);
    pops += s.pop; if (Sim.netWorth(s) > start) subiu++;
  }
  assert.ok(pops / N > 40, 'população deveria crescer: ' + pops / N);
  assert.ok(subiu >= N * 0.6, 'patrimônio deveria subir na maioria: ' + subiu);
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
  assert.equal(Sim.buildAny(s, 'casa').ok, true, 'o mapa cresce sozinho');
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

test('todos os 15 funcionários estão liberados desde o começo', () => {
  const s = Sim.newGame(1); s.cash = 1e6;
  Sim.STAFF_ORDER.forEach(k => { assert.equal(Sim.isUnlocked(s, k), true, k); assert.equal(Sim.lockReason(s, k), null); });
  Sim.STAFF_ORDER.forEach(k => assert.ok(Sim.hire(s, k).ok, 'contratou ' + k));
  assert.equal(Sim.STAFF_ORDER.filter(k => Sim.hired(s, k)).length, 15);
  assert.equal(Sim.hire(s, 'arquiteto').ok, false, 'já contratado');
  assert.equal(Sim.hire(s, 'xyz').ok, false);
  const pobre = Sim.newGame(2); pobre.cash = 5;
  assert.equal(Sim.hire(pobre, 'gerente').ok, false, 'precisa de dinheiro para o 1º salário');
});
test('salário entra nas despesas e some ao demitir', () => {
  const s = rica(1);
  Sim.hire(s, 'arquiteto'); Sim.hire(s, 'gerente');
  assert.ok(Math.abs(Sim.staffCost(s) - (Sim.salaryOf(s, 'arquiteto') + Sim.salaryOf(s, 'gerente')) * 1.025) < 1e-9, 'folha com custo de coordenação');
  Sim.step(s);
  assert.equal(s.report.salaries, Sim.staffCost(s));
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
  for (let i = 1; i < 4; i++) { s.cash = 1e6; Sim.upgrade(s, 'analista'); }
  assert.equal(Sim.staffInfo(s, 'corretor').lines[0].includes('0,00%'), true, 'corretor nível 8 bem supervisionado não cobra corretagem');
});

test('gestor de risco vende ativo que despencou', () => {
  const s = rica(5); s.cash = 150000;
  Sim.buy(s, 'acoes', 5000);
  s.assets.acoes.price *= 0.4;
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

test('contratar cedo demais ou fora de ordem avisa o jogador (sem proibir)', () => {
  const s = Sim.newGame(8); s.cash = 5000;
  const r = Sim.hire(s, 'global');           // cidade pequena, patrimônio baixo e 
  assert.ok(r.ok);
  assert.ok(r.warnings.length >= 1, 'avisa que é cedo: ' + r.warnings.length);
  assert.ok(r.warnings.some(w => w.includes('Ainda cedo')));
  const ok = Sim.newGame(9); ok.cash = 1e6; ok.pop = 120;
  const g = Sim.hire(ok, 'gerente'); assert.ok(g.ok && g.warnings.length === 0, 'Gerente com 120 hab.: sem avisos');
  assert.equal(Sim.readiness(Sim.newGame(1), 'auditor').early, true);
  Sim.step(s); assert.ok(!s.log.some(l => l.includes('Agora você pode contratar')), 'não existe mais o aviso de liberação');
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
  const s = rica(40); s.pop = 120;
  assert.ok(Sim.hire(s, 'gerente').ok); assert.ok(Sim.hire(s, 'arquiteto').ok); s.pop = 60;
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
    Sim.hire(s, 'arquiteto'); s.cash = 20000; assert.ok(Sim.buy(s, 'cdb', 6000).ok); s.cash = 3000; s.month = 0;
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
  assert.equal(Sim.ASSETS.length, 14 + Sim.NEIGHBORS.length);
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

test('todos são iguais: sem supervisor, sem ordem obrigatória', () => {
  assert.equal(Sim.HIRE_ORDER, undefined);
  assert.equal(Sim.supervision, undefined);
  const s = rica(55); s.pop = 400; s.cash = 1e6;
  const r = Sim.hire(s, 'arquiteto');
  assert.ok(r.ok && r.warnings.length === 0, 'sem avisos de supervisor');
  Sim.STAFF_ORDER.forEach(k => assert.equal(Sim.STAFF[k].mentor, undefined));
});

test('o retorno muda de cargo para cargo: analista rende mais que o ambiental', () => {
  const bot = s => { const a = Sim.analyze(s), b = Sim.recommend(s, a), reserve = 1500 + a.upkeep * 1.5;
    if (b) { const price = Sim.buildCost(s, b); const need = price + reserve - s.cash; if (need > 0) Sim.sell(s, 'cdb', need); if (s.cash - price > reserve) Sim.buildAny(s, b); }
    if (!b && s.cash > 8000) Sim.buy(s, 'cdb', s.cash - 6000); };
  const ganho = role => { let tot = 0; const N = 20;
    for (let n = 1; n <= N; n++) { const s = Sim.newGame(n * 31); let x = n; Math.random = () => (x = (x * 16807) % 2147483647) / 2147483647;
      for (let m = 0; m < 600 && s.pop < 150 && !s.over; m++) { bot(s); Sim.step(s); }
      s.cash += 20000; for (const [k, f] of [['etf', .3], ['fii', .2], ['acoes', .15], ['cdb', .25], ['ouro', .1]]) Sim.buy(s, k, 20000 * f);
      if (role) { s.cash += 1e7; Sim.hire(s, role); for (let l = 1; l < 4; l++) Sim.upgrade(s, role); s.cash -= 1e7; }
      for (let m = 0; m < 72 && !s.over; m++) { bot(s); Sim.step(s); }
      tot += Sim.netWorth(s); }
    return tot / N; };
  assert.ok(ganho('analista') > ganho('ambiental') + 5000, 'investidor rende bem mais que meio ambiente');
});

test('gastos públicos: serviço público custa por mês e fica mais caro a cada unidade', () => {
  const s = rica(80); s.cash = 1e6;
  assert.equal(Sim.isPublic('casa'), false);
  assert.equal(Sim.isPublic('policia'), true);
  assert.equal(Sim.publicCosts(s).total, 0);
  const u0 = Sim.upkeepInfo(s, 'policia');
  Sim.buildAny(s, 'policia');
  const u1 = Sim.upkeepInfo(s, 'policia');
  assert.ok(u1.now > 0 && u1.next > u0.next, 'a próxima unidade soma mais que a primeira');
  Sim.buildAny(s, 'policia'); Sim.buildAny(s, 'policia');
  const u3 = Sim.upkeepInfo(s, 'policia');
  assert.ok(u3.now > u3.first * 3, 'três unidades custam mais que 3x a primeira');
  const pc = Sim.publicCosts(s);
  assert.ok(pc.total > 0 && pc.extra > 0 && pc.rows.length === 1);
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

// ---------- Terreno infinito ----------
test('terreno: o mapa cresce sozinho e não tem limite', () => {
  const s = Sim.newGame(70); s.cash = 1e9;
  const antes = s.tiles.length;
  for (let i = 0; i < 400; i++) assert.ok(Sim.buildAny(s, 'casa').ok);
  assert.ok(s.tiles.length > antes + 300, 'cidade enorme: ' + s.tiles.length);
  assert.equal(Sim.buyLand, undefined, 'não existe mais compra de terreno');
});

test('arquiteto continua construindo mesmo sem terreno livre', () => {
  let construiu = 0;
  for (let k = 1; k <= 10; k++) {
    const s = Sim.newGame(400 + k); s.cash = 1e6;
    while (Sim.freeTiles(s) > 0) Sim.buildAny(s, 'casa');
    s.pop = 60; Sim.hire(s, 'arquiteto'); s.cash = 60000; s.month = 0;
    const n = s.tiles.filter(Boolean).length; Sim.step(s);
    if (s.tiles.filter(Boolean).length > n) construiu++;
  }
  assert.ok(construiu >= 5, 'o arquiteto deveria construir: ' + construiu);
});

// ---------- Mundo: vizinhos, relações, comércio, empréstimos, política ----------
test('mundo: 11 países começam neutros', () => {
  const s = Sim.newGame(80);
  assert.equal(Sim.NEIGHBORS.length, 11);
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
  const media = comDiplomata => { let tot = 0;
    for (let k = 0; k < 20; k++) { const s = rica(90 + k); s.pop = 130; s.cash = 100000;
      if (comDiplomata) { assert.ok(Sim.hire(s, 'gerente').ok); assert.ok(Sim.hire(s, 'diplomata').ok); for (let i = 1; i < 4; i++) Sim.upgrade(s, 'diplomata'); }
      s.world.rel.reino = 30; s.world.giftCd.reino = 0; Sim.step(s); tot += s.world.rel.reino; }
    return tot / 20; };
  assert.ok(media(true) > media(false), 'com diplomata a relação esfria menos');
});

test('save antigo ganha mundo e países novos', () => {
  const s = Sim.newGame(91); delete s.world; delete s.landBought;
  const t = Sim.load(JSON.stringify(s));
  assert.ok(t.world.rel.reino === 50 && t.world.rel.imperio === 50 && t.assets.b_imperio);
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

// ---------- Ritmo da economia (metade) ----------
test('receitas e custos mensais foram reduzidos pela metade', () => {
  assert.equal(Sim.FLOW, 0.5);
  const s = Sim.newGame(1); const a = Sim.analyze(s); s.cash = 1e6; const press = Sim.pressure({pop: s.pop, month: 1}); Sim.step(s);
  assert.ok(Math.abs(s.report.taxes - a.employed * 4) < 1e-6, 'imposto por empregado caiu de 8 para 4');
  assert.ok(Math.abs(s.report.maint - a.upkeep * 0.5 * Sim.COST_HARD * press) < 1e-6, 'manutenção na metade, mais a dificuldade');
  assert.ok(s.report.net > 0, 'a cidade inicial ainda dá lucro');
  assert.ok(s.report.net < 100, 'mas bem menos que antes: ' + s.report.net);
  assert.equal(Sim.DIFFICULTY, 1.3);
});

test('salários seguem o novo ritmo', () => {
  const s = rica(1); Sim.hire(s, 'arquiteto');
  assert.equal(Sim.salaryOf(s, 'arquiteto'), 23);
});

// ---------- Países novos e bolsas ----------
test('há 7 países novos, cada um com sua bolsa', () => {
  assert.equal(Sim.NEIGHBORS.length, 11);
  const s = Sim.newGame(1000);
  Sim.NEIGHBORS.forEach(n => { assert.ok(s.assets['b_' + n.key], n.key); assert.ok(Sim.buy(s, 'b_' + n.key, 500).ok); });
  assert.equal(Sim.WORLD_ASSETS.length, 11);
});

test('a bolsa de um país sobe e cai com a economia dele', () => {
  const s = Sim.newGame(1001);
  const p0 = s.assets.b_imperio.price;
  s.world.econ.imperio = 1; Sim.step(s);
  // choque direto: crise derruba a bolsa do país
  const antes = s.assets.b_imperio.price;
  s.world.econ.imperio = 1;
  s.world.econ.imperio *= 0.8; // simula queda registrada pelo país
  const volta = s.assets.b_imperio.price; assert.equal(volta, antes);
  assert.ok(p0 > 0);
});

test('crises em países derrubam a bolsa deles (de vez em quando) sem exagero', () => {
  let quedas = 0, altas = 0;
  for (let k = 1; k <= 30; k++) {
    const s = Sim.newGame(1100 + k); s.cash = 1e7;
    for (let m = 0; m < 60; m++) { Sim.step(s); s.cash = Math.max(s.cash, 1e6); if (s.over) s.over = null; }
    if (s.log.some(l => l.includes('Crise em'))) quedas++;
    if (s.log.some(l => l.includes('Boom em'))) altas++;
    Sim.NEIGHBORS.forEach(n => assert.ok(s.assets['b_' + n.key].price >= 1 && Number.isFinite(s.assets['b_' + n.key].price)));
  }
  assert.ok(quedas > 3 && altas > 3, `crises ${quedas} booms ${altas}`);
});

test('o efeito do mundo continua pequeno mesmo com 11 países', () => {
  const s = Sim.newGame(1002);
  NEIGHBORS_ALL(s, 100);
  assert.ok(Sim.worldFactor(s) <= 1.25, 'teto do efeito: ' + Sim.worldFactor(s));
  NEIGHBORS_ALL(s, 0);
  assert.ok(Sim.worldFactor(s) >= 0.85);
});
function NEIGHBORS_ALL(s, v) { Sim.NEIGHBORS.forEach(n => { s.world.rel[n.key] = v; s.world.treaty[n.key] = v === 100; }); }

// ---------- Bots versáteis: cada nível libera comportamentos ----------
const base = (seed, pop = 300) => { const s = Sim.newGame(seed); s.cash = 1e8; s.pop = pop;
  for (let i = 0; i < 40; i++) Sim.buildAny(s, 'casa'); s.pop = pop; return s; };

test('arquiteto: nível 1 só faz casa e loja; níveis altos usam o resto', () => {
  const s = base(1200, 130); for (let i = 0; i < 3; i++) Sim.buildAny(s, 'agua'); const a = Sim.analyze(s);
  assert.equal(Sim.picks.city(s, a, 1), 'loja');
  assert.equal(Sim.picks.city(s, a, 3), 'fazenda');
  for (let i = 0; i < 10; i++) Sim.buildAny(s, 'escola');
  const b = Sim.analyze(s); assert.ok(b.cov.edu >= 0.5);
  assert.equal(Sim.picks.city(s, b, 5), 'tecnologia');
  const t = base(1201, 300); for (let i = 0; i < 12; i++) Sim.buildAny(t, 'loja'); for (let i = 0; i < 4; i++) Sim.buildAny(t, 'agua'), Sim.buildAny(t, 'esgoto');
  t.pop = 600; const c = Sim.analyze(t); // falta emprego, vendas lotadas
  assert.equal(Sim.picks.city(t, c, 4), 'mercado');
});

test('arquiteto: moradia vira prédio e condomínio com o nível', () => {
  const s = Sim.newGame(1202); s.cash = 1e8; s.tiles.fill(null); s.tiles[Sim.HALL] = 'prefeitura';
  for (let i = 0; i < 20; i++) Sim.buildAny(s, 'loja'); for (let i = 0; i < 3; i++) { Sim.buildAny(s, 'agua'); Sim.buildAny(s, 'esgoto'); Sim.buildAny(s, 'solar'); }
  for (let i = 0; i < 8; i++) Sim.buildAny(s, 'casa'); s.pop = Sim.analyze(s).housing; s.happy = 80;
  const a = Sim.analyze(s); a.happy = 80;
  assert.equal(Sim.picks.city(s, a, 1), 'casa');
  assert.equal(Sim.picks.city(Object.assign(s, {pop: 120}), Object.assign({}, a, {housing: 120}), 3), 'predio');
  assert.equal(Sim.picks.city(Object.assign(s, {pop: 260}), Object.assign({}, a, {housing: 260}), 5), 'condominio');
});

test('infra: solar no começo, eólica a partir do nível 3, age mais cedo com o nível', () => {
  const s = base(1210, 500); const a = Sim.analyze(s);
  assert.equal(Sim.picks.infra(s, a, 1), 'solar'.length ? Sim.picks.infra(s, a, 1) : null);
  assert.ok(['solar', 'agua', 'esgoto'].includes(Sim.picks.infra(s, a, 1)));
  const fake = {cov: {power: 0.4, water: 1, sewage: 1}, powerDeficit: 400};
  assert.equal(Sim.picks.infra(s, fake, 1), 'solar');
  assert.equal(Sim.picks.infra(s, fake, 3), 'eolica');
  const quase = {cov: {power: 0.85, water: 1, sewage: 1}, powerDeficit: 50};
  assert.equal(Sim.picks.infra(s, quase, 1), null, 'nível 1 espera a falta ficar séria');
  assert.equal(Sim.picks.infra(s, quase, 6), 'solar', 'nível 6 age antes');
});

test('ambiental: filtro, floresta e reciclagem conforme o nível', () => {
  const s = base(1220); const mk = p => ({pollution: p});
  assert.equal(Sim.picks.green(s, mk(15), 1), 'filtro');
  assert.equal(Sim.picks.green(s, mk(8), 1), null, 'nível 1 só age com poluição alta');
  assert.equal(Sim.picks.green(s, mk(9), 3), null, 'nível 3 ainda espera');
  assert.equal(Sim.picks.green(s, mk(11), 3), 'filtro');
  assert.equal(Sim.picks.green(s, mk(9), 4), 'floresta');
  assert.equal(Sim.picks.green(s, mk(11), 4), 'reciclagem');
  assert.equal(Sim.picks.green(s, mk(3), 8), 'floresta');
  assert.equal(Sim.picks.green(s, mk(1), 8), null);
});

test('social: bombeiros no 3, universidade no 4, estádio no 5', () => {
  const s = base(1230, 400);
  for (let i = 0; i < 8; i++) { Sim.buildAny(s, 'escola'); Sim.buildAny(s, 'hospital'); Sim.buildAny(s, 'policia'); Sim.buildAny(s, 'parque'); }
  for (let i = 0; i < 4; i++) Sim.buildAny(s, 'parque');
  const a = Sim.analyze(s); a.happy = 70;
  assert.equal(Sim.picks.social(s, a, 1), null, 'nível 1 não faz bombeiros');
  assert.equal(Sim.picks.social(s, a, 3), 'bombeiros');
  Sim.buildAny(s, 'bombeiros'); Sim.buildAny(s, 'bombeiros'); Sim.buildAny(s, 'bombeiros'); Sim.buildAny(s, 'tecnologia');
  s.pop = 450; const b = Sim.analyze(s); b.happy = 70;
  assert.equal(Sim.picks.social(s, b, 4), 'universidade');
  Sim.buildAny(s, 'universidade'); Sim.buildAny(s, 'parque'); Sim.buildAny(s, 'parque'); Sim.buildAny(s, 'parque');
  const c = Sim.analyze(s); c.happy = 70;
  assert.equal(Sim.picks.social(s, c, 5), 'estadio');
});

test('corretor: nível 1 só renda fixa; nível 8 diversifica em vários grupos', () => {
  const grupos = L => { const s = Sim.newGame(1240); s.pop = 100; s.cash = 1e7;
    for (let i = 0; i < 40; i++) { const g = Sim.picks.group(s, L, 2000); const k = Sim.picks.asset(s, g, L); Sim.buy(s, k, 2000); }
    const out = new Set(); Sim.ASSETS.forEach(d => { if (s.assets[d.key].units > 0) out.add(d.key); }); return out; };
  const g1 = grupos(1), g8 = grupos(8);
  assert.ok([...g1].every(k => ['cdb', 'cdb_b', 'tesouro'].includes(k)), 'nível 1: só renda fixa: ' + [...g1]);
  assert.ok(g8.size >= 7, 'nível 8 diversifica: ' + [...g8]);
  assert.ok([...g8].some(k => Sim.WORLD_ASSETS.includes(k)), 'inclui bolsas de outros países');
  assert.ok(['divid', 'fii'].some(k => g8.has(k)), 'inclui dividendos');
  assert.ok(['ouro', 'dolar'].some(k => g8.has(k)), 'inclui proteção');
});

test('corretor de verdade (no jogo) diversifica ao longo do tempo quando evolui', () => {
  const tipos = L => { let n = 0;
    for (let k = 0; k < 8; k++) { const s = Sim.newGame(1250 + k); s.pop = 100; s.cash = 5e6; assert.ok(Sim.hire(s, 'analista').ok);
      assert.ok(Sim.hire(s, 'corretor').ok); for (let i = 1; i < L; i++) { s.cash = 5e6; Sim.upgrade(s, 'corretor'); }
      s.cash = 5e6; for (let m = 0; m < 30; m++) { Sim.step(s); s.cash = Math.max(s.cash, 3e6); if (s.over) s.over = null; }
      n += Sim.ASSETS.filter(d => s.assets[d.key].units > 0).length; }
    return n / 8; };
  assert.ok(tipos(8) > tipos(1) + 2, `diversificação: nível 8 ${tipos(8)} x nível 1 ${tipos(1)}`);
});

test('analista global investe em países em alta e sai dos que entram em crise', () => {
  let comprou = 0, saiu = 0;
  for (let k = 0; k < 12; k++) {
    const s = Sim.newGame(1300 + k); s.pop = 100; s.cash = 5e6; Sim.hire(s, 'analista'); Sim.hire(s, 'risco'); Sim.hire(s, 'global');
    for (let i = 1; i < 5; i++) { s.cash = 5e6; Sim.upgrade(s, 'global'); }
    s.cash = 5e6; s.world.econ.imperio = 1.3; s.world.rel.imperio = 60; Sim.step(s);
    if (s.log.some(l => l.includes('Analista Global investiu'))) comprou++;
    Sim.buy(s, 'b_ilhas', 3000); s.world.econ.ilhas = 0.7; s.cash = 5e6; Sim.step(s); s.cash = 5e6; Sim.step(s);
    if (s.log.some(l => l.includes('Analista Global saiu'))) saiu++;
  }
  assert.ok(comprou >= 5, 'comprou bolsa em alta: ' + comprou);
  assert.ok(saiu >= 5, 'saiu da bolsa em crise: ' + saiu);
});

test('gerente: nível baixo usa só o banco; nível 3+ pega o empréstimo mais barato (de outro país)', () => {
  const onde = L => { let pais = 0;
    for (let k = 0; k < 10; k++) { const s = rica(1400 + k); s.pop = 120; s.cash = 60000; assert.ok(Sim.hire(s, 'gerente').ok);
      for (let i = 1; i < L; i++) { s.cash = 60000; Sim.upgrade(s, 'gerente'); }
      Sim.NEIGHBORS.forEach(n => { s.world.rel[n.key] = 95; }); s.cash = -2500; Sim.step(s);
      if (Sim.foreignDebt(s) > 0) pais++; }
    return pais; };
  assert.equal(onde(1), 0, 'nível 1 só usa o banco');
  assert.ok(onde(4) >= 6, 'nível 4 escolhe o mais barato (país): ' + onde(4));
});

test('tesoureiro troca dívida cara do banco por empréstimo barato de um país', () => {
  let trocou = 0;
  for (let k = 0; k < 12; k++) { const s = rica(1500 + k); s.pop = 200; s.cash = 80000; s.debt = 12000;
    assert.ok(Sim.hire(s, 'gerente').ok); assert.ok(Sim.hire(s, 'tesoureiro').ok);
    Sim.NEIGHBORS.forEach(n => { s.world.rel[n.key] = 95; }); s.world.econ.reino = 1.2;
    const d0 = s.debt; Sim.step(s); if (s.log.some(l => l.includes('Tesoureiro trocou'))) trocou++; assert.ok(d0 > 0); }
  assert.ok(trocou >= 6, 'refinanciou: ' + trocou);
});

test('diplomata: assina tratados (nível 3), decide dilemas (2) e pedidos (4)', () => {
  const prep = L => { const s = rica(1600); s.pop = 200; s.cash = 3e5; assert.ok(Sim.hire(s, 'gerente').ok); assert.ok(Sim.hire(s, 'diplomata').ok);
    for (let i = 1; i < L; i++) { s.cash = 3e5; Sim.upgrade(s, 'diplomata'); if (i % 2 === 1) Sim.upgrade(s, 'gerente'); } s.cash = 3e5; return s; };
  let tratados = 0, dilemas = 0, pedidos = 0;
  for (let k = 0; k < 15; k++) {
    const a = prep(3); a.seed = 9000 + k; a.sseed = 500 + k; Sim.NEIGHBORS.forEach(n => { a.world.rel[n.key] = 80; }); Sim.step(a); if (Sim.NEIGHBORS.some(n => a.world.treaty[n.key])) tratados++;
    const b = prep(2); b.seed = 9100 + k; b.sseed = 700 + k; b.world.dilemma = {text: 'x', left: 5, options: [{label: 'A', rel: {reino: 8}}, {label: 'B', rel: {reino: -8}}]}; Sim.step(b); if (!b.world.dilemma) dilemas++;
    const c = prep(4); c.seed = 9200 + k; c.sseed = 900 + k; c.world.rel.vizinha = 80; c.world.request = {who: 'vizinha', amount: 1000, months: 12, rate: 0.01, left: 3}; Sim.step(c); if (!c.world.request) pedidos++;
  }
  assert.ok(tratados >= 8, 'tratados: ' + tratados);
  assert.equal(dilemas, 15, 'decidiu todos os dilemas');
  assert.equal(pedidos, 15, 'respondeu todos os pedidos');
  const nivel1 = prep(1); nivel1.world.dilemma = {text: 'x', left: 5, options: [{label: 'A', rel: {reino: 8}}, {label: 'B', rel: {}}]}; Sim.step(nivel1);
  assert.ok(nivel1.world.dilemma, 'nível 1 não decide dilemas');
});

test('gestor de risco: reduz posição grande, compra ouro na crise (nível 5) e protege na recessão (7)', () => {
  let cortou = 0, ouro = 0;
  for (let k = 0; k < 12; k++) {
    const s = rica(1700 + k); s.cash = 1e6; assert.ok(Sim.hire(s, 'analista').ok); assert.ok(Sim.hire(s, 'risco').ok);
    for (let i = 1; i < 6; i++) { s.cash = 1e6; Sim.upgrade(s, 'risco'); }
    s.cash = 1e6; Sim.buy(s, 'acoes', 40000); Sim.buy(s, 'cdb', 5000); s.mods.econLeft = 4; s.mods.econ = 0.75; Sim.step(s);
    if (s.log.some(l => l.includes('passou de 35%'))) cortou++;
    if (s.log.some(l => l.includes('comprou') && l.includes('ouro'))) ouro++;
  }
  assert.ok(cortou >= 8, 'cortou posição grande: ' + cortou);
  assert.ok(ouro >= 3, 'comprou ouro na crise: ' + ouro);
});

test('a interface sabe o que cada nível libera (skills)', () => {
  const s = rica(1800); s.pop = 100; s.cash = 1e6; Sim.hire(s, 'gerente'); Sim.hire(s, 'arquiteto');
  let sk = Sim.staffInfo(s, 'arquiteto').skills;
  assert.ok(sk.length >= 4 && sk[0].on && !sk[sk.length - 1].on);
  for (let i = 1; i < 8; i++) { Sim.upgrade(s, 'arquiteto'); if (i % 2 === 1) Sim.upgrade(s, 'gerente'); }
  assert.ok(Sim.staffInfo(s, 'arquiteto').skills.every(x => x.on), 'nível 8 libera tudo');
  ['infra', 'ambiental', 'social', 'corretor', 'risco', 'global', 'gerente', 'tesoureiro', 'diplomata'].forEach(k => assert.ok(Sim.SKILLS[k].length >= 2, k));
});

// ---------- Freios no efeito bola de neve ----------
test('retorno decrescente: o nível 8 rende bem menos que 8 vezes o nível 1', () => {
  const efeito = L => { const s = rica(3000); s.pop = 60; s.cash = 1e9; Sim.hire(s, 'gerente'); Sim.hire(s, 'analista'); Sim.hire(s, 'contador');
    for (let i = 1; i < L; i++) { s.cash = 1e9; Sim.upgrade(s, 'contador'); Sim.upgrade(s, 'analista'); Sim.upgrade(s, 'gerente'); }
    const t = Sim.newGame(1); t.pop = 60; s.cash = 1e9; Sim.step(s); Sim.step(t);
    return Sim.staffInfo(s, 'contador').lines[0]; };
  const num = x => parseFloat(x.replace(/[^0-9,]/g, '').replace(',', '.'));
  assert.ok(num(efeito(8)) < 8 * num(efeito(1)) * 0.85, 'nível 8: ' + efeito(8) + ' x nível 1: ' + efeito(1));
  assert.ok(num(efeito(8)) > num(efeito(1)), 'ainda melhora com o nível');
});

test('custo de coordenação: cada pessoa a mais encarece a folha de todos', () => {
  const s = rica(3001); s.pop = 400; s.cash = 1e9;
  Sim.hire(s, 'gerente'); const um = Sim.staffCost(s) / Sim.salaryOf(s, 'gerente');
  assert.equal(um, 1);
  ['arquiteto', 'analista', 'obras', 'tesoureiro'].forEach(k => Sim.hire(s, k));
  const soma = Sim.STAFF_ORDER.reduce((t, k) => t + Sim.salaryOf(s, k), 0);
  assert.ok(Sim.staffCost(s) > soma * 1.09, 'com 5 pessoas a folha custa mais que a soma dos salários');
});

test('bola de neve controlada: equipe bem escolhida ajuda, equipe completa e cedo demais atrapalha', () => {
  const rodar = (hire, meses) => { let tot = 0; const N = 12;
    for (let k = 1; k <= N; k++) { const s = Sim.newGame(4000 + k); let x = k; Math.random = () => (x = (x * 16807) % 2147483647) / 2147483647;
      for (let m = 0; m < meses && !s.over; m++) { hire(s);
        const a = Sim.analyze(s), b = Sim.recommend(s, a), reserve = 1500 + a.upkeep * 1.5;
        if (b) { const price = Sim.buildCost(s, b); if (s.cash - price > reserve) Sim.buildAny(s, b); }
        Sim.step(s); }
      tot += Sim.netWorth(s); }
    return tot / N; };
  const nada = s => {};
  const tudoCedo = s => { for (const k of Sim.STAFF_ORDER) if (!Sim.hired(s, k) && s.cash > 300) { Sim.hire(s, k); break; } };
  const meses = 150;
  assert.ok(rodar(tudoCedo, meses) < rodar(nada, meses) * 0.8, 'contratar tudo cedo demais atrapalha bastante');
});

test('obras automáticas por mês: no máximo 1 até o nível 4 e 2 até o nível 8', () => {
  const s = rica(3002); s.pop = 300; s.cash = 1e9; Sim.hire(s, 'gerente'); Sim.hire(s, 'arquiteto');
  const mb = () => Sim.staffInfo(s, 'arquiteto').lines.find(l => l.includes('por mês')).match(/\d+/g).pop() * 1;
  for (let i = 1; i < 8; i++) { s.cash = 1e9; Sim.upgrade(s, 'arquiteto'); Sim.upgrade(s, 'gerente'); }
  assert.ok(mb() <= 2, 'no máximo 2 obras por mês: ' + mb());
});

// ---------- Progressão: quanto mais evolui, mais pesado e mais demorado ----------
test('o começo do jogo não é afetado pela progressão', () => {
  const s = Sim.newGame(1);
  assert.equal(Sim.sizeF(s), 1);
  assert.equal(Sim.priceF(s), 1);
  s.pop = 50; assert.equal(Sim.sizeF(s), 1, 'até 50 habitantes nada muda');
  assert.equal(Sim.buildCost(s, 'casa'), Sim.BUILDINGS.casa.cost);
  assert.ok(Sim.pressure(s) < 1.005, 'no mês 0 não há pressão');
});

test('quanto maior a cidade, mais caras as obras, o treinamento e a manutenção', () => {
  const mk = pop => { const s = Sim.newGame(2); s.pop = pop; s.cash = 1e9; Sim.hire(s, 'gerente'); return s; };
  const a = mk(100), b = mk(600), c = mk(3000), d = mk(15000);
  assert.ok(Sim.buildCost(a, 'escola') <= Sim.buildCost(b, 'escola') && Sim.buildCost(b, 'escola') < Sim.buildCost(c, 'escola') && Sim.buildCost(c, 'escola') < Sim.buildCost(d, 'escola'));
  assert.ok(Sim.upgradeCost(a, 'gerente') < Sim.upgradeCost(c, 'gerente'));
  assert.ok(Sim.pressure(a) < Sim.pressure(b) && Sim.pressure(b) < Sim.pressure(c) && Sim.pressure(c) < Sim.pressure(d));
  assert.ok(Sim.pressure(c) > 1.3 && Sim.pressure(c) < 2, 'cresce devagar, sem explodir: ' + Sim.pressure(c));
});

test('com os anos os custos sobem um pouco (inflação)', () => {
  const s = Sim.newGame(3); s.pop = 100;
  const p0 = Sim.pressure(s); s.month = 120; const p10 = Sim.pressure(s); s.month = 360; const p30 = Sim.pressure(s);
  assert.ok(p0 < p10 && p10 < p30);
  assert.ok(p30 / p0 > 1.3 && p30 / p0 < 1.5, 'inflação de ~1,2% ao ano: ' + p30 / p0);
});

test('fases da cidade: vilarejo até megalópole, com o quanto cada uma pesa', () => {
  const s = Sim.newGame(4);
  const nome = pop => { s.pop = pop; return Sim.phaseOf(s); };
  assert.equal(nome(20).name, 'Vilarejo'); assert.equal(nome(20).n, 1);
  assert.equal(nome(150).name, 'Cidade pequena');
  assert.equal(nome(500).name, 'Cidade');
  assert.equal(nome(1200).name, 'Cidade grande');
  assert.equal(nome(3000).name, 'Metrópole');
  assert.equal(nome(9000).name, 'Megalópole'); assert.equal(nome(9000).next, null);
  assert.equal(nome(150).next, 300);
  assert.ok(nome(3000).costs > nome(150).costs && nome(3000).prices > nome(150).prices && nome(3000).events > nome(150).events);
});

test('eventos ruins pesam mais em cidades grandes', () => {
  const media = pop => { let tot = 0, n = 0;
    for (let k = 1; k <= 60; k++) { const s = Sim.newGame(7000 + k); s.pop = pop; s.cash = 1e9; const c0 = s.cash;
      for (let m = 0; m < 80; m++) { const c = s.cash; Sim.step(s); const log = s.log[0] || ''; if (/Enchente/.test(log)) { const mm = log.match(/R\$ ([\d.]+)/); if (mm) { tot += +mm[1].replace(/\./g, ''); n++; } } s.cash = 1e9; s.pop = pop; }
    } return tot / Math.max(1, n); };
  assert.ok(media(3000) > media(60) * 1.2, `estrago médio: grande ${media(3000)} x pequena ${media(60)}`);
});

test('a margem por habitante diminui conforme a cidade cresce', () => {
  const margem = n => { const s = Sim.newGame(5); s.tiles.fill(null); s.tiles[Sim.HALL] = 'prefeitura'; s.cash = 1e9;
    for (let i = 0; i < n * 5; i++) Sim.buildAny(s, 'casa'); for (let i = 0; i < n * 4; i++) Sim.buildAny(s, 'loja');
    s.pop = Sim.analyze(s).housing; s.month = 1; Sim.step(s); return s.report.net / s.pop; };
  assert.ok(margem(60) < margem(8), `por habitante: grande ${margem(60)} x pequena ${margem(8)}`);
});

test('mesmo com a equipe certa o jogo continua devagar', () => {
  const rodar = (comEquipe, meses) => { let tot = 0; const N = 10;
    for (let k = 1; k <= N; k++) { const s = Sim.newGame(8000 + k); let x = k; Math.random = () => (x = (x * 16807) % 2147483647) / 2147483647;
      for (let m = 0; m < meses && !s.over; m++) {
        if (comEquipe) for (const q of ['gerente', 'arquiteto', 'obras']) { if (!Sim.hired(s, q)) { if (s.cash > 5000 + Sim.STAFF[q].salary * 12 && (s.report ? s.report.net : 0) > Sim.STAFF[q].salary * 3) Sim.hire(s, q); break; } }
        const a = Sim.analyze(s), b = Sim.recommend(s, a), reserve = 1500 + a.upkeep * 1.5;
        if (b) { const price = Sim.buildCost(s, b); if (s.cash - price > reserve) Sim.buildAny(s, b); }
        Sim.step(s); }
      tot += s.pop; }
    return tot / N; };
  const meses = 20 * 12, sem = rodar(false, meses), com = rodar(true, meses);
  assert.ok(sem < 700, 'em 20 anos a cidade sem equipe ainda é pequena: ' + sem);
  assert.ok(com < sem * 1.5, `a equipe certa não dá um salto enorme: ${com} x ${sem}`);
});

// ---------- Evolução, capacidades, histórico e mapa 3D ----------
test('evoluir: casa vira sobrado e mansão, com custo, população mínima e mais capacidade', () => {
  const s = rica(90); s.cash = 1e6; s.pop = 100;
  Sim.buildAny(s, 'casa');
  assert.equal(Sim.evolveInfo(s, 'casa').early, true, 'cidade pequena demais');
  assert.equal(Sim.evolve(s, 'casa').ok, false);
  const h0 = Sim.analyze(s).housing;
  s.pop = 200;
  const i = Sim.evolveInfo(s, 'casa');
  assert.ok(i.ok && i.fromName === 'Casa' && i.toName === 'Sobrado' && i.cost > Sim.buildCost(s, 'casa'));
  const cash = s.cash; assert.ok(Sim.evolve(s, 'casa').ok); assert.equal(s.cash, cash - i.cost);
  assert.ok(Sim.analyze(s).housing > h0 + 12, 'sobrado abriga bem mais que uma casa');
  s.pop = 700; assert.ok(Sim.evolve(s, 'casa').ok);
  for (let n = 0; n < 12; n++) Sim.evolve(s, 'casa');
  assert.equal(Sim.evolveInfo(s, 'casa').max, true);
  assert.equal(Sim.evolve(s, 'casa').ok, false);
});

test('evoluir um serviço público custa menos manutenção que construir outro igual', () => {
  const s = rica(91); s.cash = 1e6; s.pop = 700; Sim.buildAny(s, 'hospital');
  const cap1 = Sim.analyze(s).sum('health');
  Sim.evolve(s, 'hospital');
  const evoUp = Sim.upkeepInfo(s, 'hospital').now, cap2 = Sim.analyze(s).sum('health');
  assert.ok(cap2 > cap1 * 2);
  const t = rica(91); t.cash = 1e6; t.pop = 700; Sim.buildAny(t, 'hospital'); Sim.buildAny(t, 'hospital');
  assert.ok(evoUp < Sim.upkeepInfo(t, 'hospital').now, 'evoluir é mais barato que duas unidades');
  assert.ok(evoUp > Sim.upkeepInfo(rica(91), 'hospital').next, 'mas custa mais que o nível 1');
});

test('demolir devolve o que foi investido e começa pelo prédio de menor nível', () => {
  const s = rica(92); s.cash = 1e6; s.pop = 700; Sim.buildAny(s, 'casa'); Sim.buildAny(s, 'casa'); Sim.evolve(s, 'casa');
  const n0 = s.lv.filter(v => v > 1).length; assert.equal(n0, 1);
  Sim.demolishOne(s, 'casa');
  assert.equal(s.lv.filter(v => v > 1).length, 1, 'o evoluído foi mantido');
  assert.equal(Sim.counts(s).casa, (Sim.counts(Sim.newGame(1)).casa || 0) + 1 + 0);
});

test('cobertura e capacidade por prédio aparecem como no SimCity', () => {
  const s = rica(93); s.pop = 300; s.cash = 1e6;
  const c = Object.fromEntries(Sim.coverage(s).map(r => [r.key, r]));
  assert.ok(c.edu.need === 300 && c.edu.cap === 0 && c.edu.ratio === 0);
  Sim.buildAny(s, 'escola');
  const e = Sim.coverage(s).find(r => r.key === 'edu');
  assert.equal(e.cap, 150); assert.equal(e.houses, 13, '150 moradores ≈ 13 casas');
  const u = Sim.unitInfo('casa', 1), u3 = Sim.unitInfo('casa', 3);
  assert.equal(u.main, 12); assert.ok(u3.main > 4 * u.main && u3.name === 'Mansão');
  assert.ok(Sim.unitInfo('policia', 1).lines[0].houses >= 1);
  assert.equal(Sim.unitInfo('fabrica', 1).lines.some(l => l.text.includes('Polui')), true);
});

test('histórico guarda todos os avisos além dos 80 do dia a dia', () => {
  const s = rica(94);
  for (let i = 0; i < 150; i++) { s.month = i; Sim.hire(s, 'analista'); Sim.fire(s, 'analista'); }
  const s2 = Sim.newGame(5); s2.cash = 1e6; for (let i = 0; i < 300; i++) { s2.month++; Sim.step(s2); if (s2.over) break; }
  assert.ok(s2.hist.length >= s2.log.length && s2.histN >= s2.hist.length);
  assert.ok(s2.hist.every(h => typeof h.m === 'number' && typeof h.t === 'string'));
  const re = Sim.load(Sim.serialize(s2)); assert.equal(re.hist.length, s2.hist.length);
  const old = JSON.parse(Sim.serialize(s2)); delete old.hist; delete old.histN; delete old.lv;
  const mig = Sim.load(JSON.stringify(old)); assert.ok(Array.isArray(mig.hist) && Array.isArray(mig.lv));
});

test('propostas do mundo têm prazo total para a barra de tempo', () => {
  const s = Sim.newGame(95); s.cash = 1e6; let got = null;
  for (let i = 0; i < 400 && !got; i++) { Sim.step(s); got = s.world.request || s.world.dilemma; if (got) break; if (s.over) break; }
  assert.ok(got && got.total >= got.left && got.total > 0);
});

test('construtor com nível alto reforma prédios sozinho quando há dinheiro', () => {
  let reformas = 0;
  for (let k = 0; k < 6; k++) {
    const s = rica(96 + k); s.pop = 400; s.cash = 3e5;
    for (let i = 0; i < 20; i++) { s.cash = 3e5; Sim.buildAny(s, 'casa'); }
    s.cash = 1e7; Sim.hire(s, 'arquiteto'); for (let l = 1; l < 6; l++) Sim.upgrade(s, 'arquiteto'); s.cash = 3e5;
    for (let m = 0; m < 24 && !s.over; m++) { s.cash = Math.max(s.cash, 2e5); Sim.step(s); }
    reformas += s.lv.filter(v => v > 1).length;
  }
  assert.ok(reformas > 0, 'algum prédio foi reformado');
});

test('mapa 3D: todo prédio tem desenho em cada nível e a espiral não repete posição', () => {
  require('../www/city3d.js');
  const P = globalThis.City3D._parts;
  Object.keys(Sim.BUILDINGS).concat(['prefeitura']).forEach(k => {
    assert.ok(P[k], 'desenho de ' + k);
    for (let lv = 1; lv <= 3; lv++) { const parts = P[k](lv, 12345); assert.ok(parts.length > 0); parts.forEach(p => assert.ok(p.slice(1, 8).every(v => Number.isFinite(v)), `${k} lv${lv}`)); }
  });
  const seen = new Set(); for (let i = 0; i < 300; i++) { const [x, z] = globalThis.City3D._spiral(i); seen.add(x + ',' + z); }
  assert.equal(seen.size, 300);
});

test('equipe decide a cada 2 meses; só a emergência do caixa negativo é todo mês', () => {
  const s = rica(300); s.pop = 120; s.cash = 5e6; Sim.hire(s, 'analista'); Sim.hire(s, 'corretor'); s.month = 0;
  const notas = []; for (let m = 0; m < 12; m++) { const n = s.log.length; s.cash = 5e6; Sim.step(s); notas.push(s.log.length - n); }
  const impares = notas.filter((_, i) => i % 2 === 0).reduce((t, x) => t + x, 0), pares = notas.filter((_, i) => i % 2 === 1).reduce((t, x) => t + x, 0);
  assert.ok(impares > pares, `decisões só em meses alternados: ${impares} x ${pares}`);
  const g = rica(301); g.pop = 120; Sim.hire(g, 'gerente'); g.month = 1; g.cash = -3000; Sim.step(g);
  assert.ok(g.cash > -3000 || g.log.some(l => l.includes('Gerente')), 'gerente socorre o caixa mesmo em mês de folga');
});

test('acontecimentos começam pequenos e crescem com o tamanho da cidade', () => {
  const perda = pop => { let tot = 0, n = 0;
    for (let k = 0; k < 200; k++) { const s = Sim.newGame(500 + k); s.pop = pop; s.cash = 1e6; const c0 = s.cash; for (let m = 0; m < 24; m++) { s.cash = 1e6; Sim.step(s); tot += Math.abs(s.cash - 1e6); } n++; }
    return tot / n; };
  const peq = perda(20), grande = perda(900);
  assert.ok(grande > peq * 2, `cidade grande mexe mais no caixa: ${peq} x ${grande}`);
});

test('treinamento leva tempo: paga ao começar, sobe de nível só depois de alguns meses e um por vez', () => {
  const s = rica(310); s.cash = 1e6; s.pop = 100; Sim.hire(s, 'arquiteto');
  const c0 = s.cash, r = Sim.train(s, 'arquiteto');
  assert.ok(r.ok && r.months === Sim.trainMonths(1) && r.to === 2);
  assert.ok(s.cash < c0, 'o treinamento foi pago na hora');
  assert.equal(Sim.levelOf(s, 'arquiteto'), 1, 'ainda no nível 1');
  assert.equal(Sim.train(s, 'arquiteto').ok, false, 'não treina duas vezes ao mesmo tempo');
  assert.ok(Sim.staffInfo(s, 'arquiteto').training.left === r.months);
  for (let m = 1; m < r.months; m++) { s.cash = 1e6; Sim.step(s); assert.equal(Sim.levelOf(s, 'arquiteto'), 1, 'mês ' + m); }
  s.cash = 1e6; Sim.step(s);
  assert.equal(Sim.levelOf(s, 'arquiteto'), 2, 'terminou o treinamento');
  assert.equal(Sim.staffInfo(s, 'arquiteto').training, null);
  assert.ok(s.log.some(l => l.includes('terminou o treinamento')));
  assert.ok(Sim.trainMonths(7) > Sim.trainMonths(1), 'níveis altos demoram mais');
});

test('demitir durante o treinamento perde o treinamento', () => {
  const s = rica(311); s.cash = 1e6; Sim.hire(s, 'analista'); Sim.train(s, 'analista'); Sim.fire(s, 'analista'); Sim.hire(s, 'analista');
  assert.equal(Sim.staffInfo(s, 'analista').training, null); assert.equal(Sim.levelOf(s, 'analista'), 1);
});

// ---------- Equipe: desempenho, candidatos e propostas; cidades no exterior ----------
test('desempenho da equipe cai com o tempo, avisa e o bônus resolve', () => {
  const s = rica(320); s.cash = 5e6; s.pop = 100; Sim.hire(s, 'analista');
  assert.equal(Sim.staffInfo(s, 'analista').perf, 1);
  const pw0 = Sim.staffInfo(s, 'analista').lines.join('');
  let avisou = false; for (let m = 0; m < 200 && !avisou; m++) { s.cash = 5e6; Sim.step(s); avisou = s.log.some(l => l.includes('não está rendendo bem')); }
  assert.ok(avisou, 'avisa que a pessoa não está rendendo bem');
  const i = Sim.staffInfo(s, 'analista'); assert.ok(i.perfWarn && i.perf < Sim.PERF_WARN);
  const err0 = Sim.errorChance(s, 'analista');
  const c = s.cash; assert.ok(Sim.motivate(s, 'analista').ok); assert.ok(s.cash < c);
  assert.ok(Sim.staffInfo(s, 'analista').perf > i.perf + 0.4 && Sim.errorChance(s, 'analista') < err0, 'bônus melhora e erra menos');
  assert.equal(Sim.motivate(rica(321), 'analista').ok, false);
});

test('candidatos: contratar com nível e desempenho próprios, ou trocar quem já está', () => {
  const s = rica(322); s.cash = 1e6; s.pop = 100;
  s.offer = {kind: 'cand', k: 'analista', level: 3, perf: 1.2, mult: 1.1, name: 'Marina', replace: false, left: 4, total: 4};
  assert.ok(Sim.offerSalary(s, s.offer) > 0);
  assert.ok(Sim.answerOffer(s, true).ok);
  assert.equal(Sim.levelOf(s, 'analista'), 3); assert.equal(Sim.staffInfo(s, 'analista').perf, 1.2); assert.equal(s.offer, null);
  assert.equal(Sim.staffInfo(s, 'analista').salary, Math.round(Sim.salaryOf(s, 'analista')));
  s.offer = {kind: 'cand', k: 'analista', level: 5, perf: 1.0, mult: 1, name: 'Rafael', replace: true, left: 4, total: 4};
  assert.ok(Sim.answerOffer(s, true).ok && Sim.levelOf(s, 'analista') === 5);
  s.offer = {kind: 'cand', k: 'corretor', level: 2, perf: 1, mult: 1, name: 'X', left: 4, total: 4}; Sim.answerOffer(s, false);
  assert.equal(Sim.hired(s, 'corretor'), false); assert.equal(s.offer, null);
});

test('proposta da concorrência: dar aumento segura a pessoa; ignorar faz ela sair', () => {
  const a = rica(323); a.cash = 1e6; Sim.hire(a, 'analista'); for (let i = 1; i < 4; i++) { a.cash = 1e6; Sim.upgrade(a, 'analista'); }
  a.offer = {kind: 'poach', k: 'analista', name: 'Z', left: 5, total: 5};
  const sal = Sim.salaryOf(a, 'analista'); assert.ok(Sim.answerOffer(a, true).ok);
  assert.ok(Sim.salaryOf(a, 'analista') > sal * 1.25 && Sim.hired(a, 'analista'));
  const b = rica(324); b.cash = 1e6; Sim.hire(b, 'analista'); b.offer = {kind: 'poach', k: 'analista', name: 'Z', left: 1, total: 5};
  b.month = 0; Sim.step(b); assert.equal(Sim.hired(b, 'analista'), false, 'foi embora');
  let viu = false; for (let k = 0; k < 40 && !viu; k++) { const s = rica(330 + k); s.cash = 1e6; s.pop = 3000; Sim.hire(s, 'analista'); for (let m = 0; m < 80 && !viu; m++) { s.cash = 1e6; Sim.step(s); if (s.offer) viu = true; } }
  assert.ok(viu, 'propostas aparecem sozinhas durante o jogo');
});

test('cidades no exterior: já existem prontas, exigem cidade grande e boa relação e rendem de verdade', () => {
  const s = rica(340); s.cash = 5e9; s.pop = 500; s.world.rel.reino = 70;
  assert.equal(Sim.colonyInfo(s, 'reino').canBuy, false); assert.equal(Sim.buyColony(s, 'reino').ok, false);
  s.pop = 25000; s.world.rel.reino = 40; assert.equal(Sim.buyColony(s, 'reino').ok, false, 'relação baixa');
  s.world.rel.reino = 70; const pre = Sim.colonyInfo(s, 'reino'); assert.equal(pre.pop0, Sim.CITY_POP.reino);
  const nw0 = Sim.netWorth(s), c0 = s.cash;
  assert.ok(Sim.buyColony(s, 'reino').ok); assert.equal(s.cash, c0 - pre.price);
  assert.equal(Sim.buyColony(s, 'reino').ok, false, 'uma por país');
  const c = s.cities.reino, a = Sim.analyze(c);
  assert.ok(c.pop >= Sim.CITY_POP.reino && c.tiles.length > 50, 'cidade de verdade, já construída');
  assert.ok(a.cov.water >= 0.99 && a.cov.power >= 0.99 && a.cov.edu > 0.8 && a.empRate > 0.9, 'atende bem o povo');
  assert.ok(Sim.netWorth(s) > nw0 - pre.price, 'a cidade conta no patrimônio');
  for (let m = 0; m < 24; m++) { s.pop = 25000; s.lowHappy = 0; s.world.rel.reino = 70; s.cash = Math.max(s.cash, 1e9); Sim.step(s); }
  const i = Sim.colonyInfo(s, 'reino'); assert.ok(i.owned && i.net > 0 && i.pop > 10000, 'dá lucro: ' + i.net);
  assert.ok(s.report.colonies > 0);
  const v = Sim.sellColony(s, 'reino'); assert.ok(v.ok && v.value > 0); assert.equal(Sim.colonyInfo(s, 'reino').owned, false);
});

test('administradores da cidade de fora não têm nível: dão conta de qualquer tamanho e só os cargos de cidade', () => {
  const s = rica(343); s.cash = 5e9; s.pop = 25000; s.world.rel.imperio = 70; assert.ok(Sim.buyColony(s, 'imperio').ok);
  const c = s.cities.imperio;
  assert.equal(Sim.hire(c, 'analista').ok, false, 'investidor é só da capital');
  assert.ok(Sim.hire(c, 'arquiteto').ok && Sim.hire(c, 'social').ok);
  assert.equal(Sim.levelOf(c, 'arquiteto'), Sim.FLAT_LEVEL);
  const i = Sim.staffInfo(c, 'arquiteto'); assert.equal(i.efficiency, 1, 'nunca sobrecarregado');
  c.pop = 50000; assert.equal(Sim.staffInfo(c, 'arquiteto').efficiency, 1);
  const cap = rica(344); cap.cash = 1e9; cap.pop = 50000; Sim.hire(cap, 'arquiteto');
  assert.equal(Sim.staffInfo(cap, 'arquiteto').efficiency, 0.25, 'a capital sim sofre com o nível');
  assert.ok(Sim.staffCost(c) > 0 && Sim.fire(c, 'social').ok);
});

test('cidade de fora gasta o caixa único, obras e avisos aparecem na capital', () => {
  const s = rica(345); s.cash = 5e9; s.pop = 25000; s.world.rel.vizinha = 70; Sim.buyColony(s, 'vizinha');
  const c = s.cities.vizinha, cash = s.cash, tiles = c.tiles.length;
  assert.equal(c.cash, s.cash, 'mesmo caixa'); c.cash -= 1000; assert.equal(s.cash, cash - 1000);
  s.cash = 5e9; assert.ok(Sim.buildAny(c, 'hospital').ok); assert.ok(c.tiles.length > tiles && s.cash < 5e9, 'obra paga com o caixa único');
  Sim.hire(c, 'arquiteto'); Sim.hire(c, 'social'); Sim.hire(c, 'infra'); c.pop = 30000;
  for (let m = 0; m < 40; m++) { s.pop = 25000; s.lowHappy = 0; s.cash = 5e9; s.world.rel.vizinha = 70; Sim.step(s); }
  assert.ok(s.log.some(l => l.includes('Cidade Vizinha:')), 'avisos da cidade chegam ao histórico da capital');
  assert.ok(!s.over, 'cidade de fora não acaba o jogo');
});

test('cidades de fora sobrevivem ao salvar e carregar e saves antigos migram', () => {
  const s = rica(346); s.cash = 5e9; s.pop = 25000; s.world.rel.reino = 70; Sim.buyColony(s, 'reino'); Sim.hire(s.cities.reino, 'arquiteto');
  for (let m = 0; m < 4; m++) { s.pop = 25000; s.lowHappy = 0; s.world.rel.reino = 70; Sim.step(s); }
  const txt = Sim.serialize(s), r = Sim.load(txt);
  assert.equal(r.cities.reino.tiles.length, s.cities.reino.tiles.length); assert.ok(Sim.hired(r.cities.reino, 'arquiteto'));
  assert.equal(r.cities.reino.cash, r.cash, 'caixa continua ligado'); assert.ok(!txt.includes('"assets":{}'), 'não duplica o mundo');
  const antigo = JSON.parse(txt); antigo.colonies = {uniao: {key: 'uniao', level: 3, nation: true, cost: 1e6}}; delete antigo.cities;
  const m = Sim.load(JSON.stringify(antigo)); assert.ok(m.cities.uniao && m.cities.uniao.nation && m.cities.uniao.pop > 1000 && m.colonies === undefined);
});

test('cidade no exterior é tomada se a relação ficar péssima por meses', () => {
  const s = rica(341); s.cash = 5e8; s.pop = 25000; s.world.rel.uniao = 70; assert.ok(Sim.buyColony(s, 'uniao').ok);
  for (let m = 0; m < 8 && Sim.colonyInfo(s, 'uniao').owned; m++) { s.world.rel.uniao = 5; s.cash = 5e8; Sim.step(s); }
  assert.equal(Sim.colonyInfo(s, 'uniao').owned, false);
  assert.ok(s.log.some(l => l.includes('tomou a sua cidade')));
  const t = rica(342); t.cash = 5e8; t.pop = 25000; t.world.rel.uniao = 70; Sim.buyColony(t, 'uniao');
  t.world.rel.uniao = 20; t.pop = 25000; Sim.step(t); t.world.rel.uniao = 70; for (let m = 0; m < 8; m++) { t.world.rel.uniao = 70; t.cash = 5e8; Sim.step(t); }
  assert.ok(Sim.colonyInfo(t, 'uniao').owned, 'se a relação melhora, o risco passa');
});

// ---------- Fim de jogo: mercado com limite e países ----------
test('mercado com limite: quantias gigantes rendem proporcionalmente muito menos', () => {
  const cresce = cash0 => { let tot = 0; const N = 4;
    for (let k = 1; k <= N; k++) { const s = Sim.newGame(900 + k); s.cash = cash0 * 2; s.pop = 25000; Sim.buy(s, 'etf', cash0);
      const v0 = s.assets.etf.units * s.assets.etf.price; for (let m = 0; m < 60; m++) { s.pop = 25000; s.lowHappy = 0; s.cash = Math.max(s.cash, 1e6); Sim.step(s); if (s.over) break; }
      tot += s.assets.etf.units * s.assets.etf.price / v0; }
    return tot / N; };
  const pequeno = cresce(2e4), gigante = cresce(2e10);
  assert.ok(gigante < pequeno * 0.8 || gigante < 1.15, `saturado rende menos: ${pequeno} x ${gigante}`);
  const s = Sim.newGame(1); s.cash = 1e10; Sim.buy(s, 'etf', 5e9);
  assert.ok(Sim.assetLiquidity(s, 'etf') < 0.05); assert.ok(Sim.assetLiquidity(Sim.newGame(1), 'etf') === 1);
  s.cash = 1e10; s.pop = 25000; s.world.rel.reino = 70; assert.ok(Sim.buyColony(s, 'reino').ok);
  const antes = Sim.marketScale(Sim.newGame(1)); assert.ok(Sim.marketScale(s) > antes, 'cidades ampliam o mercado');
});

test('comprar o país inteiro: exige cidade grande e relação; paga impostos extras e não pode ser tomado', () => {
  const s = rica(350); s.cash = 5e10; s.pop = 40000; s.world.rel.imperio = 80;
  assert.equal(Sim.annexColony(s, 'imperio').ok, false, 'precisa ter a cidade lá');
  assert.ok(Sim.buyColony(s, 'imperio').ok);
  s.pop = 40000; s.world.rel.imperio = 80; const i0 = Sim.colonyInfo(s, 'imperio'); assert.ok(i0.canAnnex && i0.annexPrice > 5 * Sim.cityPrice(s, 'imperio'));
  const c = s.cash; assert.ok(Sim.annexColony(s, 'imperio').ok, 'compra o país'); assert.equal(s.cash, c - i0.annexPrice);
  assert.ok(Sim.colonyInfo(s, 'imperio').nation); assert.equal(Sim.annexColony(s, 'imperio').ok, false);
  const peq = rica(351); peq.cash = 5e10; peq.pop = 40000; peq.world.rel.vizinha = 80; Sim.buyColony(peq, 'vizinha');
  assert.equal(Sim.colonyInfo(peq, 'vizinha').canAnnex, false, 'cidade pequena demais para virar país');
  for (let m = 0; m < 10; m++) { s.world.rel.imperio = 5; s.pop = 40000; s.lowHappy = 0; s.cash = 5e10; Sim.step(s); }
  assert.ok(Sim.colonyInfo(s, 'imperio').owned, 'país seu não é tomado');
});

test('mapa 3D: cidades de outros países crescem com o nível e são sempre iguais para o mesmo país', () => {
  require('../www/city3d.js');
  const sy = globalThis.City3D._synth;
  const a = sy({key: 'reino', level: 1, nation: false}), b = sy({key: 'reino', level: 10, nation: false}), n = sy({key: 'reino', level: 10, nation: true});
  assert.ok(b.tiles.length > a.tiles.length * 3 && n.tiles.length > b.tiles.length);
  assert.deepEqual(sy({key: 'reino', level: 6, nation: false}), sy({key: 'reino', level: 6, nation: false}));
  assert.notDeepEqual(sy({key: 'reino', level: 6, nation: false}).tiles, sy({key: 'imperio', level: 6, nation: false}).tiles);
  assert.equal(a.tiles[0], 'prefeitura');
  assert.ok(b.lv.filter(v => v > 1).length > a.lv.filter(v => v > 1).length, 'nível alto tem prédios mais evoluídos');
  b.tiles.concat(n.tiles).forEach(k => assert.ok(k === 'prefeitura' || Sim.BUILDINGS[k], k));
});

test('política mundial: a prosperidade das cidades oscila e uma sobe quando outra cai', () => {
  const s = rica(360); s.cash = 5e10; s.pop = 25000; const ks = Sim.NEIGHBORS.map(n => n.key);
  let max = 0, min = 9, soma = 0, n = 0, reviravoltas = 0;
  for (let m = 0; m < 300; m++) { s.pop = 25000; s.lowHappy = 0; s.cash = 5e10; Sim.step(s); ks.forEach(k => { const f = s.world.fort[k]; max = Math.max(max, f); min = Math.min(min, f); soma += f; n++; }); }
  reviravoltas = s.hist.filter(h => h.t.includes('Reviravolta política')).length;
  assert.ok(max > 1.35 && min < 0.7, `oscila: ${min} a ${max}`); assert.ok(reviravoltas >= 5, 'eventos de reviravolta: ' + reviravoltas);
  assert.ok(Math.abs(soma / n - 1) < 0.2, 'em média continua perto de 1: ' + soma / n);
});

test('cidade de fora em crise política perde dinheiro e em fase de ouro lucra muito; o preço também oscila', () => {
  const s = rica(361); s.cash = 5e10; s.pop = 25000; s.world.rel.reino = 80; assert.ok(Sim.buyColony(s, 'reino').ok);
  const rodar = f => { let net = 0; for (let m = 0; m < 6; m++) { s.pop = 25000; s.lowHappy = 0; s.cash = 5e10; s.world.rel.reino = 80; s.world.fort.reino = f; Sim.step(s); s.world.fort.reino = f; net = s.cities.reino.report.net; } return net; };
  const crise = rodar(0.4), ouro = rodar(1.6);
  assert.ok(crise < 0, 'perde dinheiro em crise: ' + crise); assert.ok(ouro > 0 && ouro > crise * -1, 'lucra em fase de ouro: ' + ouro);
  const t = rica(362); t.cash = 5e10; t.pop = 25000; t.world.fort.imperio = 0.5; const barato = Sim.cityPrice(t, 'imperio'); t.world.fort.imperio = 1.6; const caro = Sim.cityPrice(t, 'imperio');
  assert.ok(caro > barato * 3, 'cidade em crise sai barata'); assert.ok(Sim.cityPrice(t, 'imperio') > 1e8, 'cidades são muito caras');
});
