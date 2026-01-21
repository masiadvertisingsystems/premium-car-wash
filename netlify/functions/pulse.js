/**
 * Logică Automatizare Premium Car Wash v8.7 - EMERGENCY BYPASS
 * Fix: Headers de tip Chrome-Mimic și structură POST de înaltă compatibilitate
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
    
    const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    const shellyConfigUrl = process.env.SHELLY_IP.trim();
    const projectId = fbConfig.projectId;
    
    // 1. FIREBASE: Citire/Scriere date
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (userData.error && userData.error.code === 404) {
      activeStamps = 1;
      dbMethod = "POST";
    } else {
      const current = parseInt(userData.fields.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // Actualizare vizită în DB
    const saveUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    await fetch(saveUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          stampile_active: { integerValue: activeStamps.toString() }
        }
      })
    });

    // 2. SHELLY TRIGGER (Metoda "Brute Force" POST)
    let debugInfo = "Vizită salvată. Nu s-a atins pragul de 5.";
    
    if (isFreeWash) {
      const urlObj = new URL(shellyConfigUrl);
      const authKey = urlObj.searchParams.get("auth_key");
      const deviceId = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id");
      
      const rpcUrl = `https://shelly-232-eu.shelly.cloud/device/rpc`;
      const paramsJSON = JSON.stringify({ id: 0, on: true, toggle_after: 240 });

      // Construim corpul mesajului EXACT ca un formular HTML (cea mai mare rată de succes)
      const payload = new URLSearchParams();
      payload.append("id", deviceId);
      payload.append("auth_key", authKey);
      payload.append("method", "Switch.Set");
      payload.append("params", paramsJSON);

      const resShelly = await fetch(rpcUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" // Mimăm un browser real
        },
        body: payload.toString()
      });

      debugInfo = await resShelly.text();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "success", message: isFreeWash ? "🔥 CLICK!" : "OK", debug: debugInfo })
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", debug: error.message }) };
  }
};
