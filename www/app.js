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
    diver: '📈 Investir em 3 coisas diferentes', team: '👔 Contratar 2 funcionários', happy80: '😄 Deixar todo mundo muito feliz',
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

  // Dica ocasional: descreve o problema, a solução é com você
  function tip(a) {
    const h = Sim.hint(s, a);
    return h ? [h.icon, h.text] : null;
  }

  const GROUPS = [
    ['🏠 Morar', ['casa', 'predio']],
    ['💼 Trabalhar', ['loja', 'fabrica']],
    ['❤️ Cuidar do povo', ['escola', 'hospital', 'policia', 'parque']],
  ];

  function buildCard(k, c) {
    const b = Sim.BUILDINGS[k], n = c[k] || 0;
    return `<div class="card asset "><div class="top"><span class="ico">${b.icon}</span>
      <div class="nm">${b.name}<small>${TAGS[k]}</small></div>
      <div class="val">${n}<small>você tem</small></div></div>
      <div class="btns"><button class="btn" data-build="${k}" ${s.cash < b.cost ? 'disabled' : ''}>Construir ${M(b.cost)}</button>
      <button class="btn sec" data-demo="${k}" ${n ? '' : 'disabled'}>Demolir</button></div>
      </div>`;
  }

  function viewCity() {
    const a = Sim.analyze(s), t = tip(a), c = a.c;
    const sky = ['🏛️'].concat(s.tiles.filter(k => k && k !== 'prefeitura').sort().map(k => Sim.BUILDINGS[k].icon)).join('');
    const groups = GROUPS.map(([title, keys]) => `<h4>${title}</h4><div class="assets">${keys.map(k => buildCard(k, c)).join('')}</div>`).join('');
    const need = Sim.needs(s);
    const planner = Sim.hired(s, 'planejador')
      ? `<div class="card staffnote"><h3>🏗️ Planejador Urbano</h3>${need.length
          ? 'Faltam: ' + need.map(x => `${x.n} ${Sim.BUILDINGS[x.key].icon}`).join(' · ')
          : 'A cidade está bem atendida. 👍'}<div class="mut" style="margin-top:4px">${Sim.active(s, 'planejador') ? 'Ele constrói sozinho quando sobra dinheiro.' : 'Decisões automáticas desligadas.'}</div></div>`
      : Sim.isUnlocked(s, 'planejador') ? `<div class="card staffnote">🏗️ Você já pode contratar um <b>Planejador Urbano</b> na aba 👔 Equipe.</div>` : '';
    return `<div class="cityview"><div class="side">
      ${t ? `<div class="tip"><span class="ico">${t[0]}</span><span>${t[1]}</span></div>` : '<div class="quiet">📰 Nenhuma reclamação por enquanto.</div>'}
      ${planner}
      <div class="card"><h3>🏙️ Sua cidade</h3><div class="sky">${sky}</div></div>
      <div class="minis">
        <div class="mini"><b>${meter(a.empRate)}</b>💼 Emprego</div>
        <div class="mini"><b>${meter(a.cov.edu)}</b>🏫 Escola</div>
        <div class="mini"><b>${meter(a.cov.health)}</b>🏥 Saúde</div>
        <div class="mini"><b>${meter(a.cov.safety)}</b>🚓 Seguro</div>
        <div class="mini"><b>${meter(a.cov.park)}</b>🌳 Lazer</div>
      </div></div><div class="builds">${groups}</div></div>`;
  }

  function viewInvest() {
    const chips = [500, 1000, 5000, 10000].map(v => `<button class="chip ${v === amount ? 'on' : ''}" data-amt="${v}">${M(v)}</button>`).join('');
    const cards = Sim.ASSETS.map(d => {
      const x = s.assets[d.key], val = x.units * x.price, pl = x.spent > 0 ? (val / x.spent - 1) * 100 : 0;
      const r = RISK[d.key], adv = Sim.hired(s, 'analista') ? Sim.advice(s, d.key) : null;
      return `<div class="card asset"><div class="top"><span class="ico">${d.icon}</span>
        <div class="nm">${d.name}<small>${r[0]} ${r[1]}</small></div>
        <div class="val">${M(val)}${x.units > 0 ? `<small class="${cls(pl)}">${pl >= 0 ? '▲' : '▼'} ${Math.abs(pl).toFixed(1)}%</small>` : ''}</div></div>
        ${adv ? `<div class="advice">📊 ${adv.icon} ${adv.text}</div>` : ''}
        <div class="btns"><button class="btn" data-buy="${d.key}" ${s.cash < amount ? 'disabled' : ''}>Comprar</button>
        <button class="btn sec" data-sell="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Vender</button>
        <button class="btn sec" data-sellall="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Tudo</button></div></div>`;
    }).join('');
    const hint = !Sim.hired(s, 'analista') && Sim.isUnlocked(s, 'analista')
      ? `<div class="card staffnote">📊 Você já pode contratar um <b>Analista de Investimentos</b> na aba 👔 Equipe.</div>` : '';
    const auto = Sim.hired(s, 'analista') ? `<div class="mut" style="margin-bottom:10px">${Sim.active(s, 'analista') ? '📊 O analista aplica as sobras em Renda Fixa e vende se algo cair 25%.' : '📊 Decisões automáticas do analista desligadas.'}</div>` : '';
    return `${hint}${auto}<div class="chips">${chips}</div><div class="assets">${cards}</div>`;
  }

  function manager(a) {
    if (!Sim.hired(s, 'gerente')) {
      return Sim.isUnlocked(s, 'gerente') ? `<div class="card staffnote">🏦 Você já pode contratar um <b>Gerente Financeiro</b> na aba 👔 Equipe.</div>` : '';
    }
    let msg;
    if (s.cash < 0) msg = 'Estamos no vermelho! Vamos resolver isso.';
    else if (s.debt > 0) msg = `Você paga ${M(s.debt * Sim.loanRate(s))} de juros por mês. Vou quitar quando sobrar dinheiro.`;
    else msg = 'Sem dívidas. Se faltar dinheiro, eu peço um empréstimo pequeno.';
    return `<div class="card staffnote"><h3>🏦 Gerente Financeiro</h3>${msg}${Sim.active(s, 'gerente') ? '' : '<div class="mut" style="margin-top:4px">Decisões automáticas desligadas.</div>'}</div>`;
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
    ${manager(a)}
    <div class="card"><h3>💳 Empréstimo</h3>
      <div class="mut">Pegue dinheiro emprestado, mas a dívida cobra ${(Sim.loanRate(s) * 100).toFixed(1).replace('.', ',')}% de juros todo mês.</div>
      <div class="btns"><button class="btn" data-loan="5000">Pegar R$ 5.000</button>
      <button class="btn sec" data-pay="5000" ${s.debt <= 0 ? 'disabled' : ''}>Pagar R$ 5.000</button>
      <button class="btn sec" data-pay="all" ${s.debt <= 0 ? 'disabled' : ''}>Quitar tudo</button></div></div>`;
  }

  function viewTeam() {
    const cost = Sim.staffCost(s);
    const cards = Sim.SALARY_ORDER.map(k => {
      const f = Sim.STAFF[k], on = Sim.hired(s, k), open = Sim.isUnlocked(s, k);
      let body;
      if (on) {
        const auto = Sim.active(s, k);
        body = `<div class="btns"><button class="btn ${auto ? '' : 'sec'}" data-auto="${k}">${auto ? '🤖 Decisões automáticas: LIGADAS' : '🤖 Decisões automáticas: DESLIGADAS'}</button>
          <button class="btn red" data-fire="${k}" style="flex:0 0 auto">Demitir</button></div>`;
      } else if (open) {
        body = `<div class="btns"><button class="btn" data-hire="${k}" ${s.cash < f.salary ? 'disabled' : ''}>Contratar · ${M(f.salary)}/mês</button></div>`;
      } else {
        body = `<div class="locked">🔒 ${f.need}</div>`;
      }
      return `<div class="card asset ${open || on ? '' : 'dim'}"><div class="top"><span class="ico">${f.icon}</span>
        <div class="nm">${f.name}<small>${M(f.salary)} por mês</small></div>
        <div class="val">${on ? '✅' : open ? '' : '🔒'}</div></div>
        <div class="mut" style="margin-top:8px;font-size:14px">${f.desc}</div>${body}</div>`;
    }).join('');
    return `<div class="card"><h3>👔 Folha de pagamento</h3><div class="big ${cost ? 'neg' : ''}">${cost ? '-' : ''}${M(cost)}</div>
      <div class="mut" style="text-align:center">por mês</div></div><div class="assets">${cards}</div>
      <div class="mut" style="font-size:13px;margin-top:6px">Os funcionários ajudam, mas não fazem tudo: você ainda decide o resto. Dá para desligar as decisões automáticas ou demitir quando quiser.</div>`;
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
    $('view').innerHTML = {city: viewCity, invest: viewInvest, fin: viewFin, team: viewTeam, news: viewNews}[tab]();
    $('view').scrollTop = keep;
  }

  function showOver() {
    $('over').innerHTML = `<div class="panel"><div style="font-size:64px">${s.over.title.startsWith('Fal') ? '💸' : '😡'}</div>
      <h2>${s.over.title}</h2><p>${s.over.text}</p><p class="mut">Patrimônio final: ${M(s.over.score)}</p>
      <button class="btn" id="restart">Jogar de novo</button></div>`;
    $('over').classList.remove('hidden');
  }
  function newGame() {
    s = Sim.newGame(); save(); $('over').classList.add('hidden'); tab = 'city'; render(); setSpeed(1);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    let r;
    if (t.id === 'restart') return newGame();
    if (t.id === 'newgame') { if (confirm('Apagar a cidade e recomeçar?')) newGame(); return; }
    if (d.tab) { tab = d.tab; render(); $('view').scrollTop = 0; return; }
    if (d.speed != null) return setSpeed(+d.speed);
    if (d.build) { r = Sim.buildAny(s, d.build); if (r.ok) toast(Sim.BUILDINGS[d.build].icon + ' ' + Sim.BUILDINGS[d.build].name + ' construída!'); }
    else if (d.demo) { r = Sim.demolishOne(s, d.demo); if (r.ok) toast('Demolido!'); }
    else if (d.amt) { amount = +d.amt; return render(); }
    else if (d.buy) r = Sim.buy(s, d.buy, amount);
    else if (d.sell) r = Sim.sell(s, d.sell, amount);
    else if (d.sellall) r = Sim.sell(s, d.sellall, 'all');
    else if (d.tax) { Sim.setTax(s, s.taxRate + +d.tax); r = {ok: true}; }
    else if (d.hire) { r = Sim.hire(s, d.hire); if (r.ok) toast(Sim.STAFF[d.hire].icon + ' ' + Sim.STAFF[d.hire].name + ' contratado!'); }
    else if (d.fire) { if (!confirm('Demitir ' + Sim.STAFF[d.fire].name + '?')) return; r = Sim.fire(s, d.fire); if (r.ok) toast('Demitido.'); }
    else if (d.auto) { r = Sim.setAuto(s, d.auto, !Sim.active(s, d.auto)); }
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
