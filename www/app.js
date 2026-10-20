(() => {
  const SAVE = 'cidadecapital-save-v1';
  const $ = id => document.getElementById(id);
  const M = Sim.money;
  let s, tab = 'city', speed = 1, amount = 1000, timer = null, tickMs = 5000, sinceTick = 0, histFilter = 'all';

  const TAGS = {
    casa: 'Moradia', predio: 'Muita moradia', loja: 'Empregos e lucro', fabrica: 'Empregos, mas suja',
    escola: 'Educação', hospital: 'Saúde', policia: 'Segurança', parque: 'Diversão',
    condominio: 'Moradores ricos', mercado: 'Muitos empregos e vendas', fazenda: 'Empregos, sem poluição', tecnologia: 'Lucra com educação',
    universidade: 'Muita educação', bombeiros: 'Protege de incêndios', estadio: 'Diversão e turismo',
    agua: 'Água para o povo', esgoto: 'Saneamento básico', solar: 'Energia limpa (pequena)', eolica: 'Energia limpa', carvao: 'Muita energia, mas polui',
    filtro: 'Limpa o ar', floresta: 'Barato, limpa o ar', reciclagem: 'Limpa o ar e dá lucro',
  };
  const RISK = {
    poupanca: ['🟢', 'Seguro'], tesouro: ['🟢', 'Seguro'], cdb: ['🟢', 'Seguro, banco gigante'], cdb_b: ['🟢', 'Baixo risco'],
    cdb_c: ['🟡', 'Risco médio: pode ter crise'], cdb_d: ['🔴', 'Pode quebrar!'],
    divid: ['🟡', 'Médio'], fii: ['🟡', 'Médio'], ouro: ['🟡', 'Médio'], etf: ['🟡', 'Médio'], dolar: ['🟡', 'Médio'],
    acoes: ['🟠', 'Arriscado'], cripto: ['🔴', 'Muito arriscado'], startup: ['🔴', 'Loteria'],
  };
  const ASSET_GROUPS = [
    ['🟢 Seguros', ['poupanca', 'tesouro']],
    ['🏦 Bancos (CDB): quanto mais paga, mais arrisca', ['cdb', 'cdb_b', 'cdb_c', 'cdb_d']],
    ['💵 Pagam dividendos todo mês', ['divid', 'fii']],
    ['🟡 Moderados', ['ouro', 'etf', 'dolar']],
    ['🔴 Arriscados: podem render muito mais', ['acoes', 'cripto', 'startup']],
    ['🌍 Bolsas do mundo: sobem e caem com a economia de cada país', Sim.WORLD_ASSETS],
  ];

  const SEEN = 'cidadecapital-seen', MAX_AWAY_MONTHS = 480;
  function markSeen() { try { localStorage.setItem(SEEN, JSON.stringify({t: Date.now(), speed})); } catch (e) {} }
  function save() { try { localStorage.setItem(SAVE, Sim.serialize(s)); } catch (e) {} markSeen(); }
  function loadGame() {
    try { const g = Sim.load(localStorage.getItem(SAVE)); if (g) return g; } catch (e) {}
    return Sim.newGame();
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3800);
  }
  const cls = v => v >= 0 ? 'pos' : 'neg';
  const sign = v => (v >= 0 ? '+' : '') + M(v);
  const face = h => h >= 80 ? '😄' : h >= 60 ? '🙂' : h >= 45 ? '😐' : h >= 30 ? '🙁' : '😡';
  const meter = v => v >= 0.66 ? '🟢' : v >= 0.33 ? '🟡' : '🔴';

  function setSpeed(n) {
    speed = n; clearInterval(timer); tickMs = [5000, 5000, 2400][n];
    if (n > 0 && !s.over) timer = setInterval(tick, tickMs);
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === n));
  }
  function tick() {
    const before = s.log[0]; sinceTick = 0;
    Sim.step(s); save();
    if (s.log[0] !== before) toast(s.log[0].replace(/^Mês \d+: /, ''));
    render();
    if (s.over) { setSpeed(0); showOver(); }
  }

  function header() {
    $('s-cash').textContent = M(s.cash); $('s-cash').className = s.cash < 0 ? 'neg' : '';
    const d = $('s-delta');
    if (s.cash < 0) { d.textContent = 'No vermelho! Limite ' + M(-Sim.OVERDRAFT_LIMIT); d.className = 'neg'; }
    else if (s.report) { d.textContent = sign(s.report.net) + ' por mês'; d.className = cls(s.report.net); } else d.textContent = '';
    $('s-pop').textContent = Math.floor(s.pop).toLocaleString('pt-BR');
    $('s-face').textContent = face(s.happy);
    const unread = Math.max(0, (s.histN || 0) - (s.histRead || 0)), hb = $('histn');
    hb.textContent = unread > 99 ? '99+' : unread; hb.classList.toggle('hidden', unread === 0);
  }

  // ---------- Histórico de avisos ----------
  const HIST_FILTERS = {all: ['Tudo', null], money: ['💰 Dinheiro', /R\$|investi|banco|CDB|dívida|empréstimo|imposto|lucro|prejuízo|dividend/i], team: ['👔 Equipe', /😅|construiu|reformou|contratad|demitid|treinad|Gerente|Analista|Corretor|Diplomata|Arquiteto|Auditor|Tesoureiro|Contador|Economista|Gestor|Obras|Infra|Ambiental|Social|Global/], world: ['🌍 Mundo', /tratado|relação|país|vizinh|República|Reino|Império|Federação|Ilhas|Pampas|Ducado|Emirado|Arquipélago|União|decisão política|pedido/i]};
  function showHist() {
    const f = HIST_FILTERS[histFilter][1];
    const list = (s.hist || []).filter(h => !f || f.test(h.t));
    let last = null, body = '';
    list.slice(0, 250).forEach(h => {
      if (h.m !== last) { body += `<div class="histm">📅 Mês ${h.m}</div>`; last = h.m; }
      body += `<div class="logline">${h.t}</div>`;
    });
    $('hist').innerHTML = `<div class="panel hpanel"><div class="hhead"><h3>📜 Histórico de avisos</h3><button class="btn sec" id="histclose">Fechar</button></div>
      <div class="chips">${Object.entries(HIST_FILTERS).map(([k, v]) => `<button class="chip ${k === histFilter ? 'on' : ''}" data-hf="${k}">${v[0]}</button>`).join('')}</div>
      <div class="hbody">${body || '<div class="mut">Nada por aqui ainda.</div>'}</div></div>`;
    $('hist').classList.remove('hidden');
    s.histRead = s.histN || 0; header();
  }

  // ---------- Propostas do mundo: janela embaixo com barra de tempo ----------
  let propRef = null, propTotal = 1;
  function currentProposal() {
    const w = s.world;
    if (w.request) return {obj: w.request, kind: 'req'};
    if (w.dilemma) return {obj: w.dilemma, kind: 'dil'};
    return null;
  }
  function renderProp() {
    const el = $('prop'), p = s.over ? null : currentProposal();
    if (!p) { propRef = null; el.classList.add('hidden'); el.innerHTML = ''; return; }
    if (propRef !== p.obj) {
      propRef = p.obj; propTotal = p.obj.total || p.obj.left;
      let head, text, btns;
      if (p.kind === 'req') {
        const r = p.obj, n = Sim.NEIGHBORS.find(x => x.key === r.who);
        head = `📨 ${n.icon} ${n.name} pede dinheiro emprestado`;
        text = `Querem <b>${M(r.amount)}</b> e prometem pagar em ${r.months} meses com juros. Existe risco de calote.`;
        btns = `<button class="btn" data-req="1" ${s.cash < r.amount ? 'disabled' : ''}>Aceitar · emprestar ${M(r.amount)}</button><button class="btn sec" data-req="0">Recusar</button>`;
      } else {
        head = '🗳️ Decisão política'; text = p.obj.text;
        btns = p.obj.options.map((o, i) => `<button class="btn ${i === 0 ? '' : 'sec'}" data-dil="${i}">${o.label}</button>`).join('');
      }
      el.innerHTML = `<div class="propbar"><i id="propfill"></i></div><div class="proptop"><b>${head}</b><span id="propsec"></span></div>
        <div class="proptext">${text}</div><div class="btns propbtns">${btns}</div>`;
      el.classList.remove('hidden');
    }
    updateProp();
  }
  function updateProp() {
    const p = propRef && currentProposal(); if (!p || p.obj !== propRef) return;
    const left = Math.max(0, p.obj.left - Math.min(1, sinceTick / tickMs)), frac = Math.max(0, Math.min(1, left / propTotal));
    const f = $('propfill'); if (f) f.style.width = (frac * 100).toFixed(1) + '%';
    const sec = $('propsec'); if (sec) sec.textContent = speed > 0 ? Math.ceil(left * tickMs / 1000) + 's' : '⏸';
  }
  setInterval(() => { if (speed > 0) sinceTick += 100; updateProp(); }, 100);

  // Dica ocasional: descreve o problema, a solução é com você
  function tip(a) {
    const h = Sim.hint(s, a);
    return h ? [h.icon, h.text] : null;
  }

  const GROUPS = [
    ['🏠 Morar', ['casa', 'predio', 'condominio']],
    ['💼 Trabalhar', ['loja', 'mercado', 'fazenda', 'fabrica', 'tecnologia']],
    ['❤️ Cuidar do povo', ['escola', 'universidade', 'hospital', 'policia', 'bombeiros', 'parque', 'estadio']],
    ['🔧 Água, esgoto e energia', ['agua', 'esgoto', 'solar', 'eolica', 'carvao']],
    ['🌱 Meio ambiente', ['filtro', 'floresta', 'reciclagem']],
  ];

  function levelCounts(k) {
    const n = [0, 0, 0];
    s.tiles.forEach((x, i) => { if (x === k) n[Math.min(3, Math.max(1, (s.lv && s.lv[i]) || 1)) - 1]++; });
    return n;
  }
  const num = v => v.toLocaleString('pt-BR');
  // quadradinhos: cada um vale o que uma casa atende (12 moradores)
  const sq = n => { const m = Math.min(n, 12); return `<span class="sq">${'<i></i>'.repeat(m)}${n > m ? `<b>+${n - m}</b>` : ''}</span>`; };
  function buildCard(k, c) {
    const b = Sim.BUILDINGS[k], n = c[k] || 0, price = Sim.buildCost(s, k), u = Sim.upkeepInfo(s, k);
    const upl = u.public ? `<div class="mut" style="font-size:13px;margin-top:6px">🏛️ Serviço público: custa ${M(Math.round(u.now))}/mês ao governo${n ? ` · a próxima unidade soma +${M(Math.round(u.next))}/mês` : ` · a 1ª custa ${M(Math.round(u.next))}/mês`}</div>` : '';
    const lc = levelCounts(k), info = Sim.unitInfo(k, 1);
    const caps = info.lines.map(l => l.houses ? `<div class="cap"><span>${l.ico} ${l.text.replace(' para ~', ': ')}</span>${sq(l.houses)}</div>` : l.ico === '🏠' ? `<div class="cap"><span>${l.ico} ${l.text}</span>${sq(Math.round(l.v / Sim.BUILDINGS.casa.housing))}</div>` : `<div class="cap"><span>${l.ico} ${l.text}</span></div>`).join('');
    const tiers = info.main ? `<div class="tiersq">${[1, 2, 3].map(L => `<div class="${lc[L - 1] ? 'has' : ''}"><small>${Sim.levelName(k, L)}</small>${sq(Math.max(1, Math.round(Sim.unitInfo(k, L).main / (info.lines[0].houses ? Sim.BUILDINGS.casa.housing : Sim.BUILDINGS.casa.housing))))}</div>`).join('')}</div>` : '';
    const made = lc[1] + lc[2] ? `<div class="mut" style="font-size:12px;margin-top:6px">Você tem: ${[1, 2, 3].filter(L => lc[L - 1]).map(L => `${lc[L - 1]} × ${Sim.levelName(k, L)}`).join(' · ')}</div>` : '';
    const ev = n ? Sim.evolveInfo(s, k) : null;
    let evo = '';
    if (ev && ev.max) evo = '<div class="mut" style="font-size:13px;margin-top:6px">⭐ Todas já estão no nível máximo.</div>';
    else if (ev && (ev.ok || ev.early)) {
      const gain = Math.round(Sim.unitInfo(k, ev.to).main - Sim.unitInfo(k, ev.from).main);
      evo = `<div class="btns"><button class="btn ok2" data-evolve="${k}" ${!ev.ok || s.cash < ev.cost ? 'disabled' : ''}>⬆ Evoluir: ${ev.fromName} → ${ev.toName}<small>${ev.early ? `a cidade precisa de ${num(ev.minPop)} habitantes` : `${M(ev.cost)}${gain > 0 ? ` · +${num(gain)} de capacidade` : ''}`}</small></button></div>`;
    }
    return `<div class="card asset"><div class="top"><span class="ico">${b.icon}</span>
      <div class="nm">${b.name}<small>${TAGS[k]}</small></div>
      <div class="val">${n}<small>você tem</small></div></div>
      <div class="caps">${caps}</div>${tiers}${made}${upl}
      <div class="btns"><button class="btn" data-build="${k}" ${s.cash < price ? 'disabled' : ''}>Construir ${M(price)}${price < b.cost ? `<small>desconto do Arquiteto (era ${M(b.cost)})</small>` : ''}</button>
      <button class="btn sec" data-demo="${k}" ${n ? '' : 'disabled'}>Demolir</button></div>${evo}
      </div>`;
  }

  function coverageCard() {
    const rows = Sim.coverage(s).map(r => {
      const col = r.ratio >= 0.85 ? 'var(--ok)' : r.ratio >= 0.5 ? 'var(--warn)' : 'var(--bad)';
      return `<div class="cov"><div class="covh"><span>${r.icon} ${r.label}</span><b style="color:${col}">${num(Math.min(r.cap, 99999999))} de ${num(r.need)}</b></div>
        <i><b style="width:${Math.round(r.ratio * 100)}%;background:${col}"></b></i>
        <small class="mut">${r.key === 'housing' ? 'vagas para morar' : `atende ${num(r.cap)} ${r.key === 'power' || r.key === 'water' || r.key === 'sewage' ? 'unidades de consumo' : 'moradores'} (≈ ${num(r.houses)} casas)`}</small></div>`;
    }).join('');
    return `<div class="card"><h3>📊 Quanto a cidade aguenta</h3>${rows}<div class="mut" style="font-size:13px;margin-top:6px">Cada quadradinho nos cartões vale uma casa (${Sim.BUILDINGS.casa.housing} moradores). Quando passa da capacidade, o serviço fica fraco e o povo reclama.</div></div>`;
  }

  const BUILDERS = ['arquiteto', 'infra', 'ambiental', 'social'];
  function viewCity() {
    const a = Sim.analyze(s), t = tip(a), c = a.c;
    const kinds = Object.keys(c).filter(k => k !== 'prefeitura' && Sim.BUILDINGS[k]);
    const sky = '<span class="chipb">🏛️ Prefeitura</span>' + kinds.map(k => `<span class="chipb">${Sim.BUILDINGS[k].icon} ${c[k]}</span>`).join('');
    const groups = GROUPS.map(([title, keys]) => `<h4>${title}</h4><div class="assets">${keys.map(k => buildCard(k, c)).join('')}</div>`).join('');
    const need = Sim.needs(s);
    const team = BUILDERS.filter(k => Sim.hired(s, k));
    const planner = team.length
      ? `<div class="card staffnote"><h3>🏗️ Equipe de obras</h3>${need.length
          ? 'Faltam: ' + need.map(x => `${x.n} ${Sim.BUILDINGS[x.key].icon}`).join(' · ')
          : 'A cidade está bem atendida. 👍'}<div class="mut" style="margin-top:4px">${team.some(k => Sim.active(s, k)) ? 'Eles constroem sozinhos quando sobra dinheiro.' : 'Decisões automáticas desligadas.'}</div></div>`
      : '';
    const ph = Sim.phaseOf(s), x2 = v => '×' + v.toFixed(2).replace('.', ',');
    const phase = `<div class="card asset phase"><div class="top"><span class="ico">${ph.icon}</span>
      <div class="nm">${ph.name}<small>Fase ${ph.n} de ${Sim.PHASES.length}${ph.next ? ` · a próxima (${ph.nextName}) começa com ${ph.next.toLocaleString('pt-BR')} habitantes` : ' · fase máxima'}</small></div></div>
      <div class="perks"><span>🏗️ Obras ${x2(ph.prices)}</span><span>🧾 Custos ${x2(ph.costs)}</span><span>⚠️ Eventos ${x2(ph.events)}</span></div></div>`;
    return `<div class="cityview"><div class="side">
      ${phase}
      ${t ? `<div class="tip"><span class="ico">${t[0]}</span><span>${t[1]}</span></div>` : '<div class="quiet">📰 Nenhuma reclamação por enquanto.</div>'}
      ${planner}
      <div class="card"><h3>🏙️ Sua cidade</h3><div class="sky">${sky}</div></div>
      <div class="minis">
        <div class="mini"><b>${meter(a.empRate)}</b>💼 Emprego</div>
        <div class="mini"><b>${meter(a.cov.edu)}</b>🏫 Escola</div>
        <div class="mini"><b>${meter(a.cov.health)}</b>🏥 Saúde</div>
        <div class="mini"><b>${meter(a.cov.safety)}</b>🚓 Seguro</div>
        <div class="mini"><b>${meter(a.cov.park)}</b>🌳 Lazer</div>
      </div>
      <div class="minis">
        <div class="mini"><b>${meter(a.cov.power)}</b>⚡ Energia</div>
        <div class="mini"><b>${meter(a.cov.water)}</b>💧 Água</div>
        <div class="mini"><b>${meter(a.cov.sewage)}</b>🚽 Esgoto</div>
        <div class="mini"><b>${meter(1 - Math.min(1, a.pollution / 16))}</b>🌫️ Ar limpo</div>
      </div></div><div class="builds">${coverageCard()}${groups}</div></div>`;
  }

  function viewMap() {
    return `<div class="mapwrap"><div id="map3d"></div>
      <div class="maphint">👆 Arraste para girar · ✌️ pinça para aproximar · toque duplo reinicia</div>
      <div class="legend">${['casa', 'predio', 'loja', 'fabrica', 'escola', 'hospital', 'policia', 'parque'].map(k => `<span>${Sim.BUILDINGS[k].icon} ${Sim.BUILDINGS[k].name}</span>`).join('')}</div>
      <div class="mut" style="font-size:13px;margin-top:8px">É só para olhar: a cidade cresce e muda sozinha conforme você constrói e evolui os prédios na aba Cidade.</div></div>`;
  }

  function viewInvest() {
    const chips = [500, 1000, 5000, 10000].map(v => `<button class="chip ${v === amount ? 'on' : ''}" data-amt="${v}">${M(v)}</button>`).join('');
    const card = d => {
      const x = s.assets[d.key], val = x.units * x.price, pl = x.spent > 0 ? (val / x.spent - 1) * 100 : 0;
      const r = RISK[d.key] || ['🟡', 'Depende do país'], adv = Sim.hired(s, 'analista') ? Sim.advice(s, d.key) : null, y = Sim.assetYield(s, d.key);
      const pct1 = v => (v * 100).toFixed(2).replace('.', ',') + '%';
      const divLine = y.div > 0 ? `<span class="okchip">💵 Dividendos ${pct1(y.div)}/mês${val > 0 ? ' · ~' + M(val * y.div) + ' por mês' : ''}</span>` : '';
      return `<div class="card asset"><div class="top"><span class="ico">${d.icon}</span>
        <div class="nm">${d.name}<small>${r[0]} ${r[1]}</small></div>
        <div class="val">${M(val)}${x.units > 0 ? `<small class="${cls(pl)}">${pl >= 0 ? '▲' : '▼'} ${Math.abs(pl).toFixed(1)}%</small>` : ''}</div></div>
        <div class="perks"><span>📈 Rende hoje ~${pct1(y.growth)}/mês</span>${divLine}${d.country ? `<span>${s.world.econ[d.country] >= 1.1 ? '🌤️ Economia do país forte' : s.world.econ[d.country] <= 0.9 ? '⛈️ Economia do país fraca' : '☁️ Economia do país estável'}</span>` : ''}</div>
        ${adv ? `<div class="advice">📊 ${adv.icon} ${adv.text}</div>` : ''}
        <div class="btns"><button class="btn" data-buy="${d.key}" ${s.cash < amount ? 'disabled' : ''}>Comprar</button>
        <button class="btn sec" data-sell="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Vender</button>
        <button class="btn sec" data-sellall="${d.key}" ${x.units <= 0 ? 'disabled' : ''}>Tudo</button></div></div>`;
    };
    const cards = ASSET_GROUPS.map(([title, keys]) => `<h4 class="grp">${title}</h4><div class="assets">${keys.map(k => card(Sim.ASSETS.find(d => d.key === k))).join('')}</div>`).join('');
    const hint = '';
    const crew = ['analista', 'corretor', 'risco', 'global'].filter(k => Sim.hired(s, k)).map(k => Sim.STAFF[k].icon + ' ' + Sim.STAFF[k].name).join(' · ');
    const auto = crew ? `<div class="mut" style="margin-bottom:10px">Sua equipe de investimentos: ${crew}</div>` : '';
    const m = s.market, up = m.rate - m.prev;
    const rateCard = `<div class="card"><h3>🏛️ Juros do país: ${(m.rate * 100).toFixed(2).replace('.', ',')}% ao mês ${Math.abs(up) < 0.00005 ? '➖' : up > 0 ? '🔺' : '🔻'}</h3>
      <div class="mut" style="font-size:14px">${m.rate >= 0.0085 ? 'Juros altos: a renda fixa está pagando bem, mas as ações sofrem.' : m.rate <= 0.0045 ? 'Juros baixos: a renda fixa paga pouco. Os investimentos de risco ficam mais atraentes.' : 'Juros normais.'} Cada banco paga um múltiplo disso, então a renda fixa muda de rendimento com o tempo.</div></div>`;
    return `${hint}${rateCard}${auto}<div class="chips">${chips}</div>${cards}`;
  }

  function manager(a) {
    if (!Sim.hired(s, 'gerente')) {
      return '';
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
      ${Sim.foreignDebt(s) ? `<div class="row"><span>🌍 Dívida com outros países</span><b class="neg">${M(Sim.foreignDebt(s))}</b></div>` : ''}
      ${Sim.lentValue(s) ? `<div class="row"><span>🤝 A receber dos vizinhos</span><b class="pos">${M(Sim.lentValue(s))}</b></div>` : ''}
      ${s.report && s.report.exports > 0 ? `<div class="row"><span>📜 Exportações (tratados)</span><b class="pos">${sign(s.report.exports)}</b></div>` : ''}
      ${s.report && s.report.dividends > 0 ? `<div class="row"><span>💵 Dividendos no último mês</span><b class="pos">${sign(s.report.dividends)}</b></div>` : ''}
      <div class="row"><span>Ganho por mês</span><b class="${cls(net)}">${sign(net)}</b></div></div>
    ${(() => { const pc = Sim.publicCosts(s); return pc.rows.length ? `<div class="card"><h3>🏛️ Gastos públicos</h3><div class="big neg">-${M(Math.round(pc.total))}</div><div class="mut" style="text-align:center">por mês com serviços do governo</div>
      ${pc.rows.map(r => `<div class="row"><span>${Sim.BUILDINGS[r.key].icon} ${Sim.BUILDINGS[r.key].name} ×${r.n}</span><b class="neg">-${M(Math.round(r.total))}</b></div>`).join('')}
      <div class="mut" style="font-size:13px;margin-top:6px">Quanto mais unidades do mesmo serviço, mais caro cada uma fica${pc.extra > 1 ? ` (já pagando ${M(Math.round(pc.extra))}/mês a mais por isso)` : ''}.</div></div>` : ''; })()}
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

  function effText(e) {
    const p = Math.round(e * 100);
    if (e >= 0.95) return ['🟢', 'Dá conta da cidade inteira', 'var(--ok)'];
    if (e >= 0.65) return ['🟡', `Meio sobrecarregado: rende ${p}%`, 'var(--warn)'];
    return ['🔴', `Sobrecarregado! Rende só ${p}%`, 'var(--bad)'];
  }

  function staffCard(k) {
    const f = Sim.STAFF[k], on = Sim.hired(s, k);
    const warns = !on ? Sim.hireWarnings(s, k) : [], warn = warns.length > 0;
    const worth = f.pop ? `a partir de ~${f.pop} habitantes` : `a partir de ~${M(f.nw)} de patrimônio`;
    let body = '', sub = `${M(Math.round(f.salary * Sim.FLOW))} por mês no início`;
    if (on) {
      const inf = Sim.staffInfo(s, k), auto = Sim.active(s, k), ef = effText(inf.efficiency);
      sub = `Nível ${inf.level}/${Sim.MAX_LEVEL} · ${M(inf.salary)} por mês`;
      const tr = inf.training;
      const train = inf.nextCost == null
        ? '<button class="btn sec" disabled>⭐ Nível máximo</button>'
        : tr ? `<div class="training"><div class="effhead">🎓 Treinando para o nível ${tr.to}…</div><i><b style="width:${Math.round((1 - tr.left / tr.total) * 100)}%;background:var(--acc)"></b></i><small class="mut">faltam ${tr.left} ${tr.left === 1 ? 'mês' : 'meses'} · enquanto isso ele continua no nível ${inf.level}</small></div>`
        : `<button class="btn" data-upgrade="${k}" ${s.cash < inf.nextCost ? 'disabled' : ''}>🎓 Treinar para o nível ${inf.level + 1}<small>${M(inf.nextCost)} agora · leva ${inf.trainMonths} meses · salário vira ${M(inf.nextSalary)}/mês</small></button>`;
      body = `<div class="eff"><div class="effhead"><span>${ef[0]} ${ef[1]}</span></div>
          <i><b style="width:${Math.round(inf.efficiency * 100)}%;background:${ef[2]}"></b></i>
          <div class="mut" style="font-size:12px">Aguenta uma cidade de até ${inf.capacity.toLocaleString('pt-BR')} habitantes (a sua tem ${Math.floor(s.pop).toLocaleString('pt-BR')}).</div></div>
        <div class="skills">${inf.skills.map(k2 => `<div class="${k2.on ? 'on' : 'off'}">${k2.on ? '✅' : '🔒 Nível ' + k2.lvl + ':'} ${k2.text}</div>`).join('')}</div>
        <div class="perks">${inf.lines.map(l => `<span>${l}</span>`).join('')}${inf.teamBonus > 1 ? `<span class="okchip">🔗 Time completo +${Math.round((inf.teamBonus - 1) * 100)}%</span>` : ''}<span class="warnchip">😅 Erra em ~${Math.round(inf.errorChance * 100)}% das decisões</span></div>
        <div class="btns">${train}</div>
        <div class="btns"><button class="btn ${auto ? '' : 'sec'}" data-auto="${k}">${auto ? '🤖 Decisões automáticas: LIGADAS' : '🤖 Decisões automáticas: DESLIGADAS'}</button>
        <button class="btn red" data-fire="${k}" style="flex:0 0 auto">Demitir</button></div>`;
    } else {
      const skills = (Sim.SKILLS[k] || []).map(([lvl, text]) => `<div class="off">Nível ${lvl}: ${text}</div>`).join('');
      body = `<div class="skills">${skills || '<div class="off">Efeito automático: não toma decisões, só melhora a cidade.</div>'}</div>
        <div class="perks"><span>📏 Compensa ${worth}</span></div>
        ${warns.map(w => `<div class="supline bad">⚠️ ${w}</div>`).join('')}
        <div class="btns"><button class="btn ${warn ? 'red' : ''}" data-hire="${k}" ${s.cash < Math.round(f.salary * Sim.FLOW) ? 'disabled' : ''}>${warn ? 'Contratar mesmo assim' : 'Contratar'} · ${M(Math.round(f.salary * Sim.FLOW))}/mês</button></div>`;
    }
    return `<div class="card asset"><div class="top"><span class="ico">${f.icon}</span>
      <div class="nm">${f.name}<small>${sub}</small></div>
      <div class="val">${on ? '✅' : ''}</div></div>
      <div class="mut" style="margin-top:8px;font-size:14px">${f.desc}</div>${body}</div>`;
  }

  function viewTeam() {
    const cost = Sim.staffCost(s), count = Sim.STAFF_ORDER.filter(k => Sim.hired(s, k)).length;
    const areas = Sim.AREAS.map(([id, title, keys]) => {
      const n = keys.filter(k => Sim.hired(s, k)).length;
      return `<h4 class="grp">${title} <small class="mut">(${n}/5${n > 1 ? ` · time completo +${(n - 1) * 4}%` : ''})</small></h4><div class="assets">${keys.map(staffCard).join('')}</div>`;
    }).join('');
    const st = s.staffStats || {errors: 0, cost: 0};
    const names = Sim.STAFF_ORDER.map(k => Sim.STAFF[k].name);
    const mine = s.log.filter(l => (l.includes('😅') || names.some(n => l.includes(n))) && !/Agora você pode/.test(l)).slice(0, 8);
    const logHtml = mine.length ? mine.map(l => `<div class="logline">${l}</div>`).join('') : '<div class="mut">Ainda não fizeram nada.</div>';
    return `<div class="card staffnote"><h3>📋 Quem contratar?</h3><div class="mut" style="font-size:14px">Ninguém manda em ninguém: todos são iguais. A diferença é o retorno de cada cargo. Um investidor ou analista rende bem mais que quem cuida do meio ambiente; um profissional de relações internacionais rende mais que o da energia. <b>Pesquise o que cada um faz</b> e contrate com critério: contratar errado só gera custo e erros.</div></div><div class="card"><h3>👔 Folha de pagamento (${count} de 15)</h3><div class="big ${cost ? 'neg' : ''}">${cost ? '-' : ''}${M(cost)}</div>
      <div class="mut" style="text-align:center">por mês</div></div>
      <div class="mut" style="font-size:14px;margin-bottom:12px">Cada pessoa é boa em uma coisa. Todas estão liberadas, mas cada uma só ajuda no momento e na ordem certos. Quanto mais gente da mesma área, maior o bônus de time completo, e quanto maior a equipe, mais cara a folha. Quanto maior a cidade, mais trabalho: treine quem ficar sobrecarregado.</div>
      ${areas}
      <div class="card"><h3>📋 O que a equipe fez</h3>${logHtml}
        <div class="mut" style="margin-top:8px">😅 Erros até agora: <b>${st.errors}</b> · custaram <b class="${st.cost ? 'neg' : ''}">${M(st.cost)}</b></div></div>
      <div class="mut" style="font-size:13px;margin-top:6px">Eles ajudam, mas não fazem tudo e podem errar. Dá para desligar as decisões automáticas. Demitir faz perder o nível (e quem depende da pessoa sai junto).</div>`;
  }

  // ---------- Mundo ----------
  const mood = r => r >= 80 ? '😍' : r >= 60 ? '🙂' : r >= 40 ? '😐' : r >= 20 ? '🙁' : '😠';
  function viewWorld() {
    const w = s.world, f = Sim.worldFactor(s);
    let top = '';
    if (w.request) {
      const r = w.request, n = Sim.NEIGHBORS.find(x => x.key === r.who);
      top += `<div class="card staffnote"><h3>📨 ${n.icon} ${n.name} pede dinheiro emprestado</h3>
        Eles querem <b>${M(r.amount)}</b> e prometem pagar em ${r.months} meses com juros. Existe risco de calote.
        <div class="mut">Responda em ${r.left} mês(es).</div>
        <div class="btns"><button class="btn" data-req="1" ${s.cash < r.amount ? 'disabled' : ''}>Emprestar ${M(r.amount)}</button><button class="btn sec" data-req="0">Recusar</button></div></div>`;
    }
    if (w.dilemma) {
      top += `<div class="card staffnote"><h3>🗳️ Decisão política</h3>${w.dilemma.text}<div class="mut">Responda em ${w.dilemma.left} mês(es).</div>
        <div class="btns" style="flex-direction:column">${w.dilemma.options.map((o, i) => `<button class="btn ${i === 0 ? '' : 'sec'}" data-dil="${i}">${o.label}</button>`).join('')}</div></div>`;
    }
    const cards = Sim.NEIGHBORS.map(n => {
      const i = Sim.worldInfo(s, n.key), col = i.rel >= 60 ? 'var(--ok)' : i.rel >= 40 ? 'var(--warn)' : 'var(--bad)';
      const econ = i.econ >= 1.1 ? '📈 Economia forte' : i.econ <= 0.9 ? '📉 Economia fraca' : '➖ Economia estável';
      const ask = Math.min(5000, i.limit);
      return `<div class="card asset"><div class="top"><span class="ico">${i.icon}</span>
        <div class="nm">${i.name}<small>${econ}</small></div><div class="val">${mood(i.rel)}<small>${Math.round(i.rel)}/100</small></div></div>
        <div class="eff"><i><b style="width:${Math.round(i.rel)}%;background:${col}"></b></i></div>
        <div class="mut" style="font-size:13px">${i.desc}</div>
        ${i.treaty ? '<div class="perks"><span class="okchip">📜 Tratado comercial ativo</span></div>' : ''}
        ${i.owed > 0 ? `<div class="row"><span>Você deve</span><b class="neg">${M(i.owed)}</b></div>` : ''}
        <div class="btns">
          <button class="btn sec" data-gift="${n.key}" ${i.giftCd > 0 || s.cash < Sim.GIFT_COST ? 'disabled' : ''}>🎁 Presente ${M(Sim.GIFT_COST)}${i.giftCd > 0 ? '<small>espere um pouco</small>' : ''}</button>
          ${i.treaty ? `<button class="btn sec" data-untreaty="${n.key}">📜 Cancelar tratado</button>`
            : `<button class="btn sec" data-treaty="${n.key}" ${i.rel < 60 || s.cash < Sim.TREATY_COST ? 'disabled' : ''}>📜 Tratado ${M(Sim.TREATY_COST)}<small>${i.rel < 60 ? 'relação precisa passar de 60' : '+' + M(Sim.TREATY_UPKEEP) + '/mês de custo'}</small></button>`}
        </div>
        <div class="btns">
          <button class="btn" data-fborrow="${n.key}" ${i.rel < 40 || ask < 500 ? 'disabled' : ''}>🏦 Pedir ${M(Math.max(0, ask))}<small>${i.rel < 40 ? 'eles não confiam em você' : 'juros de ' + (i.rate * 100).toFixed(1).replace('.', ',') + '% ao mês'}</small></button>
          ${i.owed > 0 ? `<button class="btn sec" data-frepay="${n.key}">💸 Pagar dívida</button>` : ''}
        </div></div>`;
    }).join('');
    const lent = w.lent.length ? `<div class="card"><h3>🤝 Empréstimos que você fez</h3>${w.lent.map(l => {
      const n = Sim.NEIGHBORS.find(x => x.key === l.who);
      return `<div class="row"><span>${n.icon} ${n.name}</span><span>${l.left}x de ${M(l.monthly)}</span></div>`;
    }).join('')}</div>` : '';
    const news = w.news.slice(0, 6).map(l => `<div class="logline">${l}</div>`).join('') || '<div class="mut">Nada de novo pelo mundo.</div>';
    return `${top}<div class="card"><h3>🌍 Seu lugar no mundo</h3>
      <div class="mut">Os outros países mexem um pouco com o seu comércio. Hoje isso muda suas empresas em <b class="${cls(f - 1)}">${(f - 1 >= 0 ? '+' : '') + ((f - 1) * 100).toFixed(1).replace('.', ',')}%</b>.</div></div>
      <div class="assets">${cards}</div>${lent}
      <div class="card"><h3>📰 Notícias do mundo</h3>${news}</div>`;
  }

  function viewNews() {
    return `<div class="card"><h3>🎚️ Dificuldade: ${Math.round(Sim.DIFFICULTY * 100)}%</h3><div class="mut" style="font-size:14px">Custos da cidade e eventos ruins mais pesados. A equipe só ajuda se você escolher bem quem contratar e na hora certa.</div></div>
      <div class="card"><h3>📈 O jogo é progressivo</h3><div class="mut" style="font-size:14px">Quanto maior a cidade e quanto mais anos passam, mais caras ficam as obras, o treinamento e a manutenção, e mais pesados os eventos. O começo é fácil; depois cada passo exige mais tempo e mais cuidado, mesmo com a equipe certa. Não existe limite de tempo: jogue devagar.</div></div>
      <div class="btns"><button class="btn red" id="newgame">Recomeçar jogo</button></div>`;
  }

  function render() {
    header();
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === 'world') b.classList.toggle('alert', !!(s.world.request || s.world.dilemma) && !propRef); });
    if (tab === 'map' && $('map3d')) { renderProp(); if (window.City3D) City3D.show(s); return; }
    const keep = $('view').scrollTop;
    $('view').innerHTML = {city: viewCity, map: viewMap, invest: viewInvest, fin: viewFin, world: viewWorld, team: viewTeam, news: viewNews}[tab]();
    $('view').scrollTop = keep;
    renderProp();
    if (tab === 'map' && window.City3D) City3D.show(s);
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

  function onButton(t) {
    const d = t.dataset;
    let r;
    if (t.id === 'awayok') { $('away').classList.add('hidden'); setSpeed(resumeSpeed); return; }
    if (t.id === 'restart') return newGame();
    if (t.id === 'newgame') { if (confirm('Apagar a cidade e recomeçar?')) newGame(); return; }
    if (t.id === 'histbtn') return showHist();
    if (t.id === 'histclose') { $('hist').classList.add('hidden'); return; }
    if (d.hf) { histFilter = d.hf; return showHist(); }
    if (d.tab) { tab = d.tab; if (tab !== 'map' && window.City3D) City3D.hide(); render(); $('view').scrollTop = 0; return; }
    if (d.speed != null) return setSpeed(+d.speed);
    if (d.build) { r = Sim.buildAny(s, d.build); if (r.ok) toast(Sim.BUILDINGS[d.build].icon + ' ' + Sim.BUILDINGS[d.build].name + ' construída!'); }
    else if (d.evolve) { r = Sim.evolve(s, d.evolve); if (r.ok) toast('⬆ ' + r.fromName + ' virou ' + r.toName + '!'); }
    else if (d.demo) { r = Sim.demolishOne(s, d.demo); if (r.ok) toast('Demolido!'); }
    else if (d.amt) { amount = +d.amt; return render(); }
    else if (d.buy) r = Sim.buy(s, d.buy, amount);
    else if (d.sell) r = Sim.sell(s, d.sell, amount);
    else if (d.sellall) r = Sim.sell(s, d.sellall, 'all');
    else if (d.tax) { Sim.setTax(s, s.taxRate + +d.tax); r = {ok: true}; }
    else if (d.hire) { const w = Sim.hireWarnings(s, d.hire); if (w.length && !confirm('⚠️ ' + w.join('\n\n') + '\n\nContratar mesmo assim?')) return; r = Sim.hire(s, d.hire); if (r.ok) toast(Sim.STAFF[d.hire].icon + ' ' + Sim.STAFF[d.hire].name + ' contratado!'); }
    else if (d.upgrade) { r = Sim.train(s, d.upgrade); if (r.ok) toast('🎓 ' + Sim.STAFF[d.upgrade].name + ' começou o treinamento: ' + r.months + ' meses até o nível ' + r.to + '.'); }
    else if (d.fire) { if (!confirm('Demitir ' + Sim.STAFF[d.fire].name + '? Ele perde o nível.')) return; r = Sim.fire(s, d.fire); if (r.ok) toast('Demitido.'); }
    else if (d.auto) { r = Sim.setAuto(s, d.auto, !Sim.active(s, d.auto)); }
    else if (d.gift) { r = Sim.gift(s, d.gift, Sim.GIFT_COST); if (r.ok) toast('🎁 Presente enviado!'); }
    else if (d.treaty) { r = Sim.signTreaty(s, d.treaty); if (r.ok) toast('📜 Tratado assinado!'); }
    else if (d.untreaty) { if (!confirm('Cancelar o tratado? A relação piora.')) return; r = Sim.cancelTreaty(s, d.untreaty); }
    else if (d.fborrow) { r = Sim.borrowForeign(s, d.fborrow, Math.min(5000, Sim.foreignLimit(s, d.fborrow))); if (r.ok) toast('🏦 Empréstimo recebido!'); }
    else if (d.frepay) r = Sim.repayForeign(s, d.frepay, Sim.worldInfo(s, d.frepay).owed);
    else if (d.req != null) { r = Sim.answerRequest(s, d.req === '1'); }
    else if (d.dil != null) { r = Sim.answerDilemma(s, +d.dil); }
    else if (d.loan) r = Sim.borrow(s, +d.loan);
    else if (d.pay) r = Sim.repay(s, d.pay === 'all' ? s.debt : +d.pay);
    else return;
    if (r && !r.ok) toast(r.msg);
    save(); render();
    return r;
  }
  let suppressClick = 0;
  document.addEventListener('click', e => {
    if (Date.now() < suppressClick) { e.preventDefault(); return; }
    const t = e.target.closest('button'); if (t) onButton(t);
  });

  // ---------- Segurar o botão repete a ação (construir, demolir, evoluir, comprar, vender, imposto, empréstimo) ----------
  const REPEATABLE = ['build', 'demo', 'evolve', 'buy', 'sell', 'tax', 'loan', 'pay'];
  let hold = null;
  function stopHold() {
    if (!hold) return;
    clearTimeout(hold.timer); if (hold.fired) suppressClick = Date.now() + 350; hold = null;
  }
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('button');
    if (!t || t.disabled || !REPEATABLE.some(k => t.dataset[k] != null)) return;
    stopHold();
    const snap = {id: '', dataset: {...t.dataset}};
    hold = {fired: false, timer: null};
    let wait = 170;
    const go = () => {
      if (!hold) return;
      hold.fired = true;
      const r = onButton(snap);
      if (r && r.ok === false) return stopHold();          // acabou o dinheiro, o terreno ou o estoque: para sozinho
      wait = Math.max(45, wait * 0.93);
      hold.timer = setTimeout(go, wait);
    };
    hold.timer = setTimeout(go, 450);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => document.addEventListener(ev, e => { if (ev !== 'pointerleave' || e.target === document.documentElement) stopHold(); }));
  ['touchend', 'touchcancel'].forEach(ev => document.addEventListener(ev, stopHold));
  window.addEventListener('blur', stopHold);
  document.addEventListener('contextmenu', e => { if (hold || e.target.closest('button')) e.preventDefault(); });

  // ---------- Tempo longe do jogo ----------
  // O Android congela o app quando a tela apaga ou você troca de aplicativo, então ao voltar o jogo simula os
  // meses que passaram (1 mês a cada 5 s, no máximo 40 min). Se o caixa ficar no vermelho, ele para ali para você resolver.
  let resumeSpeed = 1;
  function catchUp() {
    let seen = null; try { seen = JSON.parse(localStorage.getItem(SEEN)); } catch (e) {}
    if (!seen || !seen.speed || !s || s.over) return null;
    const iv = seen.speed === 2 ? 2400 : 5000, away = Date.now() - seen.t, months = Math.min(MAX_AWAY_MONTHS, Math.floor(away / iv));
    if (months < 2) return null;
    const from = {cash: s.cash, pop: Math.floor(s.pop), month: s.month, nw: Sim.netWorth(s), histN: s.histN || 0};
    let done = 0, red = false;
    while (done < months && !s.over) { Sim.step(s); done++; if (s.cash < 0) { red = true; break; } }
    save();
    return {away, months: done, wanted: months, red, from, to: {cash: s.cash, pop: Math.floor(s.pop), nw: Sim.netWorth(s)}, capped: away / iv > MAX_AWAY_MONTHS};
  }
  function showAway(r) {
    const mins = Math.round(r.away / 60000), when = mins >= 120 ? Math.round(mins / 60) + ' horas' : mins >= 1 ? mins + ' min' : 'poucos segundos';
    const yrs = r.months >= 12 ? ` (${(r.months / 12).toFixed(1).replace('.', ',')} anos)` : '';
    const news = (s.hist || []).slice(0, Math.min(6, Math.max(0, (s.histN || 0) - r.from.histN))).map(h => `<div class="logline">${h.t}</div>`).join('');
    $('away').innerHTML = `<div class="panel"><div style="font-size:54px">😴</div><h2>Você voltou!</h2>
      <p>Ficou fora ${when}: passaram <b>${r.months} meses</b>${yrs}.${r.capped ? ' <span class="mut">(o limite é de 40 minutos de ausência)</span>' : ''}</p>
      <div class="row"><span>💰 Dinheiro</span><b class="${cls(r.to.cash - r.from.cash)}">${M(r.from.cash)} → ${M(r.to.cash)}</b></div>
      <div class="row"><span>👥 Habitantes</span><b>${r.from.pop.toLocaleString('pt-BR')} → ${r.to.pop.toLocaleString('pt-BR')}</b></div>
      <div class="row"><span>🏦 Patrimônio</span><b class="${cls(r.to.nw - r.from.nw)}">${M(r.from.nw)} → ${M(r.to.nw)}</b></div>
      ${r.red ? `<p class="neg"><b>⚠️ O caixa ficou no vermelho e o jogo parou no mês ${s.month} para você resolver.</b></p>` : ''}
      ${news ? `<h4 style="text-align:left;margin:12px 0 4px">O que aconteceu por último</h4><div style="text-align:left">${news}</div>` : ''}
      <button class="btn" id="awayok" style="margin-top:14px;width:100%">Continuar</button></div>`;
    $('away').classList.remove('hidden');
  }
  function comeBack() {
    const r = catchUp();
    if (r) { resumeSpeed = speed || 1; setSpeed(0); render(); showAway(r); if (s.over) { $('away').classList.add('hidden'); setSpeed(0); showOver(); } }
    else setSpeed(speed);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInterval(timer); save(); } else comeBack(); });
  window.addEventListener('pagehide', () => { save(); });

  s = loadGame();
  window.__game = {get s() { return s; }, tick, setSpeed, catchUp, comeBack};
  render();
  if (s.over) showOver();
  else { const r = catchUp(); if (r) { render(); resumeSpeed = 1; setSpeed(0); showAway(r); if (s.over) { $('away').classList.add('hidden'); showOver(); } } else setSpeed(1); }
})();
