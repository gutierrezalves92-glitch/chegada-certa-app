const params = new URLSearchParams(location.search);
const tokenFromUrl = params.get('token'); // suporte a links antigos (com token); o fluxo novo usa placa
const appEl = document.getElementById('app');
const msgEl = document.getElementById('msg');
const PLATE_KEY = 'chegada-certa:last-plate';

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function say(text, isError = true) {
  msgEl.textContent = text || '';
  msgEl.style.color = isError ? '#fecaca' : '#86efac';
}
async function api(path, opts) {
  const res = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'erro');
  return res.json();
}
function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let route = null;
let plate = null;
let timerHandle = null;

function fmtElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ---------------------------------------------------------------- boot / identificação

async function boot() {
  if (tokenFromUrl) {
    // link antigo (com token) — continua funcionando normalmente
    try {
      route = await api('/routes/token/' + tokenFromUrl);
      render();
    } catch (e) {
      appEl.innerHTML = `<div class="sheet"><p>Não foi possível carregar esta rota (${e.message}).</p></div>`;
    }
    return;
  }
  const saved = localStorage.getItem(PLATE_KEY);
  if (saved) {
    const ok = await loadByPlate(saved, true);
    if (ok) return;
  }
  renderPlateForm();
}

function renderPlateForm(errorMsg) {
  document.getElementById('route-title').textContent = '';
  appEl.innerHTML = `
    <div class="sheet">
      <h3>Identifique-se</h3>
      <div class="field"><label>Placa do veículo</label><input id="plate-input" placeholder="ex: ABC1D23" autocapitalize="characters" /></div>
      <button class="bigbtn" id="btn-find-plate">Entrar</button>
    </div>`;
  if (errorMsg) say(errorMsg);
  const inp = document.getElementById('plate-input');
  inp.focus();
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submitPlate(); });
}

async function submitPlate() {
  const val = document.getElementById('plate-input').value.trim();
  if (!val) return say('Digite a placa.');
  say('Procurando rota...', false);
  await loadByPlate(val, false);
}

async function loadByPlate(val, silent) {
  try {
    route = await api('/routes/by-plate/' + encodeURIComponent(val));
    plate = val.toUpperCase();
    localStorage.setItem(PLATE_KEY, plate);
    say('');
    render();
    return true;
  } catch (e) {
    if (silent) {
      localStorage.removeItem(PLATE_KEY);
      return false;
    }
    renderPlateForm(e.message);
    return false;
  }
}

function trocarPlaca() {
  localStorage.removeItem(PLATE_KEY);
  route = null;
  plate = null;
  renderPlateForm();
}

function reloadRoute() {
  return tokenFromUrl ? api('/routes/token/' + tokenFromUrl) : api('/routes/by-plate/' + encodeURIComponent(plate));
}

// ---------------------------------------------------------------- render

function render() {
  document.getElementById('route-title').textContent = `${route.driver_name} · ${route.plate} · rota #${route.id}`;

  const plannedMode = Array.isArray(route.stops) && route.stops.length > 0;
  const openJourney = route.journeys.find((j) => !j.completed_at);
  const sortedJourneys = route.journeys.slice().sort((a, b) => (a.leg_number || 0) - (b.leg_number || 0));
  const firstJourney = sortedJourneys[0] || null;

  let timerHtml = '';
  if (firstJourney) {
    timerHtml = `<div class="sheet timer-sheet">
      <div class="timer-box"><div class="label">Tempo total da rota</div><div class="value" id="timer-overall">00:00:00</div></div>
      <div class="timer-box"><div class="label">Tempo desta perna</div><div class="value" id="timer-leg">${openJourney ? '00:00:00' : '—'}</div></div>
    </div>`;
  }

  const history = route.arrivals
    .slice()
    .sort((a, b) => (a.leg_number || 0) - (b.leg_number || 0))
    .map(
      (a) => `<div class="status-line"><span>Perna ${a.leg_number}: ${a.origin_base} → ${a.base}</span>
        <span class="pill ${a.status}">${a.status === 'late' ? 'atrasado' : a.status === 'early' ? 'adiantado' : 'no horário'}</span></div>`
    )
    .join('');

  let itineraryHtml = '';
  if (plannedMode) {
    const rows = route.stops
      .map((s) => {
        const arrived = route.arrivals.find((a) => a.leg_number === s.seq_number);
        const isCurrent = openJourney && openJourney.leg_number === s.seq_number;
        const icon = arrived ? '✅' : isCurrent ? '🚚' : '⏳';
        return `<div class="status-line"><span>${icon} ${s.seq_number}. ${s.base}</span>
          <span class="muted">${arrived ? fmtDT(arrived.arrived_at) : isCurrent ? 'a caminho' : 'pendente'}</span></div>`;
      })
      .join('');
    itineraryHtml = `<div class="sheet"><h3>Roteiro (HUB PRINCIPAL → ${route.stops.map((s) => s.base).join(' → ')})</h3>${rows}</div>`;
  }

  let actionHtml = '';
  if (route.completed_at) {
    actionHtml = receiptHtml(firstJourney);
  } else if (openJourney) {
    actionHtml = arrivalFormHtml(openJourney);
  } else if (plannedMode) {
    const pendingStop = route.stops.find((s) => s.seq_number === nextLegNumber());
    if (pendingStop) {
      const isFirst = nextLegNumber() === 1;
      actionHtml = `<div class="sheet">
        <h3>Confirmar saída ${isFirst ? 'do HUB PRINCIPAL' : ('de ' + defaultOriginBase())}</h3>
        <p class="muted">Próxima parada: <strong>${pendingStop.base}</strong></p>
        <button class="bigbtn" id="btn-start-leg">Capturar GPS e confirmar saída</button>
        <div class="gps" id="leg-gps"></div>
      </div>`;
    } else {
      actionHtml = `<div class="sheet"><h3>✅ Roteiro concluído</h3></div>`;
    }
  } else {
    actionHtml = startLegFormHtml();
  }

  appEl.innerHTML = `
    ${timerHtml}
    ${itineraryHtml}
    ${history && !route.completed_at ? `<div class="sheet"><h3>Histórico da rota</h3>${history}</div>` : ''}
    ${actionHtml}
    ${!route.completed_at && !openJourney && !plannedMode ? `<button class="bigbtn secondary" id="btn-finish-route">Concluir rota</button>` : ''}
    ${!tokenFromUrl ? `<button class="bigbtn secondary" id="btn-troca-placa">Trocar placa</button>` : ''}
  `;

  // temporizador ao vivo: tempo total da rota (desde a saída do HUB) e tempo da perna atual.
  // sempre reinicia o intervalo anterior para nunca acumular vários tickers rodando juntos.
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (firstJourney) {
    const overallStartMs = new Date(firstJourney.started_at).getTime();
    const legStartMs = openJourney ? new Date(openJourney.started_at).getTime() : null;
    const frozenAtMs = route.completed_at ? new Date(route.completed_at).getTime() : null;
    const tick = () => {
      const nowMs = frozenAtMs || Date.now();
      const overallEl = document.getElementById('timer-overall');
      if (overallEl) overallEl.textContent = fmtElapsed(nowMs - overallStartMs);
      const legEl = document.getElementById('timer-leg');
      if (legEl && legStartMs != null) legEl.textContent = fmtElapsed(nowMs - legStartMs);
    };
    tick();
    if (!route.completed_at) timerHandle = setInterval(tick, 1000);
  }
}

// comprovante final: mostrado quando a rota é concluída (última perna registrada) —
// horário de saída do HUB principal e o horário de chegada em cada base.
function receiptHtml(firstJourney) {
  const rows = route.arrivals
    .slice()
    .sort((a, b) => (a.leg_number || 0) - (b.leg_number || 0))
    .map(
      (a) => `<div class="status-line"><span>${a.leg_number}. ${a.origin_base} → ${a.base}</span>
        <span>${fmtDT(a.arrived_at)} <span class="pill ${a.status}">${a.status === 'late' ? 'atrasado' : 'no horário'}</span></span></div>`
    )
    .join('');
  return `<div class="sheet">
    <h3>✅ Comprovante da rota #${route.id}</h3>
    <div class="status-line"><span>Motorista</span><span>${route.driver_name}</span></div>
    <div class="status-line"><span>Placa</span><span>${route.plate}</span></div>
    <div class="status-line"><span>Saída do HUB PRINCIPAL</span><span>${firstJourney ? fmtDT(firstJourney.started_at) : '—'}</span></div>
    <div class="status-line"><span>Rota concluída em</span><span>${fmtDT(route.completed_at)}</span></div>
    <h4 style="margin:14px 0 4px;font-size:12.5px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;">Chegadas por perna</h4>
    ${rows || '<p class="muted">Nenhuma chegada registrada.</p>'}
  </div>`;
}

function nextLegNumber() {
  return route.journeys.length + 1;
}
function defaultOriginBase() {
  const legs = route.journeys.slice().sort((a, b) => b.leg_number - a.leg_number);
  return legs[0] ? legs[0].base : 'HUB PRINCIPAL';
}

function startLegFormHtml() {
  return `
    <div class="sheet">
      <h3>Iniciar perna ${nextLegNumber()}</h3>
      <div class="field"><label>Saindo de</label><input value="${defaultOriginBase()}" id="leg-origin" /></div>
      <div class="field"><label>Base de destino</label><input id="leg-dest" placeholder="ex: RJ-W-D011" /></div>
      <button class="bigbtn" id="btn-start-leg">Capturar GPS e iniciar</button>
      <div class="gps" id="leg-gps"></div>
    </div>`;
}

function arrivalFormHtml(journey) {
  return `
    <div class="sheet">
      <h3>Registrar chegada em ${journey.base}</h3>
      <div class="field"><label>A base estava aberta?</label>
        <div class="toggle-group">
          <button type="button" id="btn-open-yes" onclick="setBaseOpen(true)">Sim</button>
          <button type="button" id="btn-open-no" onclick="setBaseOpen(false)">Não</button>
        </div>
      </div>
      <div class="field" id="delay-field" style="display:none">
        <label>Motivo do atraso na descarga</label>
        <select id="ar-delay-reason">
          <option value="">—</option>
          <option value="base_closed">Base fechada</option>
          <option value="vehicle_queue">Fila de veículos</option>
          <option value="awaiting_operator">Aguardando operador</option>
          <option value="other">Outro</option>
        </select>
        <input id="ar-delay-details" placeholder="detalhes (opcional)" style="margin-top:8px" />
      </div>
      <div class="field"><label>Malotes coletados (opcional)</label><input type="number" id="ar-bags" /></div>
      <div class="field"><label>Foto de entrega</label><input type="file" accept="image/*" capture="environment" id="ar-photo" /></div>
      <div class="field"><label>Observações</label><textarea id="ar-notes" rows="2"></textarea></div>
      <button class="bigbtn" id="btn-register-arrival">Capturar GPS e registrar chegada</button>
      <div class="gps" id="ar-gps"></div>
    </div>`;
}

let baseOpenValue = null;
function setBaseOpen(v) {
  baseOpenValue = v;
  document.getElementById('btn-open-yes').classList.toggle('on', v === true);
  document.getElementById('btn-open-no').classList.toggle('on', v === false);
  document.getElementById('delay-field').style.display = v === false ? 'block' : 'none';
}

document.addEventListener('click', async (ev) => {
  if (ev.target.id === 'btn-find-plate') return submitPlate();
  if (ev.target.id === 'btn-start-leg') return startLeg();
  if (ev.target.id === 'btn-register-arrival') return registerArrival();
  if (ev.target.id === 'btn-finish-route') return finishRoute();
  if (ev.target.id === 'btn-troca-placa') return trocarPlaca();
});

async function startLeg() {
  const btn = document.getElementById('btn-start-leg');
  btn.disabled = true;
  document.getElementById('leg-gps').textContent = 'obtendo localização...';

  const plannedMode = Array.isArray(route.stops) && route.stops.length > 0;
  let dest, origin;
  if (plannedMode) {
    const pendingStop = route.stops.find((s) => s.seq_number === nextLegNumber());
    dest = pendingStop ? pendingStop.base : null;
    origin = nextLegNumber() === 1 ? 'HUB PRINCIPAL' : defaultOriginBase();
  } else {
    dest = document.getElementById('leg-dest').value.trim();
    origin = document.getElementById('leg-origin').value.trim() || 'HUB PRINCIPAL';
  }
  if (!dest) {
    say('Informe a base de destino.');
    btn.disabled = false;
    return;
  }
  const coords = await getPosition();
  try {
    await api('/journeys', {
      method: 'POST',
      body: JSON.stringify({
        route_id: route.id,
        driver_name: route.driver_name,
        plate: route.plate,
        base: dest,
        origin_base: origin,
        leg_number: nextLegNumber(),
        driver_update_token: tokenFromUrl || undefined,
        start_latitude: coords?.latitude,
        start_longitude: coords?.longitude,
        start_accuracy_meters: coords?.accuracy,
      }),
    });
    say('Saída confirmada.', false);
    route = await reloadRoute();
    render();
  } catch (e) {
    say(e.message);
    btn.disabled = false;
  }
}

async function registerArrival() {
  const journey = route.journeys.find((j) => !j.completed_at);
  const btn = document.getElementById('btn-register-arrival');
  btn.disabled = true;
  document.getElementById('ar-gps').textContent = 'obtendo localização...';
  const coords = await getPosition();
  const photoFile = document.getElementById('ar-photo').files[0];

  const body = {
    route_id: route.id,
    journey_id: journey.id,
    driver_name: route.driver_name,
    plate: route.plate,
    base: journey.base,
    origin_base: journey.origin_base,
    leg_number: journey.leg_number,
    driver_update_token: tokenFromUrl || undefined,
    latitude: coords?.latitude,
    longitude: coords?.longitude,
    accuracy_meters: coords?.accuracy,
    base_open_on_arrival: baseOpenValue === null ? null : baseOpenValue ? 1 : 0,
    unloading_delay_reason: baseOpenValue === false ? document.getElementById('ar-delay-reason').value || null : null,
    unloading_delay_details: baseOpenValue === false ? document.getElementById('ar-delay-details').value || null : null,
    collected_bags: document.getElementById('ar-bags').value ? Number(document.getElementById('ar-bags').value) : null,
    notes: document.getElementById('ar-notes').value,
    hub_departed_at: journey.started_at,
    hub_latitude: journey.start_latitude,
    hub_longitude: journey.start_longitude,
    hub_accuracy_meters: journey.start_accuracy_meters,
  };

  try {
    const arrival = await api('/arrivals', { method: 'POST', body: JSON.stringify(body) });
    if (photoFile) {
      const b64 = await fileToBase64(photoFile);
      await api(`/arrivals/${arrival.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ data_base64: b64, name: photoFile.name, type: photoFile.type }),
      });
    }
    say('Chegada registrada!', false);
    baseOpenValue = null;
    route = await reloadRoute();
    render();
  } catch (e) {
    say(e.message);
    btn.disabled = false;
  }
}

async function finishRoute() {
  try {
    await api(`/routes/${route.id}/complete`, { method: 'PATCH' });
    route = await reloadRoute();
    render();
  } catch (e) {
    say(e.message);
  }
}

boot();
