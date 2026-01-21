/**
 * Logică Automatizare Premium Car Wash v6.3 - DUAL CHANNEL BREAKER
 * Strategie: Atacă Canalul 0 si Canalul 1. Dacă unul e 404, celălalt trebuie să meargă.
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

    // 3. TRIGGER SHELLY (DUAL CHANNEL ATTACK)
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
            const rpcUrl = `${serverOrigin}/device/rpc`;
            
            // Helper pentru POST RPC
            const callRpc = async (methodName, paramsObj) => {
                const p = new URLSearchParams();
                p.append('auth_key', authKey);
                p.append('id', cid);
                p.append('method', methodName);
                if (paramsObj) p.append('params', JSON.stringify(paramsObj));
                
                const r = await fetch(rpcUrl, { method: 'POST', body: p });
                return await r.json();
            };

            // TENTATIVA 1: Canal 0
            console.log("Încercare Canal 0...");
            let res0 = await callRpc('Switch.Set', { id: 0, on: true, toggle_after: 240 });
            
            if (res0.isok === true || (res0.result && res0.result.was_on !== undefined)) {
                finalStatus = "SUCCES_CANAL_0";
            } else {
                debugLog += `CH0_FAIL: ${JSON.stringify(res0)} | `;
                
                // TENTATIVA 2: Canal 1 (Dacă 0 eșuează)
                console.log("Încercare Canal 1...");
                let res1 = await callRpc('Switch.Set', { id: 1, on: true, toggle_after: 240 });
                
                if (res1.isok === true || (res1.result && res1.result.was_on !== undefined)) {
                    finalStatus = "SUCCES_CANAL_1";
                } else {
                    debugLog += `CH1_FAIL: ${JSON.stringify(res1)} | `;
                    
                    // TENTATIVA 3: DIAGNOSTIC (Vedem ce metode suportă de fapt)
                    console.log("Diagnosticare...");
                    let resStatus = await callRpc('Shelly.GetStatus', null);
                    finalStatus = `ESEC_TOTAL. DIAGNOSTIC: ${JSON.stringify(resStatus).substring(0, 150)}`;
                }
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
