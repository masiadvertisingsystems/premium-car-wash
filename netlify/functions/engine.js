/**
 * MASI PWS - THE BRIDGE v2.0
 * Florin, aici introduci datele tale din aplicatia Shelly
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // --- DATE DE IDENTITATE (Inlocuieste cu ale tale) ---
  const SHELLY_ID = "cc7b5c0a2538"; 
  const SHELLY_AUTH_KEY = "M2M1YzY4dWlk2D1432348AD156ADC971DE839C20DAAD09B58D673106CE2B67A97A9C47F9ADA674C2C7B75B7A081F";
  const SHELLY_SERVER = "https://shelly-232-eu.shelly.cloud"; // Clusterul tau

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Metoda nepermisa" };
  }

  try {
    const url = `${SHELLY_SERVER}/device/relay/control/`;
    
    const params = new URLSearchParams();
    params.append('id', SHELLY_ID);
    params.append('auth_key', SHELLY_AUTH_KEY);
    params.append('turn', 'on');
    params.append('channel', '0');
    params.append('toggle_after', '1'); // Click scurt de o secunda

    const response = await fetch(url, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = await response.json();

    if (data.isok) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: "CLICK EXECUTAT!" })
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
      body: JSON.stringify({ success: false, error: "Server Error", message: error.message })
    };
  }
};
