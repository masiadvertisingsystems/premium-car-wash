/**
 * Logică Automatizare Premium Car Wash v5.6 - GEN2 NATIVE POST
 * Metoda: POST RPC (Standard Industrial pentru Shelly Plus/Pro)
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

    // 3. TRIGGER SHELLY (GEN2 POST RPC)
    let finalStatus = "Inactiv";
    
    if (isFreeWash) {
      const originalUrl = process.env.SHELLY_IP.trim();
      
      try {
        // Parsăm URL-ul din Netlify pentru a extrage cheile, indiferent de formatul vechi
        const urlObj = new URL(originalUrl);
        const authKey = urlObj.searchParams.get("auth_key");
        // Gen2 acceptă 'cid' sau 'id'. Extragem ce găsim.
        const cid = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id");
        const serverOrigin = urlObj.origin; // ex: https://shelly-232-eu.shelly.cloud

        if (!authKey || !cid) {
           finalStatus = "ERR_CHEI_LIPSA_IN_URL";
        } else {
            // Construim cererea POST standard pentru Gen2
            // Endpoint: /device/rpc
            // Body: id, auth_key, method, params (form-urlencoded)
            const rpcUrl = `${serverOrigin}/device/rpc`;
            
            const params = new URLSearchParams();
            params.append('auth_key', authKey);
            params.append('id', cid); // Cloud API cere parametrul 'id' în body
            params.append('method', 'Switch.Set');
            params.append('params', JSON.stringify({ id: 0, on: true, toggle_after: 240 }));

            console.log(`Trimite POST RPC către ${rpcUrl} pentru ID: ${cid}`);

            const res = await fetch(rpcUrl, {
                method: 'POST',
                body: params,
                signal: AbortSignal.timeout(12000)
            });
            
            const json = await res.json();

            // Shelly Gen2 returnează { isok: true, data: {...} } sau eroare
            if (json.isok === true || (json.result && json.result.was_on !== undefined)) {
                finalStatus = "CLICK_SUCCES_POST";
            } else {
                finalStatus = `ERR_SHELLY_POST: ${JSON.stringify(json)}`;
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
