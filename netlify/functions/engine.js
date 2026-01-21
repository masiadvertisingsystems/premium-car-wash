/**
 * Motor de Automatizare Premium Car Wash - Versiunea v32.0 [STABILĂ]
 * Status: ID cc7b5c0a2538 | Server 232-eu
 * Scop: Eliminarea definitiva a erorii "undefined" prin redenumire.
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
    // 1. ANALIZA DATELOR PRIMITE
    const body = JSON.parse(event.body || "{}");
    const nrAuto = body.nr_inmatriculare ? body.nr_inmatriculare.toUpperCase().replace(/\s+/g, '') : "ANONIM";

    if (nrAuto === "ANONIM") {
      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ status: "error", message: "Introdu numărul corect!" }) 
      };
    }

    // 2. CONFIGURATIE HARDCODED (Fara erori de sistem)
    const deviceID = "cc7b5c0a2538";
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";
    const shellyUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const projectId = "premium-car-wash-systems";

    // 3. CITIRE FIREBASE (Cât am acumulat?)
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}`;
    const responseFB = await fetch(fbUrl);
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
        activeStamps = 0; // Resetam pentru runda urmatoare
      }
    } else {
      // Client nou
      activeStamps = 1;
      dbMethod = "POST";
    }

    // --- PROTECTIE ANTI-UNDEFINED (ESENTIAL) ---
    const finalCount = String(activeStamps); 

    // 4. SALVARE FIREBASE (Actualizam cifra)
    const writeUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active` : fbUrl.replace(`/${nrAuto}`, `?documentId=${nrAuto}`);

    await fetch(writeUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: nrAuto },
          stampile_active: { integerValue: finalCount }
        }
      })
    });

    // 5. CLICK SHELLY (Doar la a 5-a vizita)
    let shellyStatus = "Așteptare";
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
      shellyStatus = resText.includes('"isok":true') ? "CLICK REUȘIT" : "EROARE";
    }

    // 6. RASPUNS CATRE CLIENT (Final)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        message: isFreeWash ? "🎁 SPĂLARE GRATUITĂ ACTIVATĂ!" : `PUNCTE: ${finalCount} / 5 [v32]`,
        debug: `Sistem: ${shellyStatus}`
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "error", message: "Buba tehnica: " + err.message })
    };
  }
};