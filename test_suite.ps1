$ErrorActionPreference = 'Stop'

function Test-Endpoint {
    param(
        [string]$Name,
        [scriptblock]$TestBlock,
        [switch]$ExpectError,
        [switch]$JustStatusCode
    )
    Write-Host "========================================="
    Write-Host "Test: $Name"
    try {
        $result = &$TestBlock
        if ($ExpectError) {
            Write-Host "FAIL - Expected error but succeeded."
            if ($result) { Write-Host ($result | ConvertTo-Json -Depth 10 -Compress) }
        } else {
            Write-Host "PASS"
            if ($JustStatusCode) {
                Write-Host "Status Code: $result"
            } elseif ($result) {
                Write-Host ($result | ConvertTo-Json -Depth 10 -Compress)
            }
        }
    } catch {
        if ($ExpectError) {
            Write-Host "PASS - Expected error caught."
            Write-Host "Error message: $($_.Exception.Message)"
            if ($_.Exception.Response) {
                Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
            }
        } else {
            Write-Host "FAIL - Unexpected error."
            Write-Host "Error message: $($_.Exception.Message)"
            if ($_.Exception.Response) {
                Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
                Write-Host "Response Body: $($_.Exception.Response.GetResponseStream() | %{ (New-Object IO.StreamReader($_)).ReadToEnd() })"
            }
        }
    }
}

# Wake up the server
Write-Host "Waking up server..."
try {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/health' -Method GET -TimeoutSec 15 | Out-Null
} catch {
    Write-Host "Server might be sleeping, waiting 30 seconds..."
    Start-Sleep -Seconds 30
}

Test-Endpoint -Name "Test 1: Health Check" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/health' -Method GET
}

Test-Endpoint -Name "Test 2: Get Quote ARS->BRL" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/quote?type=ARS_TO_BRL&amount=100000' -Method GET
}

Test-Endpoint -Name "Test 3: Get Quote BRL->ARS" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/quote?type=BRL_TO_ARS&amount=500' -Method GET
}

Test-Endpoint -Name "Test 4: CriptoYa Rates" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/rates/real' -Method GET
}

$global:tx1 = $null
Test-Endpoint -Name "Test 5: Create Transaction ARS->BRL" -TestBlock {
    $body = @{ type='ARS_TO_BRL'; amount=100000; clientPixKey='12345678900'; clientPixKeyType='CPF'; clientName='Test User'; clientEmail='test@novafx.com'; clientPhone='+5511999999999' } | ConvertTo-Json
    $global:tx1 = Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/transactions' -Method POST -Body $body -ContentType 'application/json'
    return $global:tx1
}

$global:tx2 = $null
Test-Endpoint -Name "Test 6: Create Transaction BRL->ARS" -TestBlock {
    $body = @{ type='BRL_TO_ARS'; amount=500; clientCbuCvu='0000003100011411625476'; payerEmail='test@novafx.com'; clientName='Test User BR'; clientPhone='+5511888888888' } | ConvertTo-Json
    $global:tx2 = Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/transactions' -Method POST -Body $body -ContentType 'application/json'
    return $global:tx2
}

Test-Endpoint -Name "Test 7: Get Transaction Status" -TestBlock {
    if (-not $global:tx1 -or -not $global:tx1.data -or -not $global:tx1.data.transactionId) {
        throw "No transaction ID from Test 5"
    }
    $txId = $global:tx1.data.transactionId
    Invoke-RestMethod -Uri "https://nova-fx.onrender.com/api/v1/exchange/transactions/$txId" -Method GET
}

Test-Endpoint -Name "Test 8: Admin Stats" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/admin/stats' -Method GET -Headers @{'x-admin-pin'='058907'}
}

Test-Endpoint -Name "Test 9: Admin Transactions List" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/admin/transactions' -Method GET -Headers @{'x-admin-pin'='058907'}
}

Test-Endpoint -Name "Test 10: Admin Users List" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/admin/users' -Method GET -Headers @{'x-admin-pin'='058907'}
}

Test-Endpoint -Name "Test 11: Admin PIN rejection (security test)" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/admin/stats' -Method GET -Headers @{'x-admin-pin'='000000'}
} -ExpectError

Test-Endpoint -Name "Test 12: Webhook endpoints exist (mercadopago-ar)" -TestBlock {
    try { 
        $res = Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/api/v1/webhooks/mercadopago-ar' -Method POST -Body '{}' -ContentType 'application/json' 
        return $res.StatusCode
    } catch { 
        return $_.Exception.Response.StatusCode.value__
    }
} -JustStatusCode

Test-Endpoint -Name "Test 12: Webhook endpoints exist (mercadopago-br)" -TestBlock {
    try { 
        $res = Invoke-WebRequest -Uri 'https://nova-fx.onrender.com/api/v1/webhooks/mercadopago-br' -Method POST -Body '{}' -ContentType 'application/json' 
        return $res.StatusCode
    } catch { 
        return $_.Exception.Response.StatusCode.value__
    }
} -JustStatusCode

Test-Endpoint -Name "Test 13: Validation tests - Missing amount" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/quote?type=ARS_TO_BRL' -Method GET
} -ExpectError

Test-Endpoint -Name "Test 13: Validation tests - Invalid type" -TestBlock {
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/quote?type=INVALID&amount=100' -Method GET
} -ExpectError

Test-Endpoint -Name "Test 13: Validation tests - Missing PIX key" -TestBlock {
    $body = @{ type='ARS_TO_BRL'; amount=50000 } | ConvertTo-Json
    Invoke-RestMethod -Uri 'https://nova-fx.onrender.com/api/v1/exchange/transactions' -Method POST -Body $body -ContentType 'application/json'
} -ExpectError
