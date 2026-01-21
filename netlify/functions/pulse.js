/**
 * Logică Automatizare Premium Car Wash v8.3 - ULTIMATE PRECISION
 * Fix: Transmisie brută tip String pentru compatibilitate maximă Shelly Gen2
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
    
    // 1. FIREBASE: Citire date
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

    // 2. FIREBASE: Salvare
    const saveUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active&updateMask.fieldPaths=last_visit` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    await fetch(saveUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          telefon: { stringValue: telefon },
          stampile_active: { integerValue: activeStamps.toString() },
          last_visit: { stringValue: new Date().toISOString() }
        }
      })
    });

    // 3. SHELLY TRIGGER (Metoda "Forță Brută")
    let shellyLog = "Nu a fost necesară spălarea";
    
    if (isFreeWash) {
      const urlObj = new URL(shellyConfigUrl);
      const authKey = urlObj.searchParams.get("auth_key");
      const deviceId = urlObj.searchParams.get("cid") || urlObj.searchParams.get("id");
      const rpcUrl = `${urlObj.origin}/device/rpc`;

      // Construim corpul mesajului EXACT cum îl vrea serverul 232-eu
      const bodyParams = new URLSearchParams();
      bodyParams.append('auth_key', authKey);
      bodyParams.append('id', deviceId);
      bodyParams.append('method', 'Switch.Set');
      bodyParams.append('params', JSON.stringify({ id: 0, on: true, toggle_after: 240 }));

      const resShelly = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
      });

      const responseText = await resShelly.text();
      shellyLog = `Răspuns Shelly: ${responseText}`;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        activeStamps, 
        isFreeWash, 
        message: isFreeWash ? "🔥 SPĂLARE ACTIVATĂ!" : `Vizita ${activeStamps}/5 înregistrată.`,
        debug: shellyLog
      })
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", error: error.message }) };
  }
};
