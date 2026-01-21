/**
 * Motor de Automatizare Premium Car Wash - Versiunea v37.4 [ULTIMATE-FIX]
 * Status: ID cc7b5c0a2538 | Server 232-eu
 * Obiectiv: Maximizare profit, eliminare erori de comunicare hardware.
 */

exports.handler = async (event) => {
  // Headere pentru securitate și eliminarea erorilor de conexiune în browser (CORS)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  };

  // Gestionare pre-flight request (verificarea de securitate a browserului)
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    // 1. ANALIZĂ DATE INTRARE
    if (!event.body) throw new Error("Date primite lipsă.");
    const body = JSON.parse(event.body);
    const nrAuto = body.nr_inmatriculare ? body.nr_inmatriculare.toUpperCase().replace(/\s+/g, '') : "ANONIM";

    if (nrAuto === "ANONIM") throw new Error("Număr de înmatriculare nevalid.");

    // 2. CONFIGURAȚIE CLOUD (Sursa de Adevăr)
    const projectId = "premium-car-wash-systems";
    const apiKey = "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4";
    const shellyUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    
    // AuthKey corect pentru serverul 232-eu
    const authKey = "M2M1YzY4dWlk-1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";

    // 3. FIREBASE: CITIRE STATUS LOIALITATE (Cale publică securizată)
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}?key=${apiKey}`;

    const responseFB = await fetch(fbUrl);
    const dataFB = await responseFB.json();

    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (dataFB.fields) {
      // Client existent: procesăm numărul de ștampile
      const field = dataFB.fields.stampile_active;
      let current = parseInt(field?.integerValue || field?.stringValue || "0");
      
      activeStamps = isNaN(current) ? 1 : current + 1;
      
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; // Resetăm pentru următorul ciclu de profit
      }
    } else {
      // Client nou: înregistrăm prima vizită
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

    // 5. LOGICA SHELLY DUAL-ATTEMPT (v37.4)
    // Încercăm ambele formate de ID pentru a garanta execuția și gestionăm limitele serverului
    let shellyLog = "N/A";
    if (isFreeWash) {
      const idsToTry = ["cc7b5c0a2538", "shellyplusuni-cc7b5c0a2538"];
      
      for (const currentId of idsToTry) {
        try {
          const postData = new URLSearchParams();
          postData.append('id', currentId);
          postData.append('auth_key', authKey);
          postData.append('method', 'Switch.Set');
          postData.append('params', JSON.stringify({ id: 0, on: true, toggle_after: 5 }));

          const resS = await fetch(shellyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: postData.toString()
          });
          
          const resText = await resS.text();
          const resJson = JSON.parse(resText);

          if (resJson.isok) {
            shellyLog = `ACTIVAT (ID: ${currentId})`;
            break; 
          } else {
            // Dacă primim eroare de limitare cereri (max_req)
            if (resJson.errors && resJson.errors.max_req) {
              shellyLog = "SISTEM OCUPAT (Rate Limit). Reîncearcă în 60 sec.";
              break; 
            }
            shellyLog = `FAIL: ${resText.substring(0, 40)}`;
          }
        } catch (e) {
          shellyLog = `ERR: ${e.message}`;
        }
      }
    }

    // 6. RĂSPUNS FINAL CATRE INTERFAȚĂ / POWERSHELL
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        message: isFreeWash ? "🎁 GRATUIT ACTIVAT!" : `VIZITA: ${countStr} / 5 [v37.4]`,
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
