/**
 * Logică Automatizare Premium Car Wash v18.0 - ROBUST STAMP COUNTING
 * Status: ID cc7b5c0a2538 CONFIRMAT | Server 232-eu CONFIRMAT | Cheie CONFIRMATĂ
 * Fix: Tratare "undefined" la citirea ștampilelor (suportă și stringValue și integerValue)
 */

exports.handler = async (event) => {
  // Configurare Headers CORS (Vital pentru a nu primi erori în browser)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  // Tratare cereri pre-flight (CORS)
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    // 1. VERIFICARE INPUT
    if (!event.body) throw new Error("Nu s-au primit date (Body gol).");
    
    let bodyParams;
    try {
        bodyParams = JSON.parse(event.body);
    } catch (e) {
        throw new Error("Datele primite nu sunt JSON valid.");
    }

    const { nr_inmatriculare } = bodyParams;
    if (!nr_inmatriculare) throw new Error("Lipsește numărul de înmatriculare.");
    
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // 2. CONFIGURARE TOTALĂ (HARDCODED PENTRU STABILITATE MAXIMĂ)
    // A. CONFIGURARE SHELLY (Confirmată)
    const shellyBaseUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const deviceID = "cc7b5c0a2538"; 
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F"; 

    // B. CONFIGURARE FIREBASE (Integrată direct)
    const fbConfig = {
        "apiKey": "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4",
        "authDomain": "premium-car-wash-systems.firebaseapp.com",
        "databaseURL": "https://premium-car-wash-systems-default-rtdb.europe-west1.firebasedatabase.app",
        "projectId": "premium-car-wash-systems",
        "storageBucket": "premium-car-wash-systems.firebasestorage.app",
        "messagingSenderId": "1066804021666",
        "appId": "1:1066804021666:web:9494cf947ea14502758afb"
    };
    
    // 3. FIREBASE: Căutare Client
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    
    let getRes, userData;
    try {
        getRes = await fetch(fbUrl);
        userData = await getRes.json();
    } catch (e) {
        throw new Error(`Eroare conectare Firebase: ${e.message}`);
    }
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (userData.error && userData.error.code === 404) {
      // Client nou
      activeStamps = 1;
      dbMethod = "POST";
    } else if (userData.fields) {
      // Client existent - LOGICĂ ROBUSTĂ DE EXTRAGERE
      let currentStamps = 0;
      const rawField = userData.fields.stampile_active;
      
      if (rawField) {
          // Verificăm ambele tipuri de date posibile din Firestore
          if (rawField.integerValue) {
              currentStamps = parseInt(rawField.integerValue);
          } else if (rawField.stringValue) {
              currentStamps = parseInt(rawField.stringValue);
          }
      }

      // Protecție suplimentară împotriva NaN
      if (isNaN(currentStamps)) currentStamps = 0;

      activeStamps = currentStamps + 1;
      
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // 4. FIREBASE: Actualizare
    const saveUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active` : fbUrl.replace(`/${plateId}`, `?documentId=${plateId}`);
    
    // Asigurăm că trimitem un string valid către Firestore
    const stampsToSend = (activeStamps !== undefined && activeStamps !== null) ? activeStamps.toString() : "0";

    await fetch(saveUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: plateId },
          stampile_active: { integerValue: stampsToSend }
        }
      })
    });

    // 5. SHELLY TRIGGER (MOMENTUL ADEVĂRULUI)
    let shellyLog = "N/A";
    if (isFreeWash) {
      const rpcParams = JSON.stringify({ id: 0, on: true, toggle_after: 5 });
      
      const postData = new URLSearchParams();
      postData.append('id', deviceID);
      postData.append('auth_key', authKey);
      postData.append('method', 'Switch.Set');
      postData.append('params', rpcParams);

      console.log(`[SHELLY] Sending command to ${deviceID} on 232-eu...`);

      const resS = await fetch(shellyBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postData.toString()
      });
      
      const resText = await resS.text();
      shellyLog = resText;
      console.log(`[SHELLY] Response: ${resText}`);

      try {
          const shellyJson = JSON.parse(resText);
          if (!shellyJson.isok) {
              shellyLog = `REFUZAT: ${JSON.stringify(shellyJson.errors)}`;
          }
      } catch (e) {
          // Ignorăm eroarea de parsare
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        message: isFreeWash ? "🔥 SPĂLARE GRATUITĂ ACTIVATĂ!" : `Vizita ${activeStamps}/5 înregistrată.`, 
        debug: shellyLog 
      })
    };

  } catch (err) {
    console.error("CRITICAL ERROR:", err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: err.message || "Eroare Internă", debug: err.stack })
    };
  }
};
