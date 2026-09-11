const params = new URLSearchParams(location.search);
const tokenFromUrl = params.get('token'); // suporte a links antigos (com token); o fluxo novo usa placa
const appEl = document.getElementById('app');
const msgEl = document.getElementById('msg');
const PLATE_KEY = 'chegada-certa:last-plate';
const PENDING_KEY = 'chegada-certa:pending-actions';

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
function genId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- localização (GPS)
// A localização é essencial pra confiabilidade dos dados, então nunca falha em silêncio:
// tenta com alta precisão primeiro, tenta de novo com precisão menor se a primeira falhar,
// mostra claramente o resultado (inclusive a precisão em metros) e, se mesmo assim não
// conseguir, pede uma confirmação explícita do motorista antes de seguir sem GPS.
function gpsErrorMessage(err) {
  if (!err) return 'Não foi possível obter a localização.';
  if (err.code === 1) return 'Permissão de localização negada. Ative a localização para este site nas configurações do celular.';
  if (err.code === 2) return 'Localização indisponível no momento (sem sinal de GPS).';
  if (err.code === 3) return 'A localização demorou demais para responder.';
  return 'Não foi possível obter a localização.';
}
function getPositionOnce(opts) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ coords: null, error: 'Este celular/navegador não tem GPS disponível.' });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: pos.coords, error: null }),
      (err) => resolve({ coords: null, error: gpsErrorMessage(err) }),
      opts
    );
  });
}
async function getPositionWithRetry(statusEl) {
  if (statusEl) statusEl.textContent = '📍 obtendo localização...';
  let result = await getPositionOnce({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  if (!result.coords) {
    if (statusEl) statusEl.textContent = '📍 tentando novamente (precisão menor)...';
    result = await getPositionOnce({ enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 });
  }
  if (result.coords) {
    if (statusEl) statusEl.textContent = `📍 localização capturada (precisão: ±${Math.round(result.coords.accuracy)}m)`;
  } else if (statusEl) {
    statusEl.innerHTML = `⚠️ ${result.error}`;
  }
  return result.coords;
}
async function confirmProceedWithoutGps() {
  return confirm(
    'Não foi possível confirmar sua localização.\n\nDeseja continuar mesmo assim, sem registrar a localização GPS deste evento?'
  );
}

// ---------------------------------------------------------------- fila local (nunca perder um registro)
// Toda saída de perna e toda chegada é SALVA NESTE CELULAR (localStorage) antes de tentar
// enviar pro servidor. Se o envio falhar (sem internet, ou o servidor demorando pra "acordar"
// no primeiro acesso do dia), o registro continua salvo aqui e é reenviado automaticamente
// assim que a conexão voltar — nunca é perdido, e a tela mostra claramente que ainda está
// pendente, sem deixar o motorista reenviar (e duplicar) a mesma informação.
function loadPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch (e) {
    return [];
  }
}
function savePending(list) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (e) {
    // armazenamento cheio ou indisponível — segue mesmo assim; o envio imediato ainda é tentado.
  }
}
function queuePendingAction(action) {
  const list = loadPending();
  list.push(action);
  savePending(list);
}
function removePendingAction(localId) {
  savePending(loadPending().filter((a) => a.localId !== localId));
}
function pendingForCurrentRoute() {
  if (!route) return null;
  return loadPending().find((a) => a.body && a.body.route_id === route.id) || null;
}

async function sendAction(action) {
  if (action.type === 'journey') {
    await api('/journeys', { method: 'POST', body: JSON.stringify(action.body) });
  } else if (action.type === 'arrival') {
    const arrival = await api('/arrivals', { method: 'POST', body: JSON.stringify(action.body) });
    if (action.photoBase64 && !arrival.delivery_photo_key) {
      await api(`/arrivals/${arrival.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ data_base64: action.photoBase64, name: action.photoName, type: action.photoType }),
      });
    }
  } else if (action.type === 'complete-route') {
    await api(`/routes/${action.body.route_id}/complete`, { method: 'PATCH' });
  }
}

let flushing = false;
async function flushPending() {
  if (flushing) return;
  flushing = true;
  try {
    const list = loadPending();
    let changedCurrentRoute = false;
    for (const action of list) {
      try {
        await sendAction(action);
        removePendingAction(action.localId);
        if (route && action.body && action.body.route_id === route.id) changedCurrentRoute = true;
      } catch (e) {
        break; // ainda sem conexão / servidor indisponível — respeita a ordem e tenta de novo mais tarde
      }
    }
    if (changedCurrentRoute) {
      try {
        route = await reloadRoute();
        say('Registro pendente enviado com sucesso!', false);
        render();
      } catch (e) {
        /* falha ao recarregar a rota — a próxima tentativa cobre */
      }
    }
  } finally {
    flushing = false;
  }
}
window.addEventListener('online', flushPending);
setInterval(flushPending, 15000);

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
  flushPending(); // se sobrou algum registro pendente de antes (app fechado, sem sinal, etc.), tenta enviar já
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
  const pendingCount = loadPending().length;
  appEl.innerHTML = `
    <div class="sheet">
      <h3>Identifique-se</h3>
      <div class="field"><label>Placa do veículo</label><input id="plate-input" placeholder="ex: ABC1D23" autocapitalize="characters" /></div>
      <button class="bigbtn" id="btn-find-plate">Entrar</button>
    </div>
    ${pendingCount > 0 ? `<div class="sheet"><p class="muted">⏳ ${pendingCount} registro(s) de uma rota anterior ainda aguardando conexão para envio — continuam sendo reenviados automaticamente em segundo plano.</p></div>` : ''}`;
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

  const pending = pendingForCurrentRoute();
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
  if (pending) {
    actionHtml = pendingActionHtml(pending);
  } else if (route.completed_at) {
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
    ${!pending && !route.completed_at && !openJourney && !plannedMode ? `<button class="bigbtn secondary" id="btn-finish-route">Concluir rota</button>` : ''}
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

// cartão mostrado quando há um registro salvo neste celular ainda aguardando envio ao servidor —
// substitui o formulário de ação pra impedir que o motorista registre a mesma coisa duas vezes.
function pendingActionHtml(pending) {
  const label =
    pending.type === 'journey'
      ? `Saída para <strong>${pending.body.base}</strong>`
      : pending.type === 'arrival'
      ? `Chegada em <strong>${pending.body.base}</strong>`
      : 'Conclusão da rota';
  return `<div class="sheet">
    <h3>⏳ Aguardando conexão</h3>
    <p class="muted">${label} já foi salvo(a) neste celular e está aguardando para ser enviado(a) ao servidor.
      Assim que a internet voltar (ou o servidor terminar de "acordar" — pode acontecer no primeiro acesso do
      dia), o envio acontece sozinho. <strong>Não feche esta página</strong> nem tente registrar de novo.</p>
    <button class="bigbtn" id="btn-retry-pending">Tentar enviar agora</button>
  </div>`;
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
  if (ev.target.id === 'btn-retry-pending') return flushPending();
});

async function startLeg() {
  const btn = document.getElementById('btn-start-leg');
  btn.disabled = true;

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

  const coords = await getPositionWithRetry(document.getElementById('leg-gps'));
  if (!coords) {
    const proceed = await confirmProceedWithoutGps();
    if (!proceed) {
      btn.disabled = false;
      return;
    }
  }

  const action = {
    localId: genId(),
    type: 'journey',
    createdAt: Date.now(),
    body: {
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
    },
  };
  // Salva no celular ANTES de tentar enviar — a partir daqui esse registro nunca mais se perde,
  // mesmo se a internet cair bem nesse instante ou a página fechar.
  queuePendingAction(action);
  say('Enviando...', false);
  render();
  try {
    await sendAction(action);
    removePendingAction(action.localId);
    say('Saída confirmada.', false);
    route = await reloadRoute();
    render();
  } catch (e) {
    say('Sem conexão no momento — a saída foi salva neste celular e será enviada automaticamente assim que possível.', true);
  }
}

async function registerArrival() {
  const journey = route.journeys.find((j) => !j.completed_at);
  const btn = document.getElementById('btn-register-arrival');
  btn.disabled = true;
  const coords = await getPositionWithRetry(document.getElementById('ar-gps'));
  if (!coords) {
    const proceed = await confirmProceedWithoutGps();
    if (!proceed) {
      btn.disabled = false;
      return;
    }
  }
  const photoFile = document.getElementById('ar-photo').files[0];
  const photoBase64 = photoFile ? await fileToBase64(photoFile) : null;

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

  const action = {
    localId: genId(),
    type: 'arrival',
    createdAt: Date.now(),
    body,
    photoBase64,
    photoName: photoFile ? photoFile.name : null,
    photoType: photoFile ? photoFile.type : null,
  };
  // Mesma garantia do início de perna: salva no celular primeiro, só depois tenta enviar.
  queuePendingAction(action);
  say('Enviando...', false);
  baseOpenValue = null;
  render();
  try {
    await sendAction(action);
    removePendingAction(action.localId);
    say('Chegada registrada!', false);
    route = await reloadRoute();
    render();
  } catch (e) {
    say('Sem conexão no momento — a chegada foi salva neste celular (com foto e observações) e será enviada automaticamente assim que possível.', true);
  }
}

async function finishRoute() {
  const action = { localId: genId(), type: 'complete-route', createdAt: Date.now(), body: { route_id: route.id } };
  queuePendingAction(action);
  render();
  try {
    await sendAction(action);
    removePendingAction(action.localId);
    route = await reloadRoute();
    render();
  } catch (e) {
    say('Sem conexão no momento — a conclusão da rota foi salva e será enviada automaticamente assim que possível.', true);
  }
}

boot();
