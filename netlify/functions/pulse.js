/**
 * Logică Ultra-Stabilă Premium Car Wash v4.0
 * Metoda: REST API (Fără dependențe grele - evită crash-urile Netlify)
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

  // Gestionare cereri pre-flight CORS
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const { telefon, nr_inmatriculare } = JSON.parse(event.body);
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // Verificare existență configurație
    if (!process.env.FIREBASE_CONFIG) {
      throw new Error("Configurația FIREBASE_CONFIG lipsește din Netlify!");
    }

    const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    const projectId = fbConfig.projectId;
    
    // Calea REST către documentul de fidelizare în Firestore
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;

    // 1. CITIRE DATE DIN FIREBASE (REST API)
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 0;
    let isFreeWash = false;
    let method = "PATCH"; // Default pentru actualizare document existent

    if (userData.error && userData.error.code === 404) {
      // CAZ: CLIENT NOU
      activeStamps = 1;
      method = "POST"; // Creare document nou
    } else if (userData.fields) {
      // CAZ: CLIENT EXISTENT
      const current = parseInt(userData.fields.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; // Resetare card după atingerea pragului
      }
    } else {
      throw new Error("Eroare la citirea datelor din Firebase.");
    }

    // 2. SALVARE DATE ÎN FIREBASE (REST API)
    // Pentru PATCH (update) trebuie să specificăm ce câmpuri actualizăm
    const updateMask = "updateMask.fieldPaths=stampile_active&updateMask.fieldPaths=last_visit&updateMask.fieldPaths=telefon&updateMask.fieldPaths=nr_inmatriculare";
    const saveUrl = (method === "PATCH") ? `${fbUrl}?${updateMask}` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    
    const saveRes = await fetch(saveUrl, {
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

    if (!saveRes.ok) {
      const saveError = await saveRes.json();
      throw new Error("Eroare la salvarea în Firebase: " + JSON.stringify(saveError));
    }

    // 3. TRIGGER SHELLY CLOUD (Doar dacă este a 5-a vizită)
    let shellyLog = "Inactiv";
    if (isFreeWash) {
      const shellyUrl = process.env.SHELLY_IP;
      if (shellyUrl) {
        try {
          const shellyRes = await fetch(shellyUrl, { method: 'GET', timeout: 8000 });
          shellyLog = shellyRes.ok ? "CLICK_SUCCES" : `EROARE_CLOUD_${shellyRes.status}`;
        } catch (e) {
          shellyLog = "TIMEOUT_SHELLY_OFFLINE";
        }
      } else {
        shellyLog = "URL_SHELLY_LIPSESTE";
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
        debug: shellyLog
      })
    };

  } catch (error) {
    console.error("Crash Function:", error.message);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: "EROARE SERVER: " + error.message }) 
    };
  }
};
