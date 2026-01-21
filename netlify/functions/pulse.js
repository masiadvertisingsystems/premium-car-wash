/**
 * Logică Automatizare Premium Car Wash v8.8 - ULTIMATE RELIABILITY
 * Fix: Protecție crash la parsare, Verificare Env Vars și Debugging Granular
 */

exports.handler = async (event) => {
  // Headere pentru Cross-Origin Resource Sharing (CORS)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  // Răspuns rapid pentru pre-flight request-ul browserului
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    // 1. Validare Body Request
    if (!event.body) throw new Error("Body-ul cererii este gol.");
    const body = JSON.parse(event.body);
    const { telefon, nr_inmatriculare } = body;
    
    if (!nr_inmatriculare) throw new Error("Lipsește numărul de înmatriculare.");
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // 2. Validare Configurații Cloud
    if (!process.env.FIREBASE_CONFIG) throw new Error("Lipsește variabila FIREBASE_CONFIG în Netlify.");
    if (!process.env.SHELLY_IP) throw new Error("Lipsește variabila SHELLY_IP în Netlify.");

    const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    const shellyConfigUrl = process.env.SHELLY_IP.trim();
    const projectId = fbConfig.projectId;
    
    // 3. FIREBASE: Citire date client
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    // Verificăm dacă documentul există sau e nou
    if (userData.error && userData.error.code === 404) {
      activeStamps = 1;
      dbMethod = "POST";
    } else if (userData.fields) {
      const current = parseInt(userData.fields.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    } else {
      throw new Error("Răspuns Firebase invalid.");
    }

    // 4. FIREBASE: Salvare Vizită
    const saveUrl = (dbMethod === "PATCH") 
      ? `${fbUrl}?updateMask.fieldPaths=stampile_active` 
      : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    
    const saveRes = await fetch(saveUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          stampile_active: { integerValue: activeStamps.toString() }
        }
      })
    });

    if (!saveRes.ok) {
      const saveErr = await saveRes.text();
      throw new Error(`Eroare salvare Firebase: ${saveErr}`);
    }

    // 5. SHELLY TRIGGER (Execuție la vizita 5)
    let shellyLog = "Vizită salvată. Nu s-a atins pragul.";
    
    if (isFreeWash) {
      try {
        const urlObj = new URL(shellyConfigUrl);
        const authKey = urlObj.searchParams.get("auth_key");
        const deviceId = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id");
        
        const rpcUrl = `https://shelly-232-eu.shelly.cloud/device/rpc`;
        const paramsJSON = JSON.stringify({ id: 0, on: true, toggle_after: 240 });

        const payload = new URLSearchParams();
        payload.append("id", deviceId);
        payload.append("auth_key", authKey);
        payload.append("method", "Switch.Set");
        payload.append("params", paramsJSON);

        const resShelly = await fetch(rpcUrl, {
          method: "POST",
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0" 
          },
          body: payload.toString()
        });

        shellyLog = await resShelly.text();
      } catch (e) {
        shellyLog = `Eroare trigger Shelly: ${e.message}`;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        message: isFreeWash ? "🔥 SPĂLARE GRATUITĂ!" : `Vizita ${activeStamps}/5 înregistrată.`,
        debug: shellyLog 
      })
    };

  } catch (error) {
    // Prindem orice eroare și o trimitem către frontend pentru a elimina "Necunoscută"
    return { 
      statusCode: 200, // Trimitem 200 chiar și la eroare pentru ca browserul să poată citi JSON-ul
      headers, 
      body: JSON.stringify({ 
        status: "error", 
        message: "Eroare Procesare",
        debug: error.message 
      }) 
    };
  }
};
