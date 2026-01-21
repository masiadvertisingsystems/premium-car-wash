/**
 * Motor de Automatizare Premium Car Wash - Versiunea v28.0 [DIAGNOSTIC-ABS]
 * Status: ID cc7b5c0a2538 | Server 232-eu
 * Scop: Eliminarea definitiva a erorii "undefined" si fortarea deploy-ului.
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
    console.log("--- START EXECUTIE V28 ---");

    // 1. Validare date intrare
    if (!event.body) throw new Error("Lipsă date solicitare.");
    const body = JSON.parse(event.body);
    const nrAuto = body.nr_inmatriculare ? body.nr_inmatriculare.toUpperCase().replace(/\s+/g, '') : "ANONIM";
    console.log(`Procesare nr: ${nrAuto}`);

    // 2. Configurație fixă
    const deviceID = "cc7b5c0a2538";
    const shellyServer = "https://shelly-232-eu.shelly.cloud/device/rpc";
    const authKey = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";
    const projectId = "premium-car-wash-systems";

    // 3. Citire Firebase
    const fbUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/premium-car-wash/public/data/loyalty/${nrAuto}`;
    
    let activeStamps = 0;
    let isFreeWash = false;
    let dbMethod = "PATCH";

    const responseFB = await fetch(fbUrl);
    const dataFB = await responseFB.json();
    console.log("Firebase Data:", JSON.stringify(dataFB));

    if (dataFB.fields) {
      // Client existent - Extracție ultra-sigură
      const rawVal = dataFB.fields.stampile_active;
      let current = 0;
      
      if (rawVal) {
        const valueToParse = rawVal.integerValue || rawVal.stringValue || "0";
        current = parseInt(valueToParse);
      }
      
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

    // 4. Salvare Firebase (Fortare numerica)
    const finalCount = String(activeStamps);
    console.log(`Calcul final stamps: ${finalCount}`);
    
    const updateUrl = (dbMethod === "PATCH") 
      ? `${fbUrl}?updateMask.fieldPaths=stampile_active` 
      : fbUrl.replace(`/${nrAuto}`, `?documentId=${nrAuto}`);

    await fetch(updateUrl, {
      method: dbMethod,
      body: JSON.stringify({
        fields: {
          nr_inmatriculare: { stringValue: nrAuto },
          stampile_active: { integerValue: finalCount }
        }
      })
    });

    // 5. Acțiune Shelly
    let shellyStatus = "Inactiv";
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
      shellyStatus = resText.includes('"isok":true') ? "CLICK REUȘIT" : "EROARE SHELLY";
      console.log(`Shelly Result: ${resText}`);
    }

    // Răspuns final - DACĂ VEZI "ÎNREGISTRATĂ", RULEZI COD VECHI!
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        message: isFreeWash ? "🎁 CADOU ACTIVAT!" : `[PROD-V28] Vizite: ${finalCount} / 5`,
        debug: `Sistem: ${shellyStatus} | Time: ${new Date().toLocaleTimeString()}`
      })
    };

  } catch (err) {
    console.error("Critical Error:", err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "error",
        message: "Eroare de procesare V28",
        debug: err.message
      })
    };
  }
};
