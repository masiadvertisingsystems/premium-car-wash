/**
 * Logică Automatizare Premium Car Wash v6.4 - LEGACY SNIPER
 * Strategie: Folosește exclusiv metoda Legacy (/device/relay/0) care a fost validată prin eroarea max_req.
 * Server: 232-EU | Device: cc7b5c0a2538
 */

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const { telefon, nr_inmatriculare } = JSON.parse(event.body);
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // Verificare Configurație
    if (!process.env.FIREBASE_CONFIG) throw new Error("FIREBASE_CONFIG missing");
    if (!process.env.SHELLY_IP) throw new Error("SHELLY_IP missing");

    const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    const projectId = fbConfig.projectId;
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;

    // 1. FIREBASE: Citire Status
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 0;
    let isFreeWash = false;
    let method = "PATCH";

    if (userData.error && userData.error.code === 404) {
      activeStamps = 1;
      method = "POST";
    } else if (userData.fields) {
      const current = parseInt(userData.fields.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // 2. FIREBASE: Salvare
    const updateMask = "updateMask.fieldPaths=stampile_active&updateMask.fieldPaths=last_visit&updateMask.fieldPaths=telefon&updateMask.fieldPaths=nr_inmatriculare";
    const saveUrl = (method === "PATCH") ? `${fbUrl}?${updateMask}` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    
    await fetch(saveUrl, {
      method: method === "POST" ? "POST" : "PATCH",
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          telefon: { stringValue: telefon },
          stampile_active: { integerValue: activeStamps.toString() },
          last_visit: { stringValue: new Date().toISOString() }
        }
      })
    });

    // 3. TRIGGER SHELLY (LEGACY SNIPER)
    let finalStatus = "Inactiv";
    let debugLog = "";
    
    if (isFreeWash) {
      const originalUrl = process.env.SHELLY_IP.trim();
      
      try {
        const urlObj = new URL(originalUrl);
        const authKey = urlObj.searchParams.get("auth_key");
        const cid = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id");
        const serverOrigin = urlObj.origin; 

        if (!authKey || !cid) {
           finalStatus = "ERR_CHEI_LIPSA_URL";
        } else {
            // TINTIM DIRECT ENDPOINT-UL CARE A RASPUNS (chiar daca cu max_req)
            const legacyUrl = `${serverOrigin}/device/relay/0`;
            
            const params = new URLSearchParams();
            params.append('auth_key', authKey);
            params.append('id', cid);
            params.append('turn', 'on');
            params.append('timer', '240'); // 4 minute

            console.log(`Trimite LEGACY POST către ${legacyUrl}`);

            // Un singur apel, curat, fara retry, pentru a nu bloca serverul
            const res = await fetch(legacyUrl, {
                method: 'POST',
                body: params,
                signal: AbortSignal.timeout(12000)
            });
            
            const json = await res.json();

            if (json.isok === true) {
                finalStatus = "SUCCES_HARDWARE_ACTIVAT";
            } else if (json.errors && json.errors.max_req) {
                 finalStatus = "⚠️ SERVER BLOCAT (Asteapta 15 min)";
            } else {
                finalStatus = `ERR_SHELLY: ${JSON.stringify(json)}`;
            }
        }
      } catch (e) {
        finalStatus = `ERR_CONEXIUNE: ${e.message}`;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        activeStamps, 
        isFreeWash, 
        message: isFreeWash ? "SPĂLARE GRATUITĂ ACTIVATĂ!" : `VIZITA ${activeStamps}/5 CONFIRMATĂ.`,
        shellyStatus: String(finalStatus),
        debug: String(debugLog + finalStatus)
      })
    };

  } catch (error) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ status: "error", error: error.message }) 
    };
  }
};
