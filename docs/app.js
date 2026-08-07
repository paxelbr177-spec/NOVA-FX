// Configuración de la URL del Backend (Utilizado cuando el Frontend se aloja en GitHub Pages / Vercel)
const API_BASE_URL = window.API_BASE_URL || 'https://nova-fx.onrender.com';

// Estado de la aplicación frontend
const state = {
  currentFlow: 'ARS_TO_BRL', // 'ARS_TO_BRL' o 'BRL_TO_ARS'
  quote: null,
  activeTxId: null,
  activeTxData: null,
  history: [],
  user: null
};

// Cotizaciones de respaldo en caso de que el backend esté desconectado
const fallbackRates = {
  usdtArs: 1575.80,
  usdtBrl: 5.1021,
  margin: 0.02
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  loadClientProfile();
  fetchLiveTickerRates();
  recalculateQuote();
  setInterval(fetchLiveTickerRates, 10000); // Actualizar cotización cada 10s
});

function loadClientProfile() {
  const saved = localStorage.getItem('novaFxClient');
  const logoutBtnNav = document.getElementById('btn-logout-user');
  const logoutBtnModal = document.getElementById('modal-btn-logout');

  if (saved) {
    try {
      const user = JSON.parse(saved);
      state.user = user;
      const labelEl = document.getElementById('user-account-label');
      if (labelEl) labelEl.innerText = `👤 ${user.name.split(' ')[0]}`;
      if (document.getElementById('client-name')) document.getElementById('client-name').value = user.name || '';
      if (document.getElementById('client-phone')) document.getElementById('client-phone').value = user.phone || '';
      if (document.getElementById('client-email-input')) document.getElementById('client-email-input').value = user.email || '';
      if (document.getElementById('payer-email')) document.getElementById('payer-email').value = user.email || '';

      if (logoutBtnNav) logoutBtnNav.classList.remove('hidden');
      if (logoutBtnModal) logoutBtnModal.classList.remove('hidden');
      return;
    } catch (e) {}
  }

  state.user = null;
  const labelEl = document.getElementById('user-account-label');
  if (labelEl) labelEl.innerText = 'Ingresar / Registro 👤';
  if (logoutBtnNav) logoutBtnNav.classList.add('hidden');
  if (logoutBtnModal) logoutBtnModal.classList.add('hidden');
}

function logoutClientProfile() {
  localStorage.removeItem('novaFxClient');
  state.user = null;
  if (document.getElementById('login-name')) document.getElementById('login-name').value = '';
  if (document.getElementById('login-phone')) document.getElementById('login-phone').value = '';
  if (document.getElementById('login-email')) document.getElementById('login-email').value = '';
  if (document.getElementById('client-name')) document.getElementById('client-name').value = '';
  if (document.getElementById('client-phone')) document.getElementById('client-phone').value = '';
  if (document.getElementById('client-email-input')) document.getElementById('client-email-input').value = '';
  if (document.getElementById('payer-email')) document.getElementById('payer-email').value = '';

  loadClientProfile();
  closeClientLoginModal();
}

function openClientLoginModal() {
  if (state.user) {
    if (document.getElementById('login-name')) document.getElementById('login-name').value = state.user.name || '';
    if (document.getElementById('login-phone')) document.getElementById('login-phone').value = state.user.phone || '';
    if (document.getElementById('login-email')) document.getElementById('login-email').value = state.user.email || '';
  }
  const modal = document.getElementById('modal-client-login');
  if (modal) modal.classList.remove('hidden');
}

function closeClientLoginModal() {
  const modal = document.getElementById('modal-client-login');
  if (modal) modal.classList.add('hidden');
}

async function saveClientProfile() {
  const name = document.getElementById('login-name')?.value.trim();
  const phone = document.getElementById('login-phone')?.value.trim();
  const email = document.getElementById('login-email')?.value.trim();

  if (!name || !phone || !email) {
    alert('Por favor complete todos los campos (Nombre, WhatsApp y Email).');
    return;
  }

  const user = { name, phone, email };
  state.user = user;
  localStorage.setItem('novaFxClient', JSON.stringify(user));
  loadClientProfile();
  closeClientLoginModal();

  try {
    await fetch(`${API_BASE_URL}/api/v1/exchange/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
  } catch (e) {
    console.warn('[Frontend] Error registrando usuario en servidor:', e);
  }
}

/**
 * Consulta las cotizaciones en tiempo real desde el backend
 */
async function fetchLiveTickerRates() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/exchange/quote?type=ARS_TO_BRL&amount=100000`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        const rates = data.data.rateSnapshot;
        updateTickerUI(rates.askUsdtArs, rates.bidUsdtBrl);
        return;
      }
    }
  } catch (e) {
    console.warn('[Frontend] Usando cotización de respaldo para ticker');
  }
  updateTickerUI(fallbackRates.usdtArs, fallbackRates.usdtBrl);
}

/**
 * Actualiza la marquesina de precios y ratios
 */
function updateTickerUI(usdtArs, usdtBrl) {
  document.getElementById('ticker-usdt-ars').innerText = `${usdtArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS`;
  document.getElementById('ticker-usdt-brl').innerText = `${usdtBrl.toFixed(4)} BRL`;

  const crossRate = usdtArs / usdtBrl;
  document.getElementById('ticker-cross-rate').innerText = `1 BRL ≈ ${crossRate.toFixed(2)} ARS`;
}

/**
 * Cambia el flujo seleccionado (ARS -> BRL o BRL -> ARS)
 */
function setFlowType(flowType) {
  state.currentFlow = flowType;
  
  const btnArs = document.getElementById('tab-ars-brl');
  const btnBrl = document.getElementById('tab-brl-ars');
  const formArs = document.getElementById('form-ars-to-brl');
  const formBrl = document.getElementById('form-brl-to-ars');
  const btnText = document.getElementById('btn-submit-text');

  if (flowType === 'ARS_TO_BRL') {
    btnArs.classList.add('active');
    btnBrl.classList.remove('active');
    formArs.classList.remove('hidden');
    formBrl.classList.add('hidden');
    btnText.innerText = 'Iniciar Transacción ARS ➔ BRL';

    document.getElementById('label-source-currency').innerText = 'Monto a enviar (ARS)';
    document.getElementById('flag-source').innerText = '🇦🇷';
    document.getElementById('code-source').innerText = 'ARS';

    document.getElementById('label-target-currency').innerText = 'Monto a recibir (BRL estimado)';
    document.getElementById('flag-target').innerText = '🇧🇷';
    document.getElementById('code-target').innerText = 'BRL';
    document.getElementById('amount-source').value = '100000';
  } else {
    btnBrl.classList.add('active');
    btnArs.classList.remove('active');
    formBrl.classList.remove('hidden');
    formArs.classList.add('hidden');
    btnText.innerText = 'Generar Código PIX BRL ➔ ARS';

    document.getElementById('label-source-currency').innerText = 'Monto a enviar (BRL)';
    document.getElementById('flag-source').innerText = '🇧🇷';
    document.getElementById('code-source').innerText = 'BRL';

    document.getElementById('label-target-currency').innerText = 'Monto a recibir (ARS estimado)';
    document.getElementById('flag-target').innerText = '🇦🇷';
    document.getElementById('code-target').innerText = 'ARS';
    document.getElementById('amount-source').value = '500';
  }

  recalculateQuote();
}

/**
 * Invierte la dirección del flujo actual
 */
function toggleFlowDirection() {
  const newFlow = state.currentFlow === 'ARS_TO_BRL' ? 'BRL_TO_ARS' : 'ARS_TO_BRL';
  setFlowType(newFlow);
}

/**
 * Recalcula la cotización y desglose en vivo
 */
async function recalculateQuote() {
  const amountSource = parseFloat(document.getElementById('amount-source').value) || 0;
  if (amountSource <= 0) {
    document.getElementById('amount-target').value = '0.00';
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/exchange/quote?type=${state.currentFlow}&amount=${amountSource}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        state.quote = data.data;
        updateQuoteBreakdown(data.data);
        return;
      }
    }
  } catch (e) {
    console.warn('[Frontend] Usando cálculo local para cotización');
  }

  // Fallback local si el backend no responde
  calculateLocalFallbackQuote(amountSource);
}

/**
 * Actualiza el desglose visual de la cotización
 */
function updateQuoteBreakdown(quote) {
  document.getElementById('amount-target').value = quote.amountTarget.toLocaleString('es-AR', { minimumFractionDigits: 2 });
  document.getElementById('breakdown-usdt').innerText = `~${quote.amountUsdtEstimate.toFixed(2)} USDT`;
  
  if (state.currentFlow === 'ARS_TO_BRL') {
    const spotRate = quote.rateSnapshot.askUsdtArs / quote.rateSnapshot.bidUsdtBrl;
    document.getElementById('breakdown-spot-rate').innerText = `1 BRL = ${spotRate.toFixed(2)} ARS`;
    const grossBrl = quote.amountUsdtEstimate * quote.rateSnapshot.bidUsdtBrl;
    const marginBrl = grossBrl * quote.marginApplied;
    document.getElementById('breakdown-margin').innerText = `-${marginBrl.toFixed(2)} BRL`;
    document.getElementById('breakdown-final-amount').innerText = `${quote.amountTarget.toFixed(2)} BRL`;
  } else {
    const spotRate = quote.rateSnapshot.askUsdtArs / quote.rateSnapshot.askUsdtBrl;
    document.getElementById('breakdown-spot-rate').innerText = `1 BRL = ${spotRate.toFixed(2)} ARS`;
    const grossArs = quote.amountUsdtEstimate * quote.rateSnapshot.askUsdtArs;
    const marginArs = grossArs * quote.marginApplied;
    document.getElementById('breakdown-margin').innerText = `-${marginArs.toFixed(2)} ARS`;
    document.getElementById('breakdown-final-amount').innerText = `${quote.amountTarget.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS`;
  }
}

/**
 * Cálculo fallback en frontend
 */
function calculateLocalFallbackQuote(amount) {
  const usdtArs = fallbackRates.usdtArs;
  const usdtBrl = fallbackRates.usdtBrl;
  const margin = fallbackRates.margin;

  let amountUSDT, amountTarget;
  if (state.currentFlow === 'ARS_TO_BRL') {
    amountUSDT = amount / usdtArs;
    const amountTargetGross = amountUSDT * usdtBrl;
    amountTarget = amountTargetGross * (1 - margin);
  } else {
    amountUSDT = amount / usdtBrl;
    const amountTargetGross = amountUSDT * usdtArs;
    amountTarget = amountTargetGross * (1 - margin);
  }

  const quote = {
    amountSource: amount,
    currencySource: state.currentFlow === 'ARS_TO_BRL' ? 'ARS' : 'BRL',
    amountTarget: parseFloat(amountTarget.toFixed(2)),
    currencyTarget: state.currentFlow === 'ARS_TO_BRL' ? 'BRL' : 'ARS',
    amountUsdtEstimate: amountUSDT,
    rateSnapshot: { askUsdtArs: usdtArs, bidUsdtArs: usdtArs, askUsdtBrl: usdtBrl, bidUsdtBrl: usdtBrl },
    marginApplied: margin
  };

  state.quote = quote;
  updateQuoteBreakdown(quote);
}

/**
 * Envía la solicitud de transacción al backend
 */
async function submitExchangeOrder() {
  const amount = parseFloat(document.getElementById('amount-source').value) || 0;
  if (amount <= 0) {
    alert('Por favor ingrese un monto válido.');
    return;
  }

  const clientName = document.getElementById('client-name')?.value.trim() || '';
  const clientPhone = document.getElementById('client-phone')?.value.trim() || '';
  const clientEmail = document.getElementById('client-email-input')?.value.trim() || '';

  const payload = {
    type: state.currentFlow,
    amount: amount,
    clientName,
    clientPhone,
    clientEmail
  };

  if (state.currentFlow === 'ARS_TO_BRL') {
    const pixKey = document.getElementById('pix-key-value').value.trim();
    const pixKeyType = document.getElementById('pix-key-type').value;
    if (!pixKey) {
      alert('Por favor ingrese la Chave PIX de destino en Brasil.');
      return;
    }
    payload.clientPixKey = pixKey;
    payload.clientPixKeyType = pixKeyType;
  } else {
    const cbu = document.getElementById('client-cbu').value.trim();
    const email = document.getElementById('payer-email')?.value.trim() || clientEmail;
    if (!cbu || cbu.length < 15) {
      alert('Por favor ingrese un CBU/CVU válido de 22 dígitos en Argentina.');
      return;
    }
    payload.clientCbuCvu = cbu;
    payload.payerEmail = email || 'cliente@brasil.com';
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/exchange/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json().catch(() => ({}));

    if (res.ok && result.success && result.data) {
      state.activeTxData = result.data;
      state.activeTxId = result.data.transactionId;
      addHistoryRecord(result.data);
      openTransactionModal(result.data);
    } else {
      alert(`Error: ${result.error || 'No se pudo crear la transacción. Intenta de nuevo.'}`);
    }
  } catch (e) {
    console.error('[Frontend] Error conectando al backend:', e);
    alert('No se pudo conectar al servidor de NOVA FX. Verificá tu conexión e intentá de nuevo.');
  }
}

/**
 * Abre el modal con el detalle y código PIX / Instrucciones ARS
 */
function openTransactionModal(txData) {
  const modal = document.getElementById('modal-tx');
  document.getElementById('modal-tx-type').innerText = txData.type === 'ARS_TO_BRL' ? 'ARS ➔ BRL' : 'BRL ➔ ARS';
  document.getElementById('modal-tx-id').innerText = txData.transactionId;
  document.getElementById('modal-tx-time').innerText = new Date().toLocaleTimeString();

  const sectionArs = document.getElementById('modal-deposit-ars');
  const sectionPix = document.getElementById('modal-pix-brl');

  if (txData.type === 'ARS_TO_BRL') {
    sectionArs.classList.remove('hidden');
    sectionPix.classList.add('hidden');
    document.getElementById('modal-ars-amount').innerText = `$${txData.amountSource.toLocaleString('es-AR')} ARS`;

    const alias = txData.depositInstructions?.alias || 'codeo.axel.204.mp';
    const cbu = txData.depositInstructions?.cbu || '0000003100011411625476';
    if (document.getElementById('modal-ars-alias')) document.getElementById('modal-ars-alias').innerText = alias;
    if (document.getElementById('modal-ars-cbu')) document.getElementById('modal-ars-cbu').innerText = cbu;

    const checkoutUrl = txData.arsPayment?.checkoutUrl || txData.arsPayment?.sandboxUrl || '#';
    const linkEl = document.getElementById('modal-ars-checkout-link');
    if (linkEl) {
      linkEl.href = checkoutUrl;
    }
  } else {
    sectionPix.classList.remove('hidden');
    sectionArs.classList.add('hidden');

    if (!txData.pixPayment || !txData.pixPayment.qrCode) {
      alert('Error: Mercado Pago Brasil no devolvió un código PIX válido.');
      return;
    }

    const qrCodeText = txData.pixPayment.qrCode;
    document.getElementById('pix-code-text').value = qrCodeText;

    // Generar o renderizar imagen oficial de Mercado Pago
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = '';

    if (txData.pixPayment.qrCodeBase64) {
      qrContainer.innerHTML = `<img src="data:image/png;base64,${txData.pixPayment.qrCodeBase64}" width="180" height="180" style="border-radius:12px;" alt="QR PIX Mercado Pago" />`;
    } else {
      new QRCode(qrContainer, {
        text: qrCodeText,
        width: 180,
        height: 180,
        colorDark: "#0B0E14",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    const ticketLinkEl = document.getElementById('pix-ticket-link');
    if (ticketLinkEl && txData.pixPayment.ticketUrl) {
      ticketLinkEl.href = txData.pixPayment.ticketUrl;
      ticketLinkEl.classList.remove('hidden');
    }
  }

  updateModalStepper(txData.status || 'PENDING_PAYMENT');
  modal.classList.remove('hidden');
}

/**
 * Cierra el modal
 */
function closeModal() {
  document.getElementById('modal-tx').classList.add('hidden');
}

/**
 * Copia texto al portapapeles
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  alert(`Copiado al portapapeles: ${text}`);
}

/**
 * Copia el código PIX Copia e Cola
 */
function copyPixCode() {
  const text = document.getElementById('pix-code-text').value;
  copyToClipboard(text);
}

/**
 * Simula el recibo de un Webhook para avanzar los pasos en la demostración
 */
async function simulatePaymentWebhook() {
  if (!state.activeTxData) return;

  const tx = state.activeTxData;
  const steps = ['PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'CONVERTING_CRYPTO', 'DISBURSING_FIAT', 'COMPLETED'];
  let currentIdx = steps.indexOf(tx.status);
  
  if (currentIdx < steps.length - 1) {
    tx.status = steps[currentIdx + 1];
    updateModalStepper(tx.status);
    updateHistoryRecordStatus(tx.transactionId, tx.status);
  } else {
    alert('Esta transacción ya ha sido completamente ejecutada.');
  }
}

/**
 * Actualiza el indicador visual del Stepper en el modal
 */
function updateModalStepper(status) {
  const map = {
    'PENDING_PAYMENT': 1,
    'PAYMENT_RECEIVED': 2,
    'CONVERTING_CRYPTO': 3,
    'DISBURSING_FIAT': 4,
    'COMPLETED': 5
  };
  const activeStep = map[status] || 1;

  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    const lineEl = document.getElementById(`line-${i}`);

    if (i < activeStep) {
      stepEl.className = 'step-item completed';
      if (lineEl) lineEl.style.backgroundColor = 'var(--color-emerald)';
    } else if (i === activeStep) {
      stepEl.className = 'step-item active';
      if (lineEl) lineEl.style.backgroundColor = 'var(--color-primary)';
    } else {
      stepEl.className = 'step-item';
      if (lineEl) lineEl.style.backgroundColor = 'var(--bg-card-border)';
    }
  }
}

/**
 * Agrega un registro a la tabla de historial
 */
function addHistoryRecord(tx) {
  state.history.unshift(tx);
  renderHistoryTable();
}

/**
 * Actualiza el estado de una transacción en el historial
 */
function updateHistoryRecordStatus(txId, newStatus) {
  const item = state.history.find(t => t.transactionId === txId);
  if (item) {
    item.status = newStatus;
    renderHistoryTable();
  }
}

/**
 * Renderiza la tabla de transacciones recientes
 */
function renderHistoryTable() {
  const tbody = document.getElementById('history-tbody');
  if (state.history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay transacciones registradas en la sesión.</td></tr>';
    return;
  }

  tbody.innerHTML = state.history.map(tx => `
    <tr onclick="openTransactionModal(state.history.find(t => t.transactionId === '${tx.transactionId}'))" style="cursor:pointer">
      <td title="${tx.transactionId}"><code>${tx.transactionId.substring(0, 14)}...</code></td>
      <td><span class="badge-type">${tx.type === 'ARS_TO_BRL' ? 'ARS ➔ BRL' : 'BRL ➔ ARS'}</span></td>
      <td><strong>${tx.amountSource} ${tx.currencySource}</strong></td>
      <td><span class="status-badge ${tx.status === 'COMPLETED' ? 'badge-completed' : (tx.status === 'FAILED_NEEDS_REVIEW' ? 'badge-failed' : 'badge-pending')}">${tx.status}</span></td>
    </tr>
  `).join('');
}

function refreshTransactions() {
  renderHistoryTable();
}
