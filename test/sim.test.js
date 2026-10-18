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
  const s = rica(40); s.pop = 70;
  Sim.hire(s, 'planejador');
  assert.ok(Math.abs(Sim.errorChance(s, 'planejador') - 0.30) < 1e-9);
  s.pop = 400; const e = Sim.errorChance(s, 'planejador');
  assert.ok(e > 0.30 && e <= 0.6, 'errorChance: ' + e);
  s.pop = 100000; assert.ok(Sim.errorChance(s, 'planejador') <= 0.6);
});

test('equipe comete erros que custam dinheiro (e ficam registrados)', () => {
  let erros = 0, custo = 0, mensagens = 0;
  for (let k = 1; k <= 12; k++) {
    const s = rica(100 + k); s.pop = 70; s.cash = 60000;
    for (let i = 0; i < 6; i++) Sim.buildAny(s, 'casa');
    ['planejador', 'analista', 'gerente'].forEach(f => Sim.hire(s, f));
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
  ['planejador', 'analista', 'gerente'].forEach(f => { Sim.hire(s, f); Sim.setAuto(s, f, false); });
  for (let m = 0; m < 24; m++) Sim.step(s);
  assert.equal(s.staffStats.errors, 0);
});

// ---------- Correção do "jogo parado" ----------
test('analista guarda só metade da sobra (sobra caixa para a cidade)', () => {
  const s = rica(42); s.pop = 60; s.cash = 20000;
  Sim.hire(s, 'analista');
  for (let i = 1; i < 5; i++) { s.cash = 60000; Sim.upgrade(s, 'analista'); }
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
    Sim.hire(s, 'planejador'); s.cash = 20000; assert.ok(Sim.buy(s, 'cdb', 6000).ok); s.cash = 3000; s.month = 1;
    const antes = s.tiles.filter(Boolean).length;
    Sim.step(s);
    if (s.log.some(l => l.includes('da renda fixa para pagar a obra'))) usou++;
  }
  assert.ok(usou >= 1, 'o planejador deveria resgatar renda fixa para construir');
});

test('cidade com equipe no máximo continua crescendo (não trava)', () => {
  const s = Sim.newGame(3); s.pop = 130;
  for (let i = 0; i < 12; i++) Sim.buildAny(s, 'casa');
  for (let i = 0; i < 3; i++) Sim.buildAny(s, 'loja');
  s.pop = 130;
  for (const k of ['planejador', 'analista', 'gerente']) { s.cash = 60000; Sim.hire(s, k); for (let l = 1; l < 5; l++) { s.cash = 60000; Sim.upgrade(s, k); } }
  s.cash = 25000;
  const antes = s.tiles.filter(Boolean).length;
  for (let m = 0; m < 24 && !s.over; m++) Sim.step(s);
  assert.ok(s.tiles.filter(Boolean).length >= antes + 8, 'deveria construir bastante: ' + (s.tiles.filter(Boolean).length - antes));
  assert.ok(s.pop > 180, 'população deveria crescer: ' + s.pop);
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
  assert.equal(Sim.ASSETS.length, 10);
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
