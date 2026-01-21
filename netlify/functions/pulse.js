/**
 * Logică Automatizare Premium Car Wash v21.0 - FORCE UPDATE & CACHE BUSTER
 * Status: ID cc7b5c0a2538 CONFIRMAT | Server 232-eu CONFIRMAT
 * Fix: Mesaj nou pentru confirmare deploy + Logica de salvare forțată
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
    // 1. INPUT
    if (!event.body) throw new Error("Body gol.");
    const bodyParams = JSON.parse(event.body);
    const { nr_inmatriculare } = bodyParams;
    if (!nr_inmatriculare) throw new Error("Lipsește numărul.");
    
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // 2. CONFIG HARDCODED
    const shellyBaseUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const deviceID = "cc7b5c0a2538"; 
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F"; 

    const fbConfig = {
        "apiKey": "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4",
        "authDomain": "premium-car-wash-systems.firebaseapp.com",
        "projectId": "premium-car-wash-systems",
        "storageBucket": "premium-car-wash-systems.firebasestorage.app",
        "messagingSenderId": "1066804021666",
        "appId": "1:1066804021666:web:9494cf947ea14502758afb"
    };
    
    // 3. FIREBASE READ
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    if (userData.fields) {
      // Client existent
      let current = 0;
      if (userData.fields.stampile_active.integerValue) current = parseInt(userData.fields.stampile_active.integerValue);
      else if (userData.fields.stampile_active.stringValue) current = parseInt(userData.fields.stampile_active.stringValue);
      
      activeStamps = isNaN(current) ? 1 : current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    } else {
      // Client nou (404 sau eroare)
      activeStamps = 1;
      dbMethod = "POST";
    }

    // 4. FIREBASE WRITE
    const saveUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    
    // Forțăm activeStamps să fie String pentru a nu trimite obiecte goale
    const finalStamps = String(activeStamps);

    await fetch(saveUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          stampile_active: { integerValue: finalStamps }
        }
      })
    });

    // 5. SHELLY
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        message: isFreeWash ? "🔥 SPĂLARE GRATUITĂ!" : `>>> V21-FIX <<< Vizita: ${finalStamps}/5`, 
        debug: shellyLog 
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: err.message, debug: "v21-error" })
    };
  }
};
