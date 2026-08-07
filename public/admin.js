const API_BASE_URL = window.location.origin.includes('github.io') 
  ? (window.API_BASE_URL || 'https://nova-fx.onrender.com') 
  : '';

let adminState = {
  pin: sessionStorage.getItem('adminPin') || '',
  stats: null,
  transactions: [],
  currentFilter: 'ALL'
};

document.addEventListener('DOMContentLoaded', () => {
  if (adminState.pin) {
    document.getElementById('pin-modal').classList.add('hidden');
    loadAdminData();
  }
});

function submitPin() {
  const pinInput = document.getElementById('input-pin').value.trim();
  if (pinInput === '058907') {
    adminState.pin = pinInput;
    sessionStorage.setItem('adminPin', pinInput);
    document.getElementById('pin-modal').classList.add('hidden');
    loadAdminData();
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('adminPin');
  adminState.pin = '';
  document.getElementById('pin-modal').classList.remove('hidden');
}

async function loadAdminData() {
  if (!adminState.pin) return;

  try {
    const headers = { 'x-admin-pin': adminState.pin };

    const [statsRes, txRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/admin/stats`, { headers }),
      fetch(`${API_BASE_URL}/api/v1/admin/transactions`, { headers })
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
      }
    }

    if (txRes.ok) {
      const txJson = await txRes.json();
      if (txJson.success) {
        adminState.transactions = txJson.data;
        renderAdminTable();
      }
    }
  } catch (e) {
    console.error('[Admin] Error al cargar datos:', e);
  }
}

function renderKPIs(stats) {
  document.getElementById('kpi-vol-ars').innerText = `$${stats.totalVolumeArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-vol-brl').innerText = `R$ ${stats.totalVolumeBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-comision').innerText = `$${stats.totalCommissionArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS`;
  document.getElementById('kpi-alertas').innerText = `${stats.needsReviewCount}`;
}

function setFilter(filterType) {
  adminState.currentFilter = filterType;
  document.getElementById('filter-all').classList.toggle('active', filterType === 'ALL');
  document.getElementById('filter-review').classList.toggle('active', filterType === 'REVIEW');
  document.getElementById('filter-completed').classList.toggle('active', filterType === 'COMPLETED');
  renderAdminTable();
}

function renderAdminTable() {
  const tbody = document.getElementById('admin-tbody');
  const search = document.getElementById('admin-search').value.toLowerCase().trim();

  let filtered = adminState.transactions;

  if (adminState.currentFilter === 'REVIEW') {
    filtered = filtered.filter(t => t.status === 'FAILED_NEEDS_REVIEW');
  } else if (adminState.currentFilter === 'COMPLETED') {
    filtered = filtered.filter(t => t.status === 'COMPLETED');
  }

  if (search) {
    filtered = filtered.filter(t => 
      t.transaction_id.toLowerCase().includes(search) ||
      (t.client_name && t.client_name.toLowerCase().includes(search)) ||
      (t.client_phone && t.client_phone.toLowerCase().includes(search)) ||
      (t.client_email && t.client_email.toLowerCase().includes(search)) ||
      (t.client_pix_key && t.client_pix_key.toLowerCase().includes(search)) ||
      (t.client_cbu_cvu && t.client_cbu_cvu.toLowerCase().includes(search))
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

    // Clean phone number for WhatsApp wa.me link
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const waMessage = encodeURIComponent(`Hola ${name}, te contactamos desde el equipo de soporte de NOVA FX con respecto a tu orden ${tx.transaction_id} de ${tx.amount_source} ${tx.currency_source}.`);
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMessage}` : '#';

    let statusBadgeClass = 'badge-pending';
    if (tx.status === 'COMPLETED') statusBadgeClass = 'badge-completed';
    else if (tx.status === 'FAILED_NEEDS_REVIEW') statusBadgeClass = 'badge-failed';
    else if (tx.status === 'REFUNDED' || tx.status === 'RESOLVED') statusBadgeClass = 'badge-completed';

    return `
      <tr>
        <td>
          <strong><code>${tx.transaction_id.substring(0, 14)}...</code></strong><br>
          <span style="font-size:0.75rem; color:var(--text-muted);">${timeStr}</span>
        </td>
        <td><span class="badge-type">${tx.type === 'ARS_TO_BRL' ? 'ARS ➔ BRL' : 'BRL ➔ ARS'}</span></td>
        <td>
          <strong>${name}</strong><br>
          <span style="font-size:0.8rem; color:var(--text-muted);">${phone ? '📱 ' + phone : ''} ${email ? '📧 ' + email : ''}</span>
        </td>
        <td><strong>${tx.amount_source} ${tx.currency_source}</strong></td>
        <td><strong class="text-emerald">${tx.amount_target || '—'} ${tx.currency_target}</strong></td>
        <td><span class="status-badge ${statusBadgeClass}">${tx.status}</span></td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${phone ? `<a href="${waUrl}" target="_blank" class="btn-wa" title="Contactar por WhatsApp">📱 WA Chat</a>` : '<span style="font-size:0.75rem;color:var(--text-muted)">Sin WA</span>'}
            <button class="btn-secondary btn-sm" onclick="changeStatus('${tx.transaction_id}', 'RESOLVED')" style="padding:4px 8px; font-size:0.75rem;">Mark Resuelto</button>
            <button class="btn-secondary btn-sm" onclick="changeStatus('${tx.transaction_id}', 'REFUNDED')" style="padding:4px 8px; font-size:0.75rem;">Mark Devuelto</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function changeStatus(txId, newStatus) {
  if (!confirm(`¿Deseas cambiar el estado de la transacción ${txId} a ${newStatus}?`)) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/admin/transactions/${txId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': adminState.pin
      },
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
