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
  savePending(loadPending().filter((a) =>
