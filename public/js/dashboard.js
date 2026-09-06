const state = { rt: { offset: 0, limit: 50 }, ar: { offset: 0, limit: 50 } };

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDev(min) {
  if (min === null || min === undefined) return '—';
  const sign = min > 0 ? '+' : '';
  return `${sign}${min} min`;
}
function statusLabel(s) {
  return { on_time: 'no horário', late: 'atrasado', early: 'adiantado' }[s] || s || '—';
}
async function api(path, opts) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'erro na requisição');
  }
  return res.json();
}
function operatorEmail() {
  return document.getElementById('operatorEmail').value.trim() || null;
}

// ---------------------------------------------------------------- tabs

document.querySelectorAll('nav.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'overview') loadOverview();
    if (btn.dataset.view === 'routes') loadRoutes();
    if (btn.dataset.view === 'arrivals') loadArrivals();
    if (btn.dataset.view === 'bagloads') loadBagLoads();
    if (btn.dataset.view === 'closures') loadBagEvents();
    if (btn.dataset.view === 'fleet') loadFleet();
  });
});

// ---------------------------------------------------------------- overview

async function loadOverview() {
  const from = document.getElementById('ov-from').value;
  const to = document.getElementById('ov-to').value;
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const data = await api('/stats/overview?' + qs.toString());
  const byStatus = Object.fromEntries(data.byStatus.map((r) => [r.status, r]));
  const cards = document.getElementById('ov-cards');
  cards.innerHTML = `
    <div class="card"><div class="label">Total de chegadas</div><div class="value">${data.totalArrivals}</div></div>
    <div class="card"><div class="label">No horário</div><div class="value on_time">${byStatus.on_time?.n || 0}</div></div>
    <div class="card"><div class="label">Atrasadas</div><div class="value late">${byStatus.late?.n || 0}</div></div>
    <div class="card"><div class="label">Adiantadas</div><div class="value early">${byStatus.early?.n || 0}</div></div>
    <div class="card"><div class="label">Rotas em andamento</div><div class="value">${data.openRoutes}</div></div>
    <div class="card"><div class="label">Chegadas com foto</div><div class="value">${data.photosCount}</div></div>
  `;
  document.getElementById('ov-bases').innerHTML = data.byBase
    .map(
      (b) => `<tr><td>${b.base ?? '—'}</td><td>${b.n}</td><td>${b.late_n}</td><td>${Math.round(b.avg_dev || 0)}</td></tr>`
    )
    .join('');
}

// ---------------------------------------------------------------- routes

function clearRouteFilters() {
  ['rt-date', 'rt-driver', 'rt-plate', 'rt-status'].forEach((id) => (document.getElementById(id).value = ''));
  loadRoutes();
}

async function loadRoutes(offset = 0) {
  const qs = new URLSearchParams({ limit: state.rt.limit, offset });
  const date = document.getElementById('rt-date').value;
  const driver = document.getElementById('rt-driver').value;
  const plate = document.getElementById('rt-plate').value;
  const status = document.getElementById('rt-status').value;
  if (date) qs.set('date', date);
  if (driver) qs.set('driver', driver);
  if (plate) qs.set('plate', plate);
  if (status) qs.set('status', status);
  const data = await api('/routes?' + qs.toString());
  state.rt.offset = offset;
  document.getElementById('rt-rows').innerHTML = data.rows
    .map((r) => {
      let statusPill = r.completed_at
        ? r.management_closed_at
          ? '<span class="pill closed">fechada</span>'
          : '<span class="pill open">aguardando revisão</span>'
        : '<span class="pill open">em andamento</span>';
      return `<tr onclick="openRoute(${r.id})">
        <td>#${r.id}</td><td>${r.driver_name}</td><td>${r.plate}</td>
        <td>${fmtDT(r.started_at)}</td><td>${r.legs}</td><td>${r.arrivals_count}</td>
        <td>${r.late_count > 0 ? `<span class="pill late">${r.late_count}</span>` : '0'}</td>
        <td>${statusPill}</td>
      </tr>`;
    })
    .join('') || '<tr><td colspan="8" class="empty">Nenhuma rota encontrada.</td></tr>';
  const pg = document.getElementById('rt-pagination');
  const shown = offset + data.rows.length;
  pg.innerHTML = `${shown} de ${data.total}
    ${offset > 0 ? `<button class="btn secondary" onclick="loadRoutes(${Math.max(0, offset - state.rt.limit)})">‹ anterior</button>` : ''}
    ${shown < data.total ? `<button class="btn secondary" onclick="loadRoutes(${offset + state.rt.limit})">próxima ›</button>` : ''}`;
}

async function openRoute(id) {
  const r = await api('/routes/' + id);
  const legsRows = r.journeys
    .map((j) => `<tr><td>${j.leg_number}</td><td>${j.origin_base} → ${j.base}</td><td>${fmtDT(j.started_at)}</td><td>${fmtDT(j.completed_at)}</td></tr>`)
    .join('') || '<tr><td colspan="4" class="empty">sem pernas registradas</td></tr>';
  const arrRows = r.arrivals
    .map(
      (a) => `<tr onclick="openArrivalDetail(${a.id})"><td>${a.base}</td><td>${fmtDT(a.scheduled_at)}</td><td>${fmtDT(a.arrived_at)}</td>
        <td>${fmtDev(a.deviation_minutes)}</td><td><span class="pill ${a.status}">${statusLabel(a.status)}</span></td></tr>`
    )
    .join('') || '<tr><td colspan="5" class="empty">sem chegadas registradas</td></tr>';

  showModal(`
    <button class="close" onclick="closeModal()">✕</button>
    <h3>Rota #${r.id} — ${r.driver_name} (${r.plate})</h3>
    <div class="grid2">
      <div class="field"><label>Início</label><span class="value">${fmtDT(r.started_at)}</span></div>
      <div class="field"><label>Conclusão</label><span class="value">${fmtDT(r.completed_at)}</span></div>
      <div class="field"><label>Token do motorista</label><span class="value"><code class="token">${r.update_token}</code></span></div>
      <div class="field"><label>Fechada pela gestão</label><span class="value">${r.management_closed_at ? fmtDT(r.management_closed_at) + ' por ' + (r.management_closed_by_email || '—') : 'não'}</span></div>
    </div>
    <p><a href="/driver.html?token=${r.update_token}" target="_blank">Abrir fluxo do motorista para esta rota →</a></p>
    <h4>Pernas da rota</h4>
    <table><thead><tr><th>Perna</th><th>Trajeto</th><th>Início</th><th>Conclusão</th></tr></thead><tbody>${legsRows}</tbody></table>
    <h4>Chegadas</h4>
    <table><thead><tr><th>Base</th><th>Agendado</th><th>Chegada</th><th>Desvio</th><th>Status</th></tr></thead><tbody>${arrRows}</tbody></table>
    <div style="margin-top:16px; display:flex; gap:8px;">
      ${!r.completed_at ? `<button class="btn" onclick="routeAction(${r.id}, 'complete')">Concluir rota</button>` : ''}
      ${r.completed_at && !r.management_closed_at ? `<button class="btn" onclick="routeAction(${r.id}, 'management-close')">Fechar (revisado pela gestão)</button>` : ''}
      ${r.management_closed_at ? `<button class="btn secondary" onclick="routeAction(${r.id}, 'management-reopen')">Reabrir</button>` : ''}
    </div>
  `);
}

async function routeAction(id, action) {
  await api(`/routes/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({ email: operatorEmail() }) });
  closeModal();
  loadRoutes(state.rt.offset);
}

// ---------------------------------------------------------------- arrivals

function clearArrivalFilters() {
  ['ar-base', 'ar-status', 'ar-driver', 'ar-from', 'ar-to'].forEach((id) => (document.getElementById(id).value = ''));
  loadArrivals();
}

async function populateBases() {
  const bases = await api('/bases');
  const sel = document.getElementById('ar-base');
  bases.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    sel.appendChild(opt);
  });
}

async function loadArrivals(offset = 0) {
  const qs = new URLSearchParams({ limit: state.ar.limit, offset });
  const base = document.getElementById('ar-base').value;
  const status = document.getElementById('ar-status').value;
  const driver = document.getElementById('ar-driver').value;
  const from = document.getElementById('ar-from').value;
  const to = document.getElementById('ar-to').value;
  if (base) qs.set('base', base);
  if (status) qs.set('status', status);
  if (driver) qs.set('driver', driver);
  if (from) qs.set('date_from', from);
  if (to) qs.set('date_to', to);
  const data = await api('/arrivals?' + qs.toString());
  state.ar.offset = offset;
  document.getElementById('ar-rows').innerHTML = data.rows
    .map(
      (a) => `<tr onclick="openArrivalDetail(${a.id})">
        <td>#${a.id}</td><td>${a.base}</td><td>${a.driver_name || '—'}</td>
        <td>${fmtDT(a.scheduled_at)}</td><td>${fmtDT(a.arrived_at)}</td>
        <td>${fmtDev(a.deviation_minutes)}</td>
        <td><span class="pill ${a.status}">${statusLabel(a.status)}</span></td>
        <td>${a.delivery_photo_key ? '📷' : '—'}</td>
      </tr>`
    )
    .join('') || '<tr><td colspan="8" class="empty">Nenhuma chegada encontrada.</td></tr>';
  const pg = document.getElementById('ar-pagination');
  const shown = offset + data.rows.length;
  pg.innerHTML = `${shown} de ${data.total}
    ${offset > 0 ? `<button class="btn secondary" onclick="loadArrivals(${Math.max(0, offset - state.ar.limit)})">‹ anterior</button>` : ''}
    ${shown < data.total ? `<button class="btn secondary" onclick="loadArrivals(${offset + state.ar.limit})">próxima ›</button>` : ''}`;
}

async function openArrivalDetail(id) {
  const a = await api('/arrivals/' + id);
  showModal(`
    <button class="close" onclick="closeModal()">✕</button>
    <h3>Chegada #${a.id} — ${a.base}</h3>
    <div class="grid2">
      <div class="field"><label>Motorista</label><span class="value">${a.driver_name || '—'} (${a.plate || '—'})</span></div>
      <div class="field"><label>Origem → destino</label><span class="value">${a.origin_base} → ${a.base} (perna ${a.leg_number})</span></div>
      <div class="field"><label>Agendado</label><span class="value">${fmtDT(a.scheduled_at)}</span></div>
      <div class="field"><label>Chegada real</label><span class="value">${fmtDT(a.arrived_at)}</span></div>
      <div class="field"><label>Desvio</label><span class="value">${fmtDev(a.deviation_minutes)} — <span class="pill ${a.status}">${statusLabel(a.status)}</span></span></div>
      <div class="field"><label>Base aberta na chegada?</label><span class="value">${a.base_open_on_arrival == null ? '—' : a.base_open_on_arrival ? 'sim' : 'não'}</span></div>
      <div class="field"><label>Motivo do atraso p/ descarga</label><span class="value">${a.unloading_delay_reason || '—'}</span></div>
      <div class="field"><label>Malotes coletados</label><span class="value">${a.collected_bags ?? '—'}</span></div>
      <div class="field"><label>Saída do hub</label><span class="value">${fmtDT(a.hub_departed_at)}</span></div>
      <div class="field"><label>Tempo de viagem</label><span class="value">${a.travel_minutes != null ? a.travel_minutes + ' min' : '—'}</span></div>
      <div class="field"><label>GPS na chegada</label><span class="value">${a.latitude ? `${a.latitude.toFixed(5)}, ${a.longitude.toFixed(5)} (±${Math.round(a.accuracy_meters || 0)}m)` : '—'}</span></div>
      <div class="field"><label>Notas</label><span class="value">${a.notes || '—'}</span></div>
    </div>
    ${a.delivery_photo_key ? `<label class="muted">Foto de entrega</label><br/><img class="photo" src="/photos/${a.delivery_photo_key}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'muted', textContent:'Foto não encontrada nesta máquina — configure PHOTOS_DIR no .env.'}))" />` : ''}
  `);
}

// ---------------------------------------------------------------- bag loads

async function loadBagLoads() {
  const date = document.getElementById('bl-date').value;
  const qs = new URLSearchParams();
  if (date) qs.set('date_key', date);
  const rows = await api('/bag-loads?' + qs.toString());
  document.getElementById('bl-rows').innerHTML = rows
    .map((r) => `<tr><td>${r.date_key}</td><td>${r.base}</td><td>${r.loaded_bags}</td><td>${r.operator_email || '—'}</td><td>${fmtDT(r.updated_at)}</td></tr>`)
    .join('') || '<tr><td colspan="5" class="empty">Nenhum registro.</td></tr>';
}

function openBagLoadForm() {
  showModal(`
    <button class="close" onclick="closeModal()">✕</button>
    <h3>Registrar carga de malotes</h3>
    <div class="field"><label>Data</label><input type="date" id="f-bl-date" style="width:100%;padding:8px" /></div>
    <div class="field"><label>Base</label><input type="text" id="f-bl-base" style="width:100%;padding:8px" placeholder="ex: RJ-W-D011" /></div>
    <div class="field"><label>Malotes carregados</label><input type="number" id="f-bl-count" style="width:100%;padding:8px" /></div>
    <button class="btn" onclick="submitBagLoad()">Salvar</button>
  `);
}
async function submitBagLoad() {
  const body = {
    date_key: document.getElementById('f-bl-date').value,
    base: document.getElementById('f-bl-base').value,
    loaded_bags: Number(document.getElementById('f-bl-count').value || 0),
    operator_email: operatorEmail(),
  };
  await api('/bag-loads', { method: 'POST', body: JSON.stringify(body) });
  closeModal();
  loadBagLoads();
}

// ---------------------------------------------------------------- closures & events

async function loadBagEvents() {
  const rows = await api('/bag-events');
  document.getElementById('be-rows').innerHTML = rows
    .map(
      (e) => `<tr><td>${e.date_key || '—'}</td><td>${e.base || '—'}</td><td>${e.event_type}</td>
        <td>${e.previous_bags ?? '—'} → ${e.new_bags ?? '—'}</td><td>${e.operator_email || '—'}</td><td>${fmtDT(e.occurred_at)}</td></tr>`
    )
    .join('') || '<tr><td colspan="6" class="empty">Nenhum evento.</td></tr>';
}

async function checkClosure() {
  const date = document.getElementById('cl-date').value;
  if (!date) return;
  const rows = await api('/bag-cycle-closures?date_key=' + date);
  const c = rows[0];
  document.getElementById('cl-status').innerHTML = c
    ? `<div class="label">Ciclo de ${date}</div><div class="value" style="font-size:15px">
        ${c.reopened_at ? '🟡 Reaberto' : '🔴 Fechado'} em ${fmtDT(c.reopened_at || c.closed_at)}<br/>
        <span class="muted">por ${c.reopened_by_email || c.closed_by_email || '—'}</span></div>`
    : `<div class="label">Ciclo de ${date}</div><div class="value" style="font-size:15px">🟢 Aberto (sem fechamento registrado)</div>`;
}

async function doClosure(action) {
  const date = document.getElementById('cl-date').value;
  if (!date) return alert('Escolha uma data.');
  await api('/bag-cycle-closures', {
    method: 'POST',
    body: JSON.stringify({ date_key: date, phase: 'reconciliation', action, email: operatorEmail() }),
  });
  checkClosure();
  loadBagEvents();
}

// ---------------------------------------------------------------- fleet

async function loadFleet() {
  const date = document.getElementById('fl-date').value;
  const qs = new URLSearchParams();
  if (date) qs.set('date_key', date);
  const rows = await api('/fleet-schedules?' + qs.toString());
  document.getElementById('fl-rows').innerHTML = rows
    .map((r) => `<tr><td>${r.date_key}</td><td>${r.plate}</td><td>${r.operator_email || '—'}</td><td>${fmtDT(r.updated_at)}</td></tr>`)
    .join('') || '<tr><td colspan="4" class="empty">Nenhum registro.</td></tr>';
}

function openFleetForm() {
  showModal(`
    <button class="close" onclick="closeModal()">✕</button>
    <h3>Escalar veículo</h3>
    <div class="field"><label>Data</label><input type="date" id="f-fl-date" style="width:100%;padding:8px" /></div>
    <div class="field"><label>Placa</label><input type="text" id="f-fl-plate" style="width:100%;padding:8px" /></div>
    <button class="btn" onclick="submitFleet()">Salvar</button>
  `);
}
async function submitFleet() {
  const body = {
    date_key: document.getElementById('f-fl-date').value,
    plate: document.getElementById('f-fl-plate').value,
    operator_email: operatorEmail(),
  };
  await api('/fleet-schedules', { method: 'POST', body: JSON.stringify(body) });
  closeModal();
  loadFleet();
}

// ---------------------------------------------------------------- driver link

async function createDriverRoute() {
  const body = {
    driver_name: document.getElementById('dl-driver').value,
    plate: document.getElementById('dl-plate').value,
    notes: document.getElementById('dl-notes').value,
  };
  if (!body.driver_name || !body.plate) return alert('Preencha motorista e placa.');
  const route = await api('/routes', { method: 'POST', body: JSON.stringify(body) });
  const link = `${location.origin}/driver.html?token=${route.update_token}`;
  document.getElementById('dl-result').innerHTML = `
    <p>Rota #${route.id} criada. Envie este link para o motorista:</p>
    <p><input readonly style="width:100%;padding:8px" value="${link}" onclick="this.select()" /></p>
    <p><a href="${link}" target="_blank">Abrir agora →</a></p>`;
}

// ---------------------------------------------------------------- modal

function showModal(html) {
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

// ---------------------------------------------------------------- init

populateBases();
loadOverview();
