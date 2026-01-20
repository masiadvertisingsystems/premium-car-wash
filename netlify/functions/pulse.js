/**
 * Logică Automatizare Premium Car Wash v4.4
 * FIX: Status undefined + Diagnostic detaliat Shelly
 * Server: 232-EU | Device: CC7B5C0A2538
 */

const fetch = require('node-fetch');

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
    
    if (!process.env.FIREBASE_CONFIG) throw new Error("Configuratia FIREBASE_CONFIG lipseste!");
    const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    const projectId = fbConfig.projectId;

    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;

    // 1. CITIRE STATUS CLIENT
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 0;
    let isFreeWash = false;
    let method = "PATCH";

    if (userData.error && userData.error.code === 404) {
      activeStamps = 1;
      method = "POST";
    } else {
      const current = parseInt(userData.fields?.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // 2. SALVARE ÎN FIREBASE
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

    // 3. TRIGGER SHELLY (Logica celor 4 jetoane)
    let hardwareStatus = "Inactiv";
    
    if (isFreeWash) {
      const shellyUrl = process.env.SHELLY_IP;
      
      if (shellyUrl && shellyUrl.includes("http")) {
        try {
          // Timeout scurt pentru a nu bloca functia
          const shellyRes = await fetch(shellyUrl, { timeout: 8000 });
          
          if (shellyRes.ok) {
            hardwareStatus = "SUCCES_CLOUD_240S";
          } else {
            const errorText = await shellyRes.text();
            hardwareStatus = `EROARE_CLOUD_${shellyRes.status}`;
            console.error("Shelly API Error:", errorText);
          }
        } catch (e) {
          hardwareStatus = "EROARE_CONEXIUNE_SHELLY";
          console.error("Fetch Error:", e.message);
        }
      } else {
        hardwareStatus = "URL_SHELLY_INVALID_SAU_LIPSUR";
      }
    }

    // Returnam intotdeauna debug ca string pentru a evita 'undefined' in UI
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        activeStamps, 
        isFreeWash, 
        message: isFreeWash ? "SPĂLARE GRATUITĂ ACTIVATĂ!" : `VIZITA ${activeStamps}/5 CONFIRMATĂ.`,
        debug: String(hardwareStatus)
      })
    };

  } catch (error) {
    console.error("Crash Function:", error.message);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        status: "error", 
        error: error.message, 
        debug: "CRASH_SERVER" 
      }) 
    };
  }
};
