(() => {
  const SAVE = 'cidadecapital-save-v1';
  const $ = id => document.getElementById(id);
  const M = Sim.money;
  let s, tab = 'city', speed = 1, amount = 1000, timer = null;

  function save() { try { localStorage.setItem(SAVE, Sim.serialize(s)); } catch (e) {} }
  function loadGame() {
    try { const g = Sim.load(localStorage.getItem(SAVE)); if (g) return g; } catch (e) {}
    return Sim.newGame();
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 1800);
  }
  const cls = v => v >= 0 ? 'pos' : 'neg';
  const sign = v => (v >= 0 ? '+' : '') + M(v);
  const date = () => `Ano ${Math.floor(s.month / 12) + 1} · M${s.month % 12 + 1}`;

  function setSpeed(n) {
    speed = n; clearInterval(timer);
    if (n > 0 && !s.over) timer = setInterval(tick, [0, 2500, 1200, 500][n]);
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === n));
  }
  function tick() {
    const before = s.log.length ? s.log[0] : '';
    Sim.step(s); save();
    if (s.log[0] !== before && s.log[0]) toast(s.log[0].replace(/^Mês \d+: /, ''));
    render();
    if (s.over) { setSpeed(0); showOver(); }
  }

  function header() {
    $('s-cash').textContent = M(s.cash); $('s-cash').className = s.cash < 0 ? 'neg' : '';
    $('s-date').textContent = date();
    $('s-pop').textContent = Math.floor(s.pop).toLocaleString('pt-BR');
    $('s-happy').textContent = Math.round(s.happy) + '%';
    $('s-net').textContent = 'Patrimônio ' + M(Sim.netWorth(s));
  }

  function bar(label, v) {
    const p = Math.round(v * 100), col = p > 66 ? 'var(--ok)' : p > 33 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="bar"><span>${label}</span><i><b style="width:${p}%;background:${col}"></b></i><span>${p}%</span></div>`;
  }

  function viewCity() {
    const a = Sim.analyze(s);
    let g = '';
    s.tiles.forEach((t, i) => {
      if (t === 'prefeitura') g += `<div class="tile hall" data-i="${i}">🏛️</div>`;
      else if (t) g += `<div class="tile" data-i="${i}">${Sim.BUILDINGS[t].icon}</div>`;
      else g += `<div class="tile empty" data-i="${i}">＋</div>`;
    });
    return `<div class="grid">${g}</div>
    <div class="card"><h3>Como está a cidade</h3>
      ${bar('Emprego', a.empRate)}${bar('Educação', a.cov.edu)}${bar('Saúde', a.cov.health)}
      ${bar('Segurança', a.cov.safety)}${bar('Lazer', a.cov.park)}${bar('Felicidade', a.happy / 100)}
      <div class="row sub"><span>Moradias: ${Math.floor(s.pop)}/${a.housing}</span><span>Empregos: ${a.jobs}</span></div>
      ${a.pollution > 0 ? `<div class="row sub"><span>🏭 Poluição reduz a felicidade em ${a.pollution}</span></div>` : ''}
    </div>
    <div class="card"><h3>Último mês</h3>${s.report ? `
      <div class="row"><span>Receita</span><b class="pos">${sign(s.report.income)}</b></div>
      <div class="row"><span>Despesas</span><b class="neg">-${M(s.report.expenses)}</b></div>
      <div class="row"><span>Saldo</span><b class="${cls(s.report.net)}">${sign(s.report.net)}</b></div>` : '<div class="mut">Aguardando o primeiro mês…</div>'}</div>`;
  }

  function spark(h) {
    const mn = Math.min(...h), mx = Math.max(...h), r = mx - mn || 1;
    const pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1) * 84).toFixed(1)},${(28 - (v - mn) / r * 26).toFixed(1)}`).join(' ');
    const up = h[h.length - 1] >= h[0];
    return `<svg viewBox="0 0 84 30"><polyline fill="none" stroke="${up ? '#3ddc97' : '#ff6b6b'}" stroke-width="2" points="${pts}"/></svg>`;
  }
  function viewInvest() {
    const chips = [500, 1000, 5000, 10000].map(v => `<button class="chip ${v === amount ? 'on' : ''}" data-amt="${v}">${M(v)}</button>`).join('');
    const cards = Sim.ASSETS.map(d => {
      const x = s.assets[d.key], val = x.units * x.price, pl = x.spent > 0 ? (val / x.spent - 1) * 100 : 0;
      const prev = x.hist.length > 1 ? x.hist[x.hist.length - 2] : x.price, ch = (x.price / prev - 1) * 100;
      return `<div class="card asset"><div class="top"><span class="ico">${d.icon}</span>
        <div><b>${d.name}</b><div class="mut" style="font-size:12px">${d.desc}</div></div>${spark(x.hist)}</div>
        <div class="row"><span>Cotação</span><span>${x.price.toFixed(2)} <small class="${cls(ch)}">${ch >= 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(1)}%</small></span></div>
        <div class="row"><span>Sua posição</span><b>${M(val)} ${x.units > 0 ? `<small class="${cls(pl)}">(${pl >= 0 ? '+' : ''}${pl.toFixed(1)}%)</small>` : ''}</b></div>
        <div class="btns"><button class="btn" data-buy="${d.key}" ${s.cash < amount ? 'disabled' : ''}>Comprar</button>
        <button class="btn sec" data-sell="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Vender</button>
        <button class="btn sec" data-sellall="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Tudo</button></div></div>`;
    }).join('');
    return `<div class="mut" style="font-size:13px;margin-bottom:6px">Valor por operação (taxa de 0,3% nas compras e vendas, exceto poupança):</div><div class="chips">${chips}</div>${cards}`;
  }

  function viewFin() {
    const r = s.report, a = Sim.analyze(s);
    const rep = r ? `
      <div class="row"><span>Impostos</span><span class="pos">${sign(r.taxes)}</span></div>
      <div class="row"><span>Aluguéis</span><span class="pos">${sign(r.rent)}</span></div>
      <div class="row"><span>Lucro do comércio</span><span class="pos">${sign(r.commerce)}</span></div>
      <div class="row"><span>Lucro da indústria</span><span class="pos">${sign(r.industry)}</span></div>
      <div class="row"><span>Manutenção</span><span class="neg">-${M(r.maint)}</span></div>
      <div class="row"><span>Juros de dívida</span><span class="neg">-${M(r.interest + r.overdraft)}</span></div>
      <div class="row"><b>Saldo do mês</b><b class="${cls(r.net)}">${sign(r.net)}</b></div>` : '<div class="mut">Ainda sem dados.</div>';
    return `<div class="card"><h3>Patrimônio</h3>
      <div class="row"><span>Caixa</span><b>${M(s.cash)}</b></div>
      <div class="row"><span>Investimentos</span><b>${M(Sim.holdingsValue(s))}</b></div>
      <div class="row"><span>Imóveis (50% do custo)</span><b>${M(Sim.netWorth(s) - s.cash - Sim.holdingsValue(s) + s.debt)}</b></div>
      <div class="row"><span>Dívida</span><b class="neg">-${M(s.debt)}</b></div>
      <div class="row"><b>Total</b><b>${M(Sim.netWorth(s))}</b></div></div>
    <div class="card"><h3>Imposto municipal: ${s.taxRate}%</h3>
      <div class="stepper"><button data-tax="-1">−</button><b>${s.taxRate}%</b><button data-tax="1">+</button></div>
      <div class="mut" style="font-size:12px;text-align:center">Mais imposto = mais receita, menos felicidade (${a.taxEffect >= 0 ? '+' : ''}${a.taxEffect.toFixed(1)}).</div></div>
    <div class="card"><h3>Empréstimo (juros de 1,5% ao mês)</h3>
      <div class="row"><span>Dívida atual</span><b>${M(s.debt)}</b></div>
      <div class="row sub"><span>Limite disponível</span><span>${M(Sim.LOAN_LIMIT - s.debt)}</span></div>
      <div class="btns"><button class="btn" data-loan="5000">Pegar R$ 5.000</button><button class="btn sec" data-pay="5000" ${s.debt <= 0 ? 'disabled' : ''}>Pagar R$ 5.000</button>
      <button class="btn sec" data-pay="all" ${s.debt <= 0 ? 'disabled' : ''}>Quitar</button></div></div>
    <div class="card"><h3>Balanço do último mês</h3>${rep}</div>`;
  }

  function viewNews() {
    const goals = Sim.GOALS.map(g => `<div class="goal">${s.goals[g.id] ? '✅' : '⬜'} ${g.text}</div>`).join('');
    const log = s.log.map(l => `<div class="log">${l}</div>`).join('');
    return `<div class="card"><h3>Metas</h3>${goals}</div><div class="card"><h3>Notícias da cidade</h3>${log}</div>
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
    if (t === 'prefeitura') return openSheet(`<h3>🏛️ Prefeitura</h3><p class="mut">Sede do governo: manutenção de R$ 50 por mês e 5 empregos. Não pode ser demolida.</p><button class="btn sec" data-close>Fechar</button>`);
    if (t) {
      const b = Sim.BUILDINGS[t];
      return openSheet(`<h3>${b.icon} ${b.name}</h3><p class="mut">${b.desc}<br>Manutenção: ${M(b.upkeep)}/mês</p>
        <div class="btns"><button class="btn red" data-demo="${i}">Demolir (+${M(b.cost / 2)})</button><button class="btn sec" data-close>Fechar</button></div>`);
    }
    const opts = Object.entries(Sim.BUILDINGS).map(([k, b]) =>
      `<button class="opt" data-build="${k}" data-i="${i}" ${s.cash < b.cost ? 'disabled' : ''}><span class="ico">${b.icon}</span>
        <span><b>${b.name}</b> <small>${b.kind} · manutenção ${M(b.upkeep)}/mês</small><small>${b.desc}</small></span><span class="p">${M(b.cost)}</span></button>`).join('');
    openSheet(`<h3>Construir</h3>${opts}<button class="btn sec" data-close style="width:100%">Cancelar</button>`);
  }

  function showOver() {
    $('over').innerHTML = `<div class="panel"><div style="font-size:56px">${s.over.title.startsWith('Fal') ? '💸' : '🔥'}</div>
      <h2>${s.over.title}</h2><p>${s.over.text}</p><p class="mut">Sobreviveu ${s.month} meses · patrimônio final ${M(s.over.score)}</p>
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
