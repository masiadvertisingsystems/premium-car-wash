/**
 * Logică Automatizare Premium Car Wash v16.0 - CONFIGURAȚIE VALIDATĂ & DEFENSIVĂ
 * Status: ID cc7b5c0a2538 CONFIRMAT | Server 232-eu CONFIRMAT | Cheie CONFIRMATĂ
 * Fix: Verificare variabile mediu pentru a preveni eroarea "Necunoscută"
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
    // 1. VERIFICARE INPUT (Să nu crape dacă body e gol)
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
    
    // 2. VERIFICARE MEDIU (Să nu crape "Necunoscut" dacă lipsește config-ul)
    if (!process.env.FIREBASE_CONFIG) {
        throw new Error("Lipsește variabila FIREBASE_CONFIG în Netlify!");
    }

    // --- CONFIGURAȚIE SHELLY (HARDCODED PENTRU SIGURANȚĂ) ---
    const shellyBaseUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const deviceID = "cc7b5c0a2538"; 
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F"; 

    // Parsare Config Firebase
    let fbConfig;
    try {
        fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (e) {
        throw new Error("Variabila FIREBASE_CONFIG nu este un JSON valid.");
    }
    
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
      // Client existent
      const current = parseInt(userData.fields.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // 4. FIREBASE: Actualizare
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

    // 5. SHELLY TRIGGER (MOMENTUL ADEVĂRULUI)
    let shellyLog = "N/A";
    if (isFreeWash) {
      // Parametrii pentru Switch:0 (văzut în JSON-ul tău)
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

      // Verificăm dacă Shelly a dat eroare, chiar dacă fetch-ul a mers
      try {
          const shellyJson = JSON.parse(resText);
          if (!shellyJson.isok) {
              shellyLog = `REFUZAT: ${JSON.stringify(shellyJson.errors)}`;
          }
      } catch (e) {
          // Ignorăm eroarea de parsare dacă nu e JSON
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
      statusCode: 200, // Returnăm 200 ca să poată citi frontend-ul JSON-ul de eroare
      headers,
      body: JSON.stringify({ status: "error", message: err.message || "Eroare Internă", debug: err.stack })
    };
  }
};
