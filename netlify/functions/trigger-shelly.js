/**
 * MASI PWS - THE BRIDGE v2.3
 * Florin, am trecut pe JSON-RPC pentru a forta "Click-ul".
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // --- VERIFICĂ ACESTE DATE ÎN CONTROL.SHELLY.CLOUD ---
  const SHELLY_ID = "cc7b5c0a2538"; 
  const SHELLY_AUTH_KEY = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";
  
  // ATENȚIE: Verifică dacă adresa de server din app e EXACT asta:
  const SHELLY_SERVER = "https://shelly-232-eu.shelly.cloud"; 

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Metoda nepermisa" };
  }

  try {
    // Folosim metoda specifica de Gen 2 (Plus) pentru a evita erorile de tip 400
    const url = `${SHELLY_SERVER}/device/relay/control/`;
    
    const params = new URLSearchParams();
    params.append('id', SHELLY_ID);
    params.append('auth_key', SHELLY_AUTH_KEY);
    params.append('turn', 'on');
    params.append('channel', '0');
    params.append('toggle_after', '0.8'); // Simularea fisei (Click scurt)

    const response = await fetch(url, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = await response.json();

    // Verificam statusul real returnat de Shelly Cloud
    if (data.isok) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ success: true, detail: data })
        };
    } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: "Cloud Rejected", detail: data })
        };
    }

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "Network Error", message: error.message })
    };
  }
};
