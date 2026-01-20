/**
 * Logică Automatizare Premium Car Wash v5.4 - HYBRID PROTOCOL (Gen1 + Gen2)
 * Detectează automat tipul dispozitivului și aplică metoda corectă.
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

    // 3. TRIGGER SHELLY (Strategia Hibridă)
    let finalStatus = "Inactiv";
    
    if (isFreeWash) {
      const originalUrl = process.env.SHELLY_IP.trim();
      
      try {
        // TENTATIVA 1: Protocol Gen2 (RPC) - Link-ul curent
        console.log("Incercare Gen2 RPC...");
        const res1 = await fetch(originalUrl, { signal: AbortSignal.timeout(8000) });
        const json1 = await res1.json();
        
        if (json1.isok === true || (json1.result && json1.result.was_on !== undefined)) {
          finalStatus = "SUCCES_GEN2_RPC";
        } else {
          // DACĂ EȘUEAZĂ (Eroarea 404 primită de tine), trecem la Planul B
          console.log("Gen2 esuat (" + JSON.stringify(json1) + "). Se incearca Gen1 Legacy...");
          
          // Extragem Auth Key și ID din URL-ul existent pentru a construi URL-ul vechi
          const urlObj = new URL(originalUrl);
          const authKey = urlObj.searchParams.get("auth_key");
          const cid = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id"); // Gen2 folosește cid, Gen1 id
          
          if (!authKey || !cid) throw new Error("Nu pot extrage cheile din URL pentru fallback.");

          // Construim URL-ul pentru Generația 1 (Legacy)
          // Format: /device/relay/0?turn=on&timer=240
          const gen1Url = `https://shelly-232-eu.shelly.cloud/device/relay/0?turn=on&timer=240&auth_key=${authKey}&id=${cid}`;
          
          const res2 = await fetch(gen1Url, { 
             method: 'POST', // Gen1 preferă POST uneori
             signal: AbortSignal.timeout(8000) 
          });
          const json2 = await res2.json(); // Gen1 returnează tot JSON

          // Gen1 returnează { "isok": true }
          if (json2.isok === true) {
            finalStatus = "SUCCES_GEN1_LEGACY";
          } else {
            finalStatus = `ESEC_TOTAL: ${JSON.stringify(json2)}`;
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
