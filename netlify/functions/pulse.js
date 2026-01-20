/**
 * Logică Automatizare Premium Car Wash v4.5 - ELIMINARE UNDEFINED
 * Sincronizare totală Frontend-Backend pentru Server 232-EU
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
    
    // Verificare critică a mediului
    if (!process.env.FIREBASE_CONFIG) throw new Error("FIREBASE_CONFIG lipsește!");
    if (!process.env.SHELLY_IP) throw new Error("Variabila SHELLY_IP nu este setată în Netlify!");

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
    let finalStatus = "Inactiv";
    
    if (isFreeWash) {
      const shellyUrl = process.env.SHELLY_IP;
      
      try {
        const shellyRes = await fetch(shellyUrl, { timeout: 9000 });
        
        if (shellyRes.ok) {
          finalStatus = "SUCCES_CLOUD_240S";
        } else {
          const errorBody = await shellyRes.text();
          finalStatus = `EROARE_CLOUD_${shellyRes.status}`;
          console.error("Detaliu Eroare Shelly:", errorBody);
        }
      } catch (e) {
        finalStatus = "TIMEOUT_SAU_SHELLY_OFFLINE";
      }
    }

    // Trimitem toate cheile posibile (debug, shellyStatus) pentru a evita 'undefined' indiferent de versiunea index.html
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        activeStamps, 
        isFreeWash, 
        message: isFreeWash ? "SPĂLARE GRATUITĂ ACTIVATĂ!" : `VIZITA ${activeStamps}/5 CONFIRMATĂ.`,
        shellyStatus: String(finalStatus), // Pentru versiuni vechi de index.html
        debug: String(finalStatus)         // Pentru versiuni noi
      })
    };

  } catch (error) {
    console.error("Crash:", error.message);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ 
        status: "error", 
        error: error.message, 
        shellyStatus: "CRASH_SERVER",
        debug: "CRASH_SERVER"
      }) 
    };
  }
};
