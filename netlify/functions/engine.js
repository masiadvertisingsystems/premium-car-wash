/**
 * Motor de Automatizare Premium Car Wash - Versiunea v36.0 [FORCE-CLICK]
 * Status: ID cc7b5c0a2538 | Server 232-eu
 * Fix: Sistem Dual-ID (încearcă ambele formate de ID Shelly pentru a garanta Click-ul)
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

    const projectId = "premium-car-wash-systems";
    const apiKey = "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4";
    const shellyUrl = "https://shelly-232-eu.shelly.cloud/device/rpc";
    
    // Cheia ta de autorizare (Am păstrat formatul cu liniuță)
    const authKey = "M2M1YzY4dWlk-1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";

    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}?key=${apiKey}`;

    const responseFB = await fetch(fbUrl);
    const dataFB = await responseFB.json();

    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    if (dataFB.fields) {
      const field = dataFB.fields.stampile_active;
      let current = parseInt(field?.integerValue || field?.stringValue || "0");
      activeStamps = isNaN(current) ? 1 : current + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0;
      }
    } else {
      activeStamps = 1;
      dbMethod = "POST";
    }

    const countStr = String(activeStamps);
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

    // --- LOGICA SHELLY DUAL-ATTEMPT (v36) ---
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
      body: JSON.stringify({ status: "error", message: "Eroare: " + err.message })
    };
  }
};
