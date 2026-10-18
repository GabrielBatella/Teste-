(() => {
  const SAVE = 'cidadecapital-save-v1';
  const $ = id => document.getElementById(id);
  const M = Sim.money;
  let s, tab = 'city', speed = 1, amount = 1000, timer = null;

  const TAGS = {
    casa: 'Moradia', predio: 'Muita moradia', loja: 'Empregos e lucro', fabrica: 'Empregos, mas suja',
    escola: 'Educação', hospital: 'Saúde', policia: 'Segurança', parque: 'Diversão',
  };
  const RISK = {poupanca: ['🟢', 'Seguro'], cdb: ['🟢', 'Seguro'], fii: ['🟡', 'Médio'], acoes: ['🟠', 'Arriscado'], cripto: ['🔴', 'Muito arriscado']};
  const MISSIONS = {
    pop100: '👥 100 habitantes', pop500: '👥 500 habitantes', pop1500: '👥 1.500 habitantes',
    nw50: '💰 R$ 50 mil de patrimônio', nw200: '💰 R$ 200 mil de patrimônio', nw1m: '💎 R$ 1 milhão de patrimônio',
    diver: '📈 Investir em 3 coisas diferentes', happy80: '😄 Deixar todo mundo muito feliz',
  };

  function save() { try { localStorage.setItem(SAVE, Sim.serialize(s)); } catch (e) {} }
  function loadGame() {
    try { const g = Sim.load(localStorage.getItem(SAVE)); if (g) return g; } catch (e) {}
    return Sim.newGame();
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2200);
  }
  const cls = v => v >= 0 ? 'pos' : 'neg';
  const sign = v => (v >= 0 ? '+' : '') + M(v);
  const face = h => h >= 80 ? '😄' : h >= 60 ? '🙂' : h >= 45 ? '😐' : h >= 30 ? '🙁' : '😡';
  const meter = v => v >= 0.66 ? '🟢' : v >= 0.33 ? '🟡' : '🔴';

  function setSpeed(n) {
    speed = n; clearInterval(timer);
    if (n > 0 && !s.over) timer = setInterval(tick, [0, 2500, 1200][n]);
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === n));
  }
  function tick() {
    const before = s.log[0];
    Sim.step(s); save();
    if (s.log[0] !== before) toast(s.log[0].replace(/^Mês \d+: /, ''));
    render();
    if (s.over) { setSpeed(0); showOver(); }
  }

  function header() {
    $('s-cash').textContent = M(s.cash); $('s-cash').className = s.cash < 0 ? 'neg' : '';
    const d = $('s-delta');
    if (s.report) { d.textContent = sign(s.report.net) + ' por mês'; d.className = cls(s.report.net); } else d.textContent = '';
    $('s-pop').textContent = Math.floor(s.pop).toLocaleString('pt-BR');
    $('s-face').textContent = face(s.happy);
  }

  // Dica simples para quem não quer pensar muito
  function tip(a) {
    const pop = s.pop;
    if (s.cash < -1000) return ['🚨', 'Você está no vermelho! Venda um investimento ou aumente o imposto.'];
    if (s.cash < 800) return ['⏳', 'Pouco dinheiro. Espere o dinheiro entrar!'];
    if (a.empRate < 0.8) return ['🏪', 'Faltam empregos! Construa uma loja ou fábrica.'];
    if (pop >= a.housing - 2) return ['🏠', 'A cidade está cheia! Construa casas para crescer.'];
    if (pop > 40 && a.cov.edu < 0.5) return ['🏫', 'O povo quer estudar! Construa uma escola.'];
    if (pop > 60 && a.cov.health < 0.5) return ['🏥', 'Falta saúde! Construa um hospital.'];
    if (pop > 60 && a.cov.safety < 0.5) return ['🚓', 'Falta segurança! Construa uma delegacia.'];
    if (pop > 40 && a.cov.park < 0.4) return ['🌳', 'Que tal um parque para o povo se divertir?'];
    if (s.cash > 6000) return ['💰', 'Sobrou dinheiro! Invista na aba 💰 para ele render.'];
    return ['😎', 'Tudo certo! Relaxe e veja a cidade crescer.'];
  }

  function viewCity() {
    const a = Sim.analyze(s), t = tip(a);
    let g = '';
    s.tiles.forEach((k, i) => {
      if (k === 'prefeitura') g += `<div class="tile hall" data-i="${i}">🏛️</div>`;
      else if (k) g += `<div class="tile" data-i="${i}">${Sim.BUILDINGS[k].icon}</div>`;
      else g += `<div class="tile empty" data-i="${i}">＋</div>`;
    });
    return `<div class="cityview"><div class="grid">${g}</div><div class="side">
      <div class="tip"><span class="ico">${t[0]}</span><span>${t[1]}</span></div>
      <div class="minis">
        <div class="mini"><b>${meter(a.empRate)}</b>💼 Emprego</div>
        <div class="mini"><b>${meter(a.cov.edu)}</b>🏫 Escola</div>
        <div class="mini"><b>${meter(a.cov.health)}</b>🏥 Saúde</div>
        <div class="mini"><b>${meter(a.cov.safety)}</b>🚓 Seguro</div>
        <div class="mini"><b>${meter(a.cov.park)}</b>🌳 Lazer</div>
      </div></div></div>`;
  }

  function viewInvest() {
    const chips = [500, 1000, 5000, 10000].map(v => `<button class="chip ${v === amount ? 'on' : ''}" data-amt="${v}">${M(v)}</button>`).join('');
    const cards = Sim.ASSETS.map(d => {
      const x = s.assets[d.key], val = x.units * x.price, pl = x.spent > 0 ? (val / x.spent - 1) * 100 : 0;
      const r = RISK[d.key];
      return `<div class="card asset"><div class="top"><span class="ico">${d.icon}</span>
        <div class="nm">${d.name}<small>${r[0]} ${r[1]}</small></div>
        <div class="val">${M(val)}${x.units > 0 ? `<small class="${cls(pl)}">${pl >= 0 ? '▲' : '▼'} ${Math.abs(pl).toFixed(1)}%</small>` : ''}</div></div>
        <div class="btns"><button class="btn" data-buy="${d.key}" ${s.cash < amount ? 'disabled' : ''}>Comprar</button>
        <button class="btn sec" data-sell="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Vender</button>
        <button class="btn sec" data-sellall="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Tudo</button></div></div>`;
    }).join('');
    return `<div class="chips">${chips}</div><div class="assets">${cards}</div>`;
  }

  function viewFin() {
    const a = Sim.analyze(s), net = s.report ? s.report.net : 0;
    return `<div class="card"><h3>Patrimônio total</h3><div class="big">${M(Sim.netWorth(s))}</div>
      <div class="row"><span>💰 Dinheiro</span><b>${M(s.cash)}</b></div>
      <div class="row"><span>📈 Investimentos</span><b>${M(Sim.holdingsValue(s))}</b></div>
      <div class="row"><span>💳 Dívida</span><b class="${s.debt ? 'neg' : ''}">${M(s.debt)}</b></div>
      <div class="row"><span>Ganho por mês</span><b class="${cls(net)}">${sign(net)}</b></div></div>
    <div class="card"><h3>🏛️ Imposto da cidade</h3>
      <div class="stepper"><button data-tax="-1">−</button><b>${s.taxRate}%</b><button data-tax="1">+</button></div>
      <div class="mut" style="text-align:center">${a.taxEffect < -0.5 ? '😠 Imposto alto: o povo reclama' : a.taxEffect > 0.5 ? '😊 Imposto baixo: o povo gosta' : 'Imposto normal'}</div></div>
    <div class="card"><h3>💳 Empréstimo</h3>
      <div class="mut">Pegue dinheiro emprestado, mas a dívida cobra juros todo mês.</div>
      <div class="btns"><button class="btn" data-loan="5000">Pegar R$ 5.000</button>
      <button class="btn sec" data-pay="5000" ${s.debt <= 0 ? 'disabled' : ''}>Pagar R$ 5.000</button>
      <button class="btn sec" data-pay="all" ${s.debt <= 0 ? 'disabled' : ''}>Quitar tudo</button></div></div>`;
  }

  function viewNews() {
    const done = Sim.GOALS.filter(g => s.goals[g.id]).length;
    const list = Sim.GOALS.map(g => `<div class="mission ${s.goals[g.id] ? 'done' : ''}"><span class="ico">${s.goals[g.id] ? '✅' : '⬜'}</span>${MISSIONS[g.id] || g.text}</div>`).join('');
    return `<div class="card"><h3>⭐ Missões (${done}/${Sim.GOALS.length})</h3>${list}</div>
      <div class="btns"><button class="btn red" id="newgame">Recomeçar jogo</button></div>`;
  }

  function render() {
    header();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const keep = $('view').scrollTop;
    $('view').innerHTML = {city: viewCity, invest: viewInvest, fin: viewFin, news: viewNews}[tab]();
    $('view').scrollTop = keep;
  }

  function openSheet(html) { $('sheet').innerHTML = `<div class="panel">${html}</div>`; $('sheet').classList.remove('hidden'); }
  function closeSheet() { $('sheet').classList.add('hidden'); }

  function tileSheet(i) {
    const t = s.tiles[i];
    if (t === 'prefeitura') return openSheet(`<h3>🏛️ Prefeitura</h3><p class="mut" style="text-align:center">É a sede da sua cidade. Ela não pode ser demolida.</p><div class="btns"><button class="btn sec" data-close>Fechar</button></div>`);
    if (t) {
      const b = Sim.BUILDINGS[t];
      return openSheet(`<h3>${b.icon} ${b.name}</h3><p class="mut" style="text-align:center">${TAGS[t]}</p>
        <div class="btns"><button class="btn red" data-demo="${i}">Demolir (+${M(b.cost / 2)})</button><button class="btn sec" data-close>Fechar</button></div>`);
    }
    const opts = Object.entries(Sim.BUILDINGS).map(([k, b]) =>
      `<button class="opt" data-build="${k}" data-i="${i}" ${s.cash < b.cost ? 'disabled' : ''}><span class="ico">${b.icon}</span>
        <b>${b.name}</b><small>${TAGS[k]}</small><span class="p">${M(b.cost)}</span></button>`).join('');
    openSheet(`<h3>O que construir?</h3><div class="opts">${opts}</div><div class="btns"><button class="btn sec" data-close>Cancelar</button></div>`);
  }

  function showOver() {
    $('over').innerHTML = `<div class="panel"><div style="font-size:64px">${s.over.title.startsWith('Fal') ? '💸' : '😡'}</div>
      <h2>${s.over.title}</h2><p>${s.over.text}</p><p class="mut">Patrimônio final: ${M(s.over.score)}</p>
      <button class="btn" id="restart">Jogar de novo</button></div>`;
    $('over').classList.remove('hidden');
  }
  function newGame() {
    s = Sim.newGame(); save(); $('over').classList.add('hidden'); closeSheet(); tab = 'city'; render(); setSpeed(1);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button, .tile'); if (!t) return;
    const d = t.dataset;
    let r;
    if (t.id === 'restart') return newGame();
    if (t.id === 'newgame') { if (confirm('Apagar a cidade e recomeçar?')) newGame(); return; }
    if ('close' in d) return closeSheet();
    if (d.tab) { tab = d.tab; return render(); }
    if (d.speed != null) return setSpeed(+d.speed);
    if (t.classList.contains('tile')) return tileSheet(+d.i);
    if (d.build) { r = Sim.build(s, +d.i, d.build); if (r.ok) closeSheet(); }
    else if (d.demo) { r = Sim.demolish(s, +d.demo); if (r.ok) closeSheet(); }
    else if (d.amt) { amount = +d.amt; return render(); }
    else if (d.buy) r = Sim.buy(s, d.buy, amount);
    else if (d.sell) r = Sim.sell(s, d.sell, amount);
    else if (d.sellall) r = Sim.sell(s, d.sellall, 'all');
    else if (d.tax) { Sim.setTax(s, s.taxRate + +d.tax); r = {ok: true}; }
    else if (d.loan) r = Sim.borrow(s, +d.loan);
    else if (d.pay) r = Sim.repay(s, d.pay === 'all' ? s.debt : +d.pay);
    else return;
    if (r && !r.ok) toast(r.msg);
    save(); render();
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInterval(timer); save(); } else setSpeed(speed); });

  s = loadGame();
  window.__game = {get s() { return s; }, tick, setSpeed};
  render(); if (s.over) showOver(); else setSpeed(1);
})();
