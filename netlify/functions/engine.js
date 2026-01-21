/**
 * Motor de Automatizare Premium Car Wash - Versiunea v33.0 [PROD-READY]
 * Status: ID cc7b5c0a2538 | Server 232-eu
 * Fix: Adăugare API Key în REST path + Diagnostic avansat
 */

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const body = JSON.parse(event.body || "{}");
    const nrAuto = body.nr_inmatriculare ? body.nr_inmatriculare.toUpperCase().replace(/\s+/g, '') : "ANONIM";

    if (nrAuto === "ANONIM") throw new Error("Număr auto nevalid.");

    // CONFIGURATIE HARDCODED (Sursa de Adevăr)
    const deviceID = "cc7b5c0a2538";
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";
    const shellyUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const projectId = "premium-car-wash-systems";
    const apiKey = "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4";

    // 1. PATH FIREBASE (Conform Regulii 1 - Securizat cu API Key)
    const fbBaseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}?key=${apiKey}`;
    
    // 2. CITIRE DATE
    const responseFB = await fetch(fbBaseUrl);
    const dataFB = await responseFB.json();

    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (dataFB.fields) {
      // Client existent
      const field = dataFB.fields.stampile_active;
      let current = parseInt(field?.integerValue || field?.stringValue || "0");
      if (isNaN(current)) current = 0;
      
      activeStamps = current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; 
      }
    } else {
      // Client nou
      activeStamps = 1;
      dbMethod = "POST";
    }

    const countStr = String(activeStamps);
    
    // 3. SALVARE DATE (Calculăm URL-ul de scriere)
    const writeUrl = (dbMethod === "PATCH") 
        ? `${fbBaseUrl}&updateMask.fieldPaths=stampile_active` 
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty?documentId=${nrAuto}&key=${apiKey}`;

    await fetch(writeUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: nrAuto },
          stampile_active: { integerValue: countStr }
        }
      })
    });

    // 4. COMANDA SHELLY
    let clickResult = "Așteptare";
    if (isFreeWash) {
      const params = JSON.stringify({ id: 0, on: true, toggle_after: 5 });
      const postData = new URLSearchParams();
      postData.append('id', deviceID);
      postData.append('auth_key', authKey);
      postData.append('method', 'Switch.Set');
      postData.append('params', params);

      const resS = await fetch(shellyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postData.toString()
      });
      const resText = await resS.text();
      clickResult = resText.includes('"isok":true') ? "ACTIVAT" : "EROARE_SHELLY";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        message: isFreeWash ? "🎁 GRATUIT ACTIVAT!" : `VIZITA: ${countStr} / 5 [v33]`,
        info: `Status Shelly: ${clickResult}`
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: "Buba: " + err.message })
    };
  }
};
