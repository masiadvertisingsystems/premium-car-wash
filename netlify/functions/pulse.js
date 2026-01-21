/**
 * Logică Automatizare Premium Car Wash v15.0 - CONFIGURAȚIE VALIDATĂ
 * Status: ID cc7b5c0a2538 CONFIRMAT | Server 232-eu CONFIRMAT | Cheie CONFIRMATĂ
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
    const { nr_inmatriculare } = JSON.parse(event.body);
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // --- CONFIGURAȚIE SHELLY EXTRASĂ DIN JSON ---
    const shellyBaseUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const deviceID = "cc7b5c0a2538"; // Confirmat din JSON-ul tău (litere mici)
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F"; // Cheia care a dat 'isok: true'

    const fbConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    
    // 1. FIREBASE: Status Vizite
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${plateId}`;
    const getRes = await fetch(fbUrl);
    const userData = await getRes.json();
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (userData.error && userData.error.code === 404) {
      activeStamps = 1;
      dbMethod = "POST";
    } else if (userData.fields) {
      const current = parseInt(userData.fields.stampile_active?.integerValue || "0");
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    }

    // 2. FIREBASE: Salvare Vizită
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

    // 3. SHELLY TRIGGER (Configurație Finală)
    let shellyLog = "N/A";
    if (isFreeWash) {
      // Parametrii pentru Switch:0 (văzut în JSON)
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
      
      shellyLog = await resS.text();
      console.log(`[SHELLY] Response: ${shellyLog}`);
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
    console.error(err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: "Eroare Server", debug: err.message })
    };
  }
};
