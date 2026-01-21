# SCRIPT DE LANSARE OFICIALĂ v37.4 [ANTI-CACHE & DEEP DIAGNOSTIC]
# Obiectiv: Declanșarea releului și forțarea serverului să renunțe la versiunile vechi.

# Adăugăm un parametru de timp pentru a păcăli orice sistem de cache (Cache-Busting)
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$url = "https://69710f4aee5aa5429dc3c012--premium-car-wash.netlify.app/api/engine?t=$timestamp"

$numarUnic = "B" + (Get-Random -Minimum 100 -Maximum 999) + "CASH"

Write-Host "🚀 PORNIRE TEST v37.4 (FORȚARE REFRESH) PENTRU: $numarUnic" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

for ($i = 1; $i -le 5; $i++) {
    $body = @{ nr_inmatriculare = $numarUnic; telefon = "0700000000" } | ConvertTo-Json
    Write-Host "🔄 Pasul $i/5..." -NoNewline
    
    try {
        # Trimitem headere anti-cache direct din PowerShell
        $headers = @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" }
        $res = Invoke-WebRequest -Uri $url -Method Post -Body $body -ContentType "application/json" -Headers $headers -UseBasicParsing -ErrorAction Stop
        $json = $res.Content | ConvertFrom-Json
        
        # VERIFICARE CRITICĂ VERSIUNE (Analiza decalajului GitHub-Netlify)
        if ($json.message -like "*[v33]*") {
            Write-Host "`n❌ EROARE: SERVERUL ESTE BLOCAT PE [v33]!" -ForegroundColor Red
            Write-Host "👉 Buba: Deși tu ai v36 în editor, Netlify NU a reușit să facă deploy-ul." -ForegroundColor Yellow
            Write-Host "👉 Verifică în Netlify la 'Deploys' dacă ultimul build a dat 'Failed'." -ForegroundColor White
            break
        }

        if ($i -lt 5) {
            Write-Host " ✅ OK ($($json.message))" -ForegroundColor Green
        } else {
            Write-Host "`n🔥 MOMENTUL ADEVĂRULUI: $($json.message)" -ForegroundColor Magenta
            if ($json.info -like "*ACTIVAT*") {
                Write-Host "📢 REZULTAT: SUCCESS! RELEUL A FOST ACTIVAT." -ForegroundColor Green
                Write-Host "💰 SISTEMUL ESTE GATA SĂ GENEREZE PROFIT!" -ForegroundColor Cyan
            } else {
                Write-Host "📢 REZULTAT: $($json.info)" -ForegroundColor Yellow
                if ($json.info -like "*max_req*" -or $json.info -like "*limit*") {
                    Write-Host "⚠️ Shelly te-a blocat temporar (Rate Limit). Oprește testele 10 minute!" -ForegroundColor Red
                }
            }
        }
    } catch {
        Write-Host " ❌ EROARE CONEXIUNE - Verifică dacă site-ul e online." -ForegroundColor Red
        break
    }
    Start-Sleep -Seconds 1
}

Write-Host "----------------------------------------------------"
