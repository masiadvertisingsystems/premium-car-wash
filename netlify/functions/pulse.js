/**
 * Logică Automatizare Premium Car Wash v25.0 - ULTIMATUM DEPLOY
 * Status: ID cc7b5c0a2538 CONFIRMAT | Server 232-eu CONFIRMAT
 * Modificări: Identificator [V25-ULTIMATUM] pentru confirmarea prezenței codului nou.
 */

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Cache-Control",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    console.log("--- START FUNCTIE V25 ---");
    
    if (!event.body) throw new Error("Lipsă date.");
    const bodyParams = JSON.parse(event.body);
    const { nr_inmatriculare } = bodyParams;
    if (!nr_inmatriculare) throw new Error("Lipsă număr.");
    
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // CONFIG HARDCODED (Fără variabile de mediu pentru a evita eroarea undefined)
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
    
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 1; 
    let isFreeWash = false;
    let dbMethod = "POST";

    if (userData.fields) {
      dbMethod = "PATCH";
      let current = 0;
      const field = userData.fields.stampile_active;
      if (field) {
          const val = field.integerValue || field.stringValue || "0";
          current = parseInt(val);
      }
      activeStamps = isNaN(current) ? 1 : current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // Conversie forțată la String pentru a fi siguri că nu e undefined
    const finalCount = String(activeStamps);

    const saveUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    
    await fetch(saveUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          stampile_active: { integerValue: finalCount }
        }
      })
    });

    let shellyLog = "Inactiv";
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

    // Mesajul V25: DACĂ VEZI "ÎNREGISTRATĂ", NU ESTE CODUL NOU!
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        message: isFreeWash ? "🔥 CADOU ACTIVAT!" : `[V25-ULTIMATUM] Vizite: ${finalCount} / 5`, 
        debug: shellyLog 
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: "Eroare Versiune v25", debug: err.message })
    };
  }
};
