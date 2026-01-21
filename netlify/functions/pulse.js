/**
 * Motor de Automatizare Premium Car Wash - Versiunea v27.0 [RECALIBRATĂ]
 * Status: ID cc7b5c0a2538 | Server 232-eu | Protocol: REST/RPC
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
    // 1. Validare date intrare
    if (!event.body) throw new Error("Lipsă date solicitare.");
    const body = JSON.parse(event.body);
    const nrAuto = body.nr_inmatriculare ? body.nr_inmatriculare.toUpperCase().replace(/\s+/g, '') : "ANONIM";

    // 2. Configurație fixă (Hardcoded pentru a evita erorile de mediu)
    const deviceID = "cc7b5c0a2538";
    const shellyServer = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";

    const fbConfig = {
      projectId: "premium-car-wash-systems"
    };

    // 3. Citire Firebase (Protocol REST)
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}`;
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    const responseFB = await fetch(fbUrl);
    const dataFB = await responseFB.json();

    if (dataFB.fields) {
      // Client existent
      const rawVal = dataFB.fields.stampile_active;
      let current = parseInt(rawVal.integerValue || rawVal.stringValue || "0");
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

    // 4. Salvare Firebase
    // Forțăm activeStamps să fie un String valid pentru a evita "undefined"
    const finalCount = String(activeStamps);
    const updateUrl = (dbMethod === "PATCH") ? `${fbUrl}?updateMask.fieldPaths=stampile_active` : fbUrl.replace(`/${nrAuto}`, `?documentId=${nrAuto}`);

    await fetch(updateUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: nrAuto },
          stampile_active: { integerValue: finalCount }
        }
      })
    });

    // 5. Acțiune Shelly (Doar la a 5-a vizită)
    let shellyStatus = "Așteptare";
    if (isFreeWash) {
      const params = JSON.stringify({ id: 0, on: true, toggle_after: 5 });
      const formData = new URLSearchParams();
      formData.append('id', deviceID);
      formData.append('auth_key', authKey);
      formData.append('method', 'Switch.Set');
      formData.append('params', params);

      const resShelly = await fetch(shellyServer, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const resText = await resShelly.text();
      shellyStatus = resText.includes('"isok":true') ? "CLICK REUȘIT" : "EROARE COMANDĂ";
    }

    // Răspuns final către interfață
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        message: isFreeWash ? "🎁 CADOU ACTIVAT!" : `[VERSIUNE-RECALIBRATĂ] Scanări: ${finalCount} / 5`,
        debug: `Sistem: ${shellyStatus}`
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "error",
        message: "Eroare de procesare",
        debug: err.message
      })
    };
  }
};
