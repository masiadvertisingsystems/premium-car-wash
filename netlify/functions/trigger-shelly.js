/**
 * MASI PWS - THE BRIDGE v2.4 (ULTRA-INDUSTRIAL RPC)
 * Florin, am optimizat payload-ul pentru a forța execuția fizică pe ESP32.
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // DATE DE IDENTITATE (Verifică-le în aplicația Shelly)
  const SHELLY_ID = "cc7b5c0a2538"; 
  const SHELLY_AUTH_KEY = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";
  const SHELLY_SERVER = "https://shelly-232-eu.shelly.cloud"; 

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Metoda nepermisa" };
  }

  try {
    // URL-ul de control pentru RPC Gen 2 (Plus Series)
    const url = `${SHELLY_SERVER}/device/relay/control/`;
    
    // Folosim parametrii expliciți pentru metoda Switch.Set (standardul Robert/Smart Control)
    const params = new URLSearchParams();
    params.append('id', SHELLY_ID);
    params.append('auth_key', SHELLY_AUTH_KEY);
    params.append('turn', 'on');
    params.append('channel', '0');
    // toggle_after: 0.8 secunde pentru a simula perfect caderea unei fise
    params.append('toggle_after', '0.8'); 

    const response = await fetch(url, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = await response.json();

    // Verificăm dacă răspunsul indică succesul comunicării
    if (data.isok) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            success: true, 
            message: "COMANDĂ EXECUTATĂ", 
            detail: data 
          })
        };
    } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            success: false, 
            error: "Cloud Rejected", 
            detail: data 
          })
        };
    }

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false, 
        error: "Network Error", 
        message: error.message 
      })
    };
  }
};
