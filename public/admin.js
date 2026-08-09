const API_BASE_URL = window.location.origin.includes('github.io') 
  ? (window.API_BASE_URL || 'https://nova-fx.onrender.com') 
  : '';

let adminState = {
  pin: sessionStorage.getItem('adminPin') || '',
  stats: null,
  transactions: [],
  users: [],
  currentFilter: 'ALL',
  rates: null,
  knownTxIds: new Set(),
  knownPaymentReceivedIds: new Set(),
  isMuted: false,
  audioCtx: null
};

// ─── Sound Alert System ───
function getAudioContext() {
  if (!adminState.audioCtx) {
    adminState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return adminState.audioCtx;
}

function playAlertSound(times = 5) {
  if (adminState.isMuted) return;
  let count = 0;
  function beep() {
    if (count >= times || adminState.isMuted) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.8, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
      count++;
      setTimeout(beep, 600);
    } catch(e) { console.warn('Audio error:', e); }
  }
  beep();
}

function toggleMuteAdmin() {
  adminState.isMuted = !adminState.isMuted;
  const btn = document.getElementById('btn-toggle-sound');
  if (btn) {
    btn.innerHTML = adminState.isMuted 
      ? '<i data-lucide="volume-x"></i> Sonido OFF' 
      : '<i data-lucide="volume-2"></i> Sonido ON';
    lucide.createIcons();
  }
}

// ─── Browser Notifications ───
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '🔔' });
  }
}

// ─── PIN Auth ───
document.addEventListener('DOMContentLoaded', () => {
  requestNotificationPermission();
  if (adminState.pin) {
    document.getElementById('pin-modal').classList.add('hidden');
    loadAdminData();
    loadRates();
    setInterval(loadAdminData, 10000);  // Poll transactions every 10s
    setInterval(loadRates, 30000);      // Poll rates every 30s
  }
});

function submitPin() {
  const pinInput = document.getElementById('input-pin').value.trim();
  if (pinInput === '058907') {
    adminState.pin = pinInput;
    sessionStorage.setItem('adminPin', pinInput);
    document.getElementById('pin-modal').classList.add('hidden');
    loadAdminData();
    loadRates();
    setInterval(loadAdminData, 10000);
    setInterval(loadRates, 30000);
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('adminPin');
  adminState.pin = '';
  document.getElementById('pin-modal').classList.remove('hidden');
}

// ─── Rates Loading ───
async function loadRates() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/rates/real`);
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        adminState.rates = json.data;
        renderRatesPanel(json.data);
      }
    }
  } catch (e) {
    console.warn('[Admin] Error cargando cotizaciones:', e);
  }
}

function renderRatesPanel(data) {
  const buyList = document.getElementById('rates-buy-list');
  const sellList = document.getElementById('rates-sell-list');
  const timeEl = document.getElementById('rates-updated-time');

  if (!data || !data.rates) return;

  // Buy rates (cheapest first)
  const buyRates = Object.entries(data.rates)
    .filter(([_, r]) => r.buy)
    .sort(([_,a], [__,b]) => a.buy - b.buy);

  buyList.innerHTML = buyRates.map(([name, rate]) => {
    const isBest = data.bestBuy?.platform === name;
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    return `<div class="rate-row ${isBest ? 'best' : ''}">
      <span class="rate-platform">${displayName}${isBest ? '<span class="rate-badge">⭐ MEJOR</span>' : ''}</span>
      <span class="rate-price">$${rate.buy.toFixed(2)} ARS</span>
    </div>`;
  }).join('') || '<div class="rate-row"><span class="rate-platform">Sin datos</span></div>';

  // Sell rates (highest first)
  const sellRates = Object.entries(data.rates)
    .filter(([_, r]) => r.sell)
    .sort(([_,a], [__,b]) => b.sell - a.sell);

  sellList.innerHTML = sellRates.map(([name, rate]) => {
    const isBest = data.bestSell?.platform === name;
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    return `<div class="rate-row ${isBest ? 'best' : ''}">
      <span class="rate-platform">${displayName}${isBest ? '<span class="rate-badge">⭐ MEJOR</span>' : ''}</span>
      <span class="rate-price">$${rate.sell.toFixed(2)} ARS</span>
    </div>`;
  }).join('') || '<div class="rate-row"><span class="rate-platform">Sin datos</span></div>';

  if (timeEl) {
    timeEl.innerText = `Actualizado: ${new Date(data.updatedAt).toLocaleTimeString('es-AR')}`;
  }
}

// ─── Admin Data Loading ───
async function loadAdminData() {
  if (!adminState.pin) return;
  try {
    const headers = { 'x-admin-pin': adminState.pin };
    const [statsRes, txRes, usersRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/admin/stats`, { headers }),
      fetch(`${API_BASE_URL}/api/v1/admin/transactions`, { headers }),
      fetch(`${API_BASE_URL}/api/v1/admin/users`, { headers })
    ]);

    if (statsRes.status === 401 || txRes.status === 401) {
      alert('PIN de Administrador inválido.');
      logoutAdmin();
      return;
    }

    if (statsRes.ok) {
      const statsJson = await statsRes.json();
      if (statsJson.success) {
        adminState.stats = statsJson.data;
        renderKPIs(statsJson.data);
        if (statsJson.data.operatingStatus) {
          renderOperatingStatusUI(statsJson.data.operatingStatus);
        }
      }
    }

    if (txRes.ok) {
      const txJson = await txRes.json();
      if (txJson.success) {
        const oldTxs = adminState.transactions;
        adminState.transactions = txJson.data;
        checkForNewEvents(oldTxs, txJson.data);
      }
    }

    if (usersRes.ok) {
      const usersJson = await usersRes.json();
      if (usersJson.success) {
        adminState.users = usersJson.data;
      }
    }

    renderPayoutCards();
    renderAdminTable();
  } catch (e) {
    console.error('[Admin] Error al cargar datos:', e);
  }
}

function checkForNewEvents(oldTxs, newTxs) {
  if (!oldTxs || oldTxs.length === 0) {
    newTxs.forEach(t => {
      adminState.knownTxIds.add(t.transaction_id);
      if (t.status === 'PAYMENT_RECEIVED') adminState.knownPaymentReceivedIds.add(t.transaction_id);
    });
    return;
  }

  const oldIds = new Set(oldTxs.map(t => t.transaction_id));
  const oldPaymentReceivedIds = new Set(oldTxs.filter(t => t.status === 'PAYMENT_RECEIVED').map(t => t.transaction_id));

  // 1. Detectar órdenes NUEVAS (cuando el cliente genera una transacción PENDING_PAYMENT)
  const brandNewTxs = newTxs.filter(t => !oldIds.has(t.transaction_id) && !adminState.knownTxIds.has(t.transaction_id));
  
  if (brandNewTxs.length > 0) {
    brandNewTxs.forEach(t => adminState.knownTxIds.add(t.transaction_id));
    const firstTx = brandNewTxs[0];
    const typeStr = firstTx.type === 'ARS_TO_BRL' ? 'ARS ➔ BRL' : 'BRL ➔ ARS';
    playAlertSound(6);
    showBrowserNotification(
      '🚨 ¡NUEVA ORDEN INICIADA!',
      `Orden ${typeStr} de ${firstTx.client_name || 'Cliente'} por ${firstTx.amount_source} ${firstTx.currency_source}.`
    );
  }

  // 2. Detectar pagos CONFIRMADOS por Mercado Pago (PAYMENT_RECEIVED)
  const newPayments = newTxs.filter(t => t.status === 'PAYMENT_RECEIVED' && !oldPaymentReceivedIds.has(t.transaction_id) && !adminState.knownPaymentReceivedIds.has(t.transaction_id));
  
  if (newPayments.length > 0) {
    newPayments.forEach(t => adminState.knownPaymentReceivedIds.add(t.transaction_id));
    const firstPayment = newPayments[0];
    playAlertSound(10);
    showBrowserNotification(
      '💰 ¡PAGO CONFIRMADO POR MP!',
      `Pago recibido de ${firstPayment.client_name || 'Cliente'}. Acción requerida: Enviar ${firstPayment.amount_target || ''} ${firstPayment.currency_target || ''}.`
    );
  }
}

function renderKPIs(stats) {
  document.getElementById('kpi-vol-ars').innerText = `$${stats.totalVolumeArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-vol-brl').innerText = `R$ ${stats.totalVolumeBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-comision').innerText = `$${stats.totalCommissionArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS`;
  const pendingCount = adminState.transactions.filter(t => t.status === 'PAYMENT_RECEIVED').length;
  document.getElementById('kpi-pendientes').innerText = `${pendingCount}`;
}

// ─── Payout Action Cards ───
function renderPayoutCards() {
  const container = document.getElementById('payout-cards-container');
  const actionTxs = adminState.transactions.filter(t => t.status === 'PAYMENT_RECEIVED');

  if (actionTxs.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = actionTxs.map(tx => {
    const isArsToBrl = tx.type === 'ARS_TO_BRL';
    const amountSrc = parseFloat(tx.amount_source || 0);
    const amountTgt = parseFloat(tx.amount_target || 0);
    const name = tx.client_name || 'Sin Nombre';
    const phone = tx.client_phone || '';
    const email = tx.client_email || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const waMessage = encodeURIComponent(`Hola ${name}, soy del equipo de soporte de NOVA FX. Tu orden ${tx.transaction_id} está siendo procesada.`);
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMessage}` : '#';

    // Destination info
    let destLabel, destValue;
    if (isArsToBrl) {
      destLabel = 'PIX Destino';
      destValue = `${tx.client_pix_key || 'No disponible'} (${tx.client_pix_key_type || ''})`;
    } else {
      destLabel = 'CBU/CVU Destino';
      destValue = tx.client_cbu_cvu || 'No disponible';
    }

    // Best rate calculation
    let bestPlatform = '—';
    let bestPrice = 0;
    let estimatedProfit = '—';
    if (adminState.rates) {
      if (isArsToBrl && adminState.rates.bestBuy?.price) {
        bestPlatform = adminState.rates.bestBuy.platform;
        bestPrice = adminState.rates.bestBuy.price;
        // Cost = amountTgt * bestPrice (ARS needed to buy the BRL)
        const cost = amountTgt * bestPrice;
        const profit = amountSrc - cost;
        estimatedProfit = `$${profit.toFixed(0)} ARS`;
      } else if (!isArsToBrl && adminState.rates.bestSell?.price) {
        bestPlatform = adminState.rates.bestSell.platform;
        bestPrice = adminState.rates.bestSell.price;
        // Revenue = amountSrc * bestPrice (ARS received from selling BRL)
        const revenue = amountSrc * bestPrice;
        const profit = revenue - amountTgt;
        estimatedProfit = `$${profit.toFixed(0)} ARS`;
      }
    }

    const timeStr = new Date(tx.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

    return `
      <div class="payout-card">
        <div class="payout-header">
          <h4>🔔 PAGO RECIBIDO — ACCIÓN REQUERIDA</h4>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge-type">${isArsToBrl ? 'ARS ➔ BRL' : 'BRL ➔ ARS'}</span>
            <span style="font-size:0.8rem;color:var(--text-muted);">${timeStr}</span>
          </div>
        </div>
        <div class="payout-details">
          <div class="payout-field">
            <div class="label">✅ Recibiste</div>
            <div class="value highlight">${isArsToBrl ? '$' : 'R$'}${amountSrc.toLocaleString(isArsToBrl ? 'es-AR' : 'pt-BR', {minimumFractionDigits:2})} ${tx.currency_source}</div>
          </div>
          <div class="payout-field">
            <div class="label">📤 Debes Enviar</div>
            <div class="value highlight">${isArsToBrl ? 'R$' : '$'}${amountTgt.toLocaleString(isArsToBrl ? 'pt-BR' : 'es-AR', {minimumFractionDigits:2})} ${tx.currency_target}</div>
          </div>
          <div class="payout-field">
            <div class="label">${destLabel}</div>
            <div class="value">${destValue} <button class="btn-copy" style="margin-left:8px;font-size:0.7rem;padding:2px 8px;" onclick="copyToClipboard('${(isArsToBrl ? tx.client_pix_key : tx.client_cbu_cvu) || ''}')">[Copiar]</button></div>
          </div>
          <div class="payout-field">
            <div class="label">Mejor Plataforma</div>
            <div class="value">${bestPlatform.charAt(0).toUpperCase() + bestPlatform.slice(1)} ($${bestPrice.toFixed(2)})</div>
          </div>
          <div class="payout-field">
            <div class="label">👤 Cliente</div>
            <div class="value">${name}<br><span style="font-size:0.8rem;color:var(--text-muted);">${phone} | ${email}</span></div>
          </div>
          <div class="payout-field">
            <div class="label">💰 Ganancia Estimada</div>
            <div class="value highlight">${estimatedProfit}</div>
          </div>
        </div>
        <div class="payout-actions">
          <button class="btn-complete" onclick="changeStatus('${tx.transaction_id}', 'COMPLETED')">✅ Marcar Completado</button>
          ${cleanPhone ? `<a href="${waUrl}" target="_blank" class="btn-wa">📱 WhatsApp</a>` : ''}
          <button class="btn-refund" onclick="changeStatus('${tx.transaction_id}', 'REFUNDED')">❌ Devolver</button>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Filters ───
function setFilter(filterType) {
  adminState.currentFilter = filterType;
  document.getElementById('filter-all').classList.toggle('active', filterType === 'ALL');
  document.getElementById('filter-action').classList.toggle('active', filterType === 'ACTION');
  document.getElementById('filter-completed').classList.toggle('active', filterType === 'COMPLETED');
  document.getElementById('filter-users').classList.toggle('active', filterType === 'USERS');
  renderPayoutCards();
  renderAdminTable();
}

// ─── Render Table ───
function renderAdminTable() {
  const tbody = document.getElementById('admin-tbody');
  const search = document.getElementById('admin-search').value.toLowerCase().trim();

  if (adminState.currentFilter === 'USERS') {
    let filteredUsers = adminState.users;
    if (search) {
      filteredUsers = filteredUsers.filter(u =>
        (u.name||'').toLowerCase().includes(search) ||
        (u.email||'').toLowerCase().includes(search) ||
        (u.phone||'').toLowerCase().includes(search)
      );
    }
    if (filteredUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron clientes registrados.</td></tr>';
      return;
    }
    tbody.innerHTML = filteredUsers.map(u => {
      const timeStr = new Date(u.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      const cleanPhone = (u.phone || '').replace(/[^0-9]/g, '');
      const waMessage = encodeURIComponent(`Hola ${u.name}, te contactamos de la plataforma NOVA FX.`);
      const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMessage}` : '#';
      return `<tr>
        <td><strong>${u.name}</strong></td>
        <td><span class="badge-type">CLIENTE</span></td>
        <td><strong>📱 ${u.phone}</strong><br><span style="font-size:0.8rem; color:var(--text-muted);">📧 ${u.email}</span></td>
        <td>—</td><td>—</td>
        <td><span class="status-badge badge-completed">${timeStr}</span></td>
        <td>${cleanPhone ? `<a href="${waUrl}" target="_blank" class="btn-wa">📱 WA</a>` : '<span style="font-size:0.75rem;color:var(--text-muted)">Sin WA</span>'}</td>
      </tr>`;
    }).join('');
    return;
  }

  let filtered = adminState.transactions;
  if (adminState.currentFilter === 'ACTION') {
    filtered = filtered.filter(t => t.status === 'PAYMENT_RECEIVED' || t.status === 'FAILED_NEEDS_REVIEW');
  } else if (adminState.currentFilter === 'COMPLETED') {
    filtered = filtered.filter(t => t.status === 'COMPLETED');
  }

  if (search) {
    filtered = filtered.filter(t =>
      (t.transaction_id||'').toLowerCase().includes(search) ||
      (t.client_name||'').toLowerCase().includes(search) ||
      (t.client_phone||'').toLowerCase().includes(search) ||
      (t.client_email||'').toLowerCase().includes(search) ||
      (t.client_pix_key||'').toLowerCase().includes(search) ||
      (t.client_cbu_cvu||'').toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron transacciones.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(tx => {
    const timeStr = new Date(tx.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const name = tx.client_name || 'Sin Nombre';
    const phone = tx.client_phone || '';
    const email = tx.client_email || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const waMessage = encodeURIComponent(`Hola ${name}, te contactamos desde NOVA FX con respecto a tu orden ${tx.transaction_id}.`);
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMessage}` : '#';

    let statusBadgeClass = 'badge-pending';
    if (tx.status === 'COMPLETED') statusBadgeClass = 'badge-completed';
    else if (tx.status === 'FAILED_NEEDS_REVIEW') statusBadgeClass = 'badge-failed';
    else if (tx.status === 'PAYMENT_RECEIVED') statusBadgeClass = 'badge-processing';
    else if (tx.status === 'REFUNDED' || tx.status === 'RESOLVED') statusBadgeClass = 'badge-completed';

    const isArsToBrl = tx.type === 'ARS_TO_BRL';
    const amountSrc = parseFloat(tx.amount_source || 0);
    const amountTgt = parseFloat(tx.amount_target || 0);
    const destVal = isArsToBrl ? (tx.client_pix_key || '') : (tx.client_cbu_cvu || '');
    const destType = isArsToBrl ? `PIX (${tx.client_pix_key_type || ''})` : 'CBU/CVU';

    let profitBadge = '';
    if (amountSrc > 0) {
      const estProfitArs = amountSrc * parseFloat(tx.margin_applied || 0.02);
      profitBadge = `<br><span style="font-size:0.75rem; color:#34d399; font-weight:600;">💰 +$${estProfitArs.toFixed(0)} ARS ganancia (2%)</span>`;
    }

    const copyDestBtn = destVal ? `<br><span style="font-size:0.75rem; color:var(--text-muted);">${destType}: <code>${destVal}</code> <button onclick="copyToClipboard('${destVal}')" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:1px 6px; border-radius:4px; font-size:0.68rem; cursor:pointer;">📋 Copiar</button></span>` : '';

    return `<tr>
      <td><strong><code>${tx.transaction_id.substring(0, 14)}...</code></strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${timeStr}</span></td>
      <td><span class="badge-type">${isArsToBrl ? 'ARS ➔ BRL' : 'BRL ➔ ARS'}</span></td>
      <td><strong>${name}</strong><br><span style="font-size:0.8rem; color:var(--text-muted);">${phone ? '📱 ' + phone : ''} ${email ? '📧 ' + email : ''}</span></td>
      <td><strong>${amountSrc.toLocaleString(isArsToBrl ? 'es-AR' : 'pt-BR')} ${tx.currency_source}</strong>${profitBadge}</td>
      <td><strong class="text-emerald">${amountTgt ? (isArsToBrl ? 'R$ ' + amountTgt.toFixed(2) : '$' + amountTgt.toLocaleString('es-AR', {minimumFractionDigits:2})) : '—'} ${tx.currency_target}</strong>${copyDestBtn}</td>
      <td><span class="status-badge ${statusBadgeClass}">${tx.status}</span></td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${cleanPhone ? `<a href="${waUrl}" target="_blank" class="btn-wa">📱 WA</a>` : ''}
          ${tx.status === 'PENDING_PAYMENT' ? `<button class="btn-primary-glow btn-sm" onclick="changeStatus('${tx.transaction_id}', 'PAYMENT_RECEIVED')" style="padding:4px 10px; font-size:0.75rem; background:linear-gradient(135deg, #3b82f6, #1d4ed8); border:none; color:#fff; font-weight:700; border-radius:6px; cursor:pointer;">💳 Aprobar Pago</button>` : ''}
          <button class="btn-secondary btn-sm" onclick="changeStatus('${tx.transaction_id}', 'COMPLETED')" style="padding:4px 8px; font-size:0.75rem; background:rgba(52, 211, 153, 0.15); border:1px solid rgba(52, 211, 153, 0.3); color:#34d399;">✅ Completar</button>
          <button class="btn-secondary btn-sm" onclick="changeStatus('${tx.transaction_id}', 'REFUNDED')" style="padding:4px 8px; font-size:0.75rem;">↩ Devolver</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Actions ───
async function changeStatus(txId, newStatus) {
  if (!confirm(`¿Cambiar estado de ${txId} a ${newStatus}?`)) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/admin/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminState.pin },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      alert(`Transacción ${txId} actualizada a ${newStatus}`);
      loadAdminData();
    } else {
      alert('Error al actualizar el estado.');
    }
  } catch (e) {
    console.error('[Admin] Error al cambiar estado:', e);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert(`Copiado: ${text}`);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert(`Copiado: ${text}`);
  });
}

function renderOperatingStatusUI(statusInfo) {
  if (!statusInfo) return;
  const statusEl = document.getElementById('admin-operating-status');
  const btnEl = document.getElementById('btn-toggle-hours');

  if (statusEl) {
    if (statusInfo.isOpen) {
      statusEl.style.background = 'rgba(52, 211, 153, 0.15)';
      statusEl.style.borderColor = 'rgba(52, 211, 153, 0.3)';
      statusEl.style.color = '#34d399';
      statusEl.innerHTML = `🟢 <span>Abierto (${statusInfo.operatingHours})</span>`;
    } else {
      statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
      statusEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      statusEl.style.color = '#ef4444';
      statusEl.innerHTML = `🔴 <span>Cerrado (${statusInfo.currentTime})</span>`;
    }
  }

  if (btnEl) {
    const override = statusInfo.manualOverride;
    if (override === 'OPEN') {
      btnEl.innerText = '⚙️ Horario: FORZADO ABIERTO';
    } else if (override === 'CLOSED') {
      btnEl.innerText = '⚙️ Horario: FORZADO CERRADO';
    } else {
      btnEl.innerText = '⚙️ Horario: AUTO (08-23h)';
    }
  }
}

async function toggleAdminOperatingHours() {
  const current = adminState.stats?.operatingStatus?.manualOverride;
  let nextStatus;
  if (current === null || current === undefined) {
    nextStatus = 'CLOSED'; // Si estaba en AUTO, pausar manualmente
  } else if (current === 'CLOSED') {
    nextStatus = 'OPEN';   // Si estaba CERRADO, forzar abrir
  } else {
    nextStatus = 'AUTO';   // Si estaba ABIERTO, volver a AUTO
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/admin/operating-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': adminState.pin
      },
      body: JSON.stringify({ status: nextStatus })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        if (adminState.stats) adminState.stats.operatingStatus = json.data;
        renderOperatingStatusUI(json.data);
        alert(`Estado del servicio actualizado: ${json.data.isOpen ? 'ABIERTO 🟢' : 'CERRADO 🔴'} (${json.data.manualOverride || 'AUTOMÁTICO'})`);
      }
    }
  } catch (e) {
    alert('Error al cambiar el horario operativo.');
  }
}
