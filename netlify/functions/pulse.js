/**
 * Logică Automatizare Premium Car Wash v20.0 - ULTRA-AGRESIVE SAFETY
 * Status: ID cc7b5c0a2538 CONFIRMAT | Server 232-eu CONFIRMAT
 * Fix: Forțare numerică totală + Identificator Versiune [V20]
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
    // 1. VERIFICARE INPUT
    if (!event.body) throw new Error("Body gol.");
    let bodyParams;
    try { bodyParams = JSON.parse(event.body); } catch (e) { throw new Error("JSON invalid."); }

    const { nr_inmatriculare } = bodyParams;
    if (!nr_inmatriculare) throw new Error("Lipsește numărul.");
    
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // 2. CONFIGURARE HARDCODED (Stabilă)
    const shellyBaseUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const deviceID = "cc7b5c0a2538"; 
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F"; 

    const fbConfig = {
        "apiKey": "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4",
        "authDomain": "premium-car-wash-systems.firebaseapp.com",
        "databaseURL": "https://premium-car-wash-systems-default-rtdb.europe-west1.firebasedatabase.app",
        "projectId": "premium-car-wash-systems",
        "storageBucket": "premium-car-wash-systems.firebasestorage.app",
        "messagingSenderId": "1066804021666",
        "appId": "1:1066804021666:web:9494cf947ea14502758afb"
    };
    
    // 3. FIREBASE READ
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    
    let getRes, userData;
    try {
        getRes = await fetch(fbUrl);
        userData = await getRes.json();
    } catch (e) {
        console.error("Firebase Read Error:", e);
        userData = {};
    }
    
    // Initializare forțată numerică
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (userData.error && userData.error.code === 404) {
      activeStamps = 1;
      dbMethod = "POST";
    } else if (userData.fields) {
      let currentStamps = 0;
      const rawField = userData.fields.stampile_active;
      
      if (rawField) {
          if (rawField.integerValue) currentStamps = parseInt(rawField.integerValue);
          else if (rawField.stringValue) currentStamps = parseInt(rawField.stringValue);
      }

      if (isNaN(currentStamps) || currentStamps === null) currentStamps = 0;
      activeStamps = Number(currentStamps) + 1;
      
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    } else {
        activeStamps = 1;
    }

    // --- PROTECȚIE FINALĂ ---
    // Ne asigurăm că activeStamps este un NUMĂR valid înainte de orice altceva
    if (typeof activeStamps !== 'number' || isNaN(activeStamps)) {
        activeStamps = 1;
    }

    // 4. FIREBASE WRITE
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

    // 5. SHELLY TRIGGER
    let shellyLog = "N/A";
    if (isFreeWash) {
      const rpcParams = JSON.stringify({ id: 0, on: true, toggle_after: 5 });
      const postData = new URLSearchParams();
      postData.append('id', deviceID);
      postData.append('auth_key', authKey);
      postData.append('method', 'Switch.Set');
      postData.append('params', rpcParams);

      const resS = await fetch(shellyBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postData.toString()
      });
      
      shellyLog = await resS.text();
    }

    // Conversie explicită la string pentru a evita "undefined" în template literal
    const displayCount = String(activeStamps);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        message: isFreeWash ? "🔥 SPĂLARE GRATUITĂ ACTIVATĂ!" : `Vizita ${displayCount}/5 [V20].`, 
        debug: shellyLog 
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: err.message, debug: "v20-err" })
    };
  }
};
