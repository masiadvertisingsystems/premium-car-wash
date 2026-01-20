/**
 * Logică Automatizare Premium Car Wash v6.0 - GEN2 DUAL CHANNEL
 * Strategie: POST RPC pe Channel 0 și Channel 1
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

    // 3. TRIGGER SHELLY (Strategie POST Multi-Channel)
    let finalStatus = "Inactiv";
    
    if (isFreeWash) {
      const originalUrl = process.env.SHELLY_IP.trim();
      
      try {
        // Extragem cheile din variabila de mediu
        const urlObj = new URL(originalUrl);
        const authKey = urlObj.searchParams.get("auth_key");
        const cid = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id");
        const serverOrigin = urlObj.origin; 

        if (!authKey || !cid) {
           finalStatus = "ERR_CHEI_LIPSA_URL";
        } else {
            const rpcUrl = `${serverOrigin}/device/rpc`;
            
            // Funcție Helper pentru a trimite comanda pe un anumit canal ID
            const triggerShelly = async (channelId) => {
                const params = new URLSearchParams();
                params.append('auth_key', authKey);
                params.append('id', cid);
                params.append('method', 'Switch.Set');
                params.append('params', JSON.stringify({ id: channelId, on: true, toggle_after: 240 }));

                const res = await fetch(rpcUrl, { method: 'POST', body: params });
                return await res.json();
            };

            // ÎNCERCARE CANAL 0
            console.log("Încercare Channel 0...");
            let json = await triggerShelly(0);

            if (json.isok === true || (json.result && json.result.was_on !== undefined)) {
                finalStatus = "SUCCES_CHANNEL_0";
            } else {
                // ÎNCERCARE CANAL 1 (Fallback dacă Ch 0 eșuează)
                console.log(`Channel 0 eșuat (${JSON.stringify(json)}). Încercare Channel 1...`);
                json = await triggerShelly(1);
                
                if (json.isok === true || (json.result && json.result.was_on !== undefined)) {
                    finalStatus = "SUCCES_CHANNEL_1";
                } else {
                    // DIAGNOSTIC FINAL: Verificăm statusul general
                    const statusParams = new URLSearchParams();
                    statusParams.append('auth_key', authKey);
                    statusParams.append('id', cid);
                    statusParams.append('method', 'Shelly.GetStatus');
                    
                    const statusRes = await fetch(rpcUrl, { method: 'POST', body: statusParams });
                    const statusJson = await statusRes.json();
                    
                    finalStatus = `ESEC_TOTAL: ${JSON.stringify(json)} | STATUS_DEV: ${JSON.stringify(statusJson).substring(0, 100)}`;
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
        debug: String(finalStatus)
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
