/**
 * Motor de Automatizare Premium Car Wash - Versiunea v36.0 [FORCE-CLICK]
 * Status: ID cc7b5c0a2538 | Server 232-eu
 * Strategie: 1M Euro - Eficiență maximă, mentenanță minimă.
 */

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  };

  // Gestionare pre-flight request pentru CORS
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    // 1. ANALIZA DATE INTRARE
    if (!event.body) throw new Error("Body cerere lipsă.");
    const body = JSON.parse(event.body);
    const nrAuto = body.nr_inmatriculare ? body.nr_inmatriculare.toUpperCase().replace(/\s+/g, '') : "ANONIM";

    if (nrAuto === "ANONIM") throw new Error("Număr auto nevalid.");

    // 2. CONFIGURAȚIE CLOUD (Sursa de Adevăr)
    const projectId = "premium-car-wash-systems";
    const apiKey = "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4";
    const shellyUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    
    // FIX: AuthKey cu separator corect (-) pentru serverul 232-eu
    const authKey = "M2M1YzY4dWlk-1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";

    // 3. FIREBASE: CITIRE STATUS LOIALITATE
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}?key=${apiKey}`;

    const responseFB = await fetch(fbUrl);
    const dataFB = await responseFB.json();

    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (dataFB.fields) {
      // Client existent: Procesăm ștampilele
      const field = dataFB.fields.stampile_active;
      let current = parseInt(field?.integerValue || field?.stringValue || "0");
      
      activeStamps = isNaN(current) ? 1 : current + 1;
      
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; // Resetăm pentru următorul ciclu de profit
      }
    } else {
      // Client nou: Prima vizită
      activeStamps = 1;
      dbMethod = "POST";
    }

    const countStr = String(activeStamps);
    
    // 4. FIREBASE: SALVARE STATUS ACTUALIZAT
    const writeUrl = (dbMethod === "PATCH") 
        ? `${fbUrl}&updateMask.fieldPaths=stampile_active` 
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

    // 5. LOGICA SHELLY DUAL-ATTEMPT (v36)
    // Încercăm ambele formate de ID pentru a garanta execuția pe serverul 232-eu
    let shellyLog = "N/A";
    if (isFreeWash) {
      const idsToTry = ["cc7b5c0a2538", "shellyplusuni-cc7b5c0a2538"];
      let success = false;

      for (const currentId of idsToTry) {
        try {
          const params = JSON.stringify({ id: 0, on: true, toggle_after: 5 });
          const postData = new URLSearchParams();
          postData.append('id', currentId);
          postData.append('auth_key', authKey);
          postData.append('method', 'Switch.Set');
          postData.append('params', params);

          const resS = await fetch(shellyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: postData.toString()
          });
          
          const resText = await resS.text();
          if (resText.includes('"isok":true')) {
            shellyLog = `ACTIVAT (ID: ${currentId})`;
            success = true;
            break; 
          } else {
            shellyLog = `FAIL: ${resText.substring(0, 50)}`;
          }
        } catch (e) {
          shellyLog = `ERR: ${e.message}`;
        }
      }
    }

    // 6. RĂSPUNS FINAL CATRE INTERFAȚĂ
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        message: isFreeWash ? "🎁 GRATUIT ACTIVAT!" : `VIZITA: ${countStr} / 5 [v36]`,
        info: `Status Shelly: ${shellyLog}`
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "error", 
        message: "Eroare: " + err.message 
      })
    };
  }
};
