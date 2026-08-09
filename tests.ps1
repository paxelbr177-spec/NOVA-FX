Write-Host "Waking up server..."
try {
    $null = Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/' -UseBasicParsing -TimeoutSec 30
} catch {
    Write-Host "Server might have been sleeping, trying again in 5 seconds..."
    Start-Sleep -Seconds 5
}

Write-Host "`n## Test 1: Verify index.html served by Render"
$html = (Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/index.html' -UseBasicParsing).Content
if ($html -match 'Koywe') { Write-Host 'FAIL: Found Koywe reference in index.html' -ForegroundColor Red } else { Write-Host 'PASS: No Koywe references' -ForegroundColor Green }
if ($html -match 'Bitso|bitso') { Write-Host 'FAIL: Found Bitso reference in index.html' -ForegroundColor Red } else { Write-Host 'PASS: No Bitso references' -ForegroundColor Green }
if ($html -match 'modal-ars-checkout-link') { Write-Host 'PASS: MP checkout link element found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing MP checkout link element' -ForegroundColor Red }
if ($html -match 'qrcode-container') { Write-Host 'PASS: QR container found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing QR container' -ForegroundColor Red }

Write-Host "`n## Test 2: Verify admin.html served by Render"
$html = (Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/admin.html' -UseBasicParsing).Content
if ($html -match 'rates-buy-list') { Write-Host 'PASS: Rates panel found in admin.html' -ForegroundColor Green } else { Write-Host 'FAIL: Missing rates panel' -ForegroundColor Red }
if ($html -match 'payout-cards-container') { Write-Host 'PASS: Payout cards container found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing payout cards container' -ForegroundColor Red }
if ($html -match 'btn-toggle-sound') { Write-Host 'PASS: Sound toggle button found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing sound toggle' -ForegroundColor Red }
if ($html -match 'Koywe|Bitso|bitso') { Write-Host 'FAIL: Found stale references in admin.html' -ForegroundColor Red } else { Write-Host 'PASS: No stale references' -ForegroundColor Green }

Write-Host "`n## Test 3: Verify app.js served by Render"
$js = (Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/app.js' -UseBasicParsing).Content
if ($js -match 'Koywe') { Write-Host 'FAIL: Found Koywe in app.js' -ForegroundColor Red; ($js -split "`n" | Select-String 'Koywe') } else { Write-Host 'PASS: No Koywe in app.js' -ForegroundColor Green }
if ($js -match 'bitsoService|bitso') { Write-Host 'FAIL: Found Bitso in app.js' -ForegroundColor Red } else { Write-Host 'PASS: No Bitso in app.js' -ForegroundColor Green }
if ($js -match 'checkoutUrl') { Write-Host 'PASS: checkoutUrl handling found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing checkoutUrl handling' -ForegroundColor Red }
if ($js -match 'qrCodeBase64') { Write-Host 'PASS: qrCodeBase64 handling found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing qrCodeBase64 handling' -ForegroundColor Red }

Write-Host "`n## Test 4: Verify admin.js served by Render"
$js = (Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/admin.js' -UseBasicParsing).Content
if ($js -match 'loadRates') { Write-Host 'PASS: loadRates function found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing loadRates' -ForegroundColor Red }
if ($js -match 'playAlertSound') { Write-Host 'PASS: playAlertSound found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing playAlertSound' -ForegroundColor Red }
if ($js -match 'renderPayoutCards') { Write-Host 'PASS: renderPayoutCards found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing renderPayoutCards' -ForegroundColor Red }
if ($js -match 'Notification') { Write-Host 'PASS: Browser notifications found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing browser notifications' -ForegroundColor Red }
if ($js -match 'estimatedProfit|Ganancia') { Write-Host 'PASS: Profit calculation found' -ForegroundColor Green } else { Write-Host 'FAIL: Missing profit calculation' -ForegroundColor Red }

Write-Host "`n## Test 5: Verify styles.css loads"
$css = (Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/styles.css' -UseBasicParsing)
if ($css.StatusCode -eq 200) { Write-Host "PASS: styles.css loads (${($css.Content).Length} bytes)" -ForegroundColor Green } else { Write-Host 'FAIL: styles.css not loading' -ForegroundColor Red }

Write-Host "`n## Test 6: Verify CriptoYa API is accessible from our backend"
try {
  $rates = Invoke-RestMethod -Uri 'https://criptoya.com/api/real' -TimeoutSec 10
  if ($rates.satoshitango) { Write-Host 'PASS: CriptoYa API responding with satoshitango data' -ForegroundColor Green } else { Write-Host 'WARN: CriptoYa responded but missing satoshitango' -ForegroundColor Yellow }
  if ($rates.belo) { Write-Host 'PASS: CriptoYa has belo data' -ForegroundColor Green }
  if ($rates.fiwind) { Write-Host 'PASS: CriptoYa has fiwind data' -ForegroundColor Green }
} catch { Write-Host "FAIL: CriptoYa API error: $($_.Exception.Message)" -ForegroundColor Red }
