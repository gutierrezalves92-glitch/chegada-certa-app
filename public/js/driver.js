const token = new URLSearchParams(location.search).get('token');
const appEl = document.getElementById('app');
const msgEl = document.getElementById('msg');

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

async function boot() {
  if (!token) {
    appEl.innerHTML = `<div class="sheet"><p>Link inválido — falta o token de acesso. Peça um novo link à gestão.</p></div>`;
    return;
  }
  try {
    route = await api('/routes/token/' + token);
  } catch (e) {
    appEl.innerHTML = `<div class="sheet"><p>Não foi possível carregar esta rota (${e.message}).</p></div>`;
    return;
  }
  render();
}

function render() {
  document.getElementById('route-title').textContent = `${route.driver_name} · ${route.plate} · rota #${route.id}`;

  const history = route.arrivals
    .slice()
    .sort((a, b) => (a.leg_number || 0) - (b.leg_number || 0))
    .map(
      (a) => `<div class="status-line"><span>Perna ${a.leg_number}: ${a.origin_base} → ${a.base}</span>
        <span class="pill ${a.status}">${a.status === 'late' ? 'atrasado' : a.status === 'early' ? 'adiantado' : 'no horário'}</span></div>`
    )
    .join('');

  const openJourney = route.journeys.find((j) => !j.completed_at);

  let actionHtml = '';
  if (route.completed_at) {
    actionHtml = `<div class="sheet"><h3>✅ Rota concluída</h3><p class="muted">Concluída em ${fmtDT(route.completed_at)}. Nenhuma ação pendente.</p></div>`;
  } else if (openJourney) {
    actionHtml = arrivalFormHtml(openJourney);
  } else {
    actionHtml = startLegFormHtml();
  }

  appEl.innerHTML = `
    ${history ? `<div class="sheet"><h3>Histórico da rota</h3>${history}</div>` : ''}
    ${actionHtml}
    ${!route.completed_at && !openJourney ? `<button class="bigbtn secondary" onclick="finishRoute()">Concluir rota</button>` : ''}
  `;
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
      <div class="field"><label>Horário agendado (opcional)</label><input type="datetime-local" id="ar-scheduled" /></div>
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
  if (ev.target.id === 'btn-start-leg') return startLeg();
  if (ev.target.id === 'btn-register-arrival') return registerArrival();
});

async function startLeg() {
  const btn = document.getElementById('btn-start-leg');
  btn.disabled = true;
  document.getElementById('leg-gps').textContent = 'obtendo localização...';
  const dest = document.getElementById('leg-dest').value.trim();
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
        origin_base: document.getElementById('leg-origin').value.trim() || 'HUB PRINCIPAL',
        leg_number: nextLegNumber(),
        driver_update_token: token,
        start_latitude: coords?.latitude,
        start_longitude: coords?.longitude,
        start_accuracy_meters: coords?.accuracy,
      }),
    });
    say('Perna iniciada.', false);
    route = await api('/routes/token/' + token);
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
  const scheduledLocal = document.getElementById('ar-scheduled').value;
  const photoFile = document.getElementById('ar-photo').files[0];

  const body = {
    route_id: route.id,
    journey_id: journey.id,
    driver_name: route.driver_name,
    plate: route.plate,
    base: journey.base,
    origin_base: journey.origin_base,
    leg_number: journey.leg_number,
    scheduled_at: scheduledLocal ? new Date(scheduledLocal).toISOString() : null,
    driver_update_token: token,
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
    route = await api('/routes/token/' + token);
    render();
  } catch (e) {
    say(e.message);
    btn.disabled = false;
  }
}

async function finishRoute() {
  try {
    await api(`/routes/${route.id}/complete`, { method: 'PATCH' });
    route = await api('/routes/token/' + token);
    render();
  } catch (e) {
    say(e.message);
  }
}

boot();
