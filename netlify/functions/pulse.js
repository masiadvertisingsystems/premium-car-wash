/**
 * Logică Automatizare Premium Car Wash v3.2 - FINAL CLICK
 * Configurat pentru Server 232-EU | Device CC7B5C0A2538
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const fetch = require('node-fetch');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = "premium-car-wash";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const { telefon, nr_inmatriculare } = JSON.parse(event.body);
    if (!nr_inmatriculare) throw new Error("Lipsă număr înmatriculare");

    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'loyalty', plateId);
    
    let activeStamps = 0;
    let isFreeWash = false;
    let message = "";
    let shellyStatus = "N/A";

    // 1. Accesare Firebase
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      activeStamps = 1;
      await setDoc(userDocRef, { 
        telefon, 
        nr_inmatriculare: plateId, 
        stampile_active: 1, 
        last_visit: new Date().toISOString() 
      });
      message = "BINE AI VENIT! AI 1/5 ȘTAMPILE.";
    } else {
      const data = userDoc.data();
      activeStamps = (data.stampile_active || 0) + 1;

      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0; // Resetare card
        message = "SPĂLARE GRATUITĂ ACTIVATĂ!";

        // 2. EXECUTARE COMANDĂ HARDWARE
        const shellyUrl = process.env.SHELLY_IP;
        if (shellyUrl) {
          try {
            const shellyRes = await fetch(shellyUrl, { method: 'GET', timeout: 10000 });
            const resultText = await shellyRes.text();
            
            if (shellyRes.ok) {
              shellyStatus = "CLICK_SUCCES";
            } else {
              shellyStatus = `CLOUD_ERROR: ${shellyRes.status}`;
              console.error("Shelly Error Detail:", resultText);
            }
          } catch (e) {
            shellyStatus = "TIMEOUT_OFFLINE";
          }
        } else {
          shellyStatus = "URL_MISSING_IN_NETLIFY";
        }
      } else {
        message = `VIZITĂ CONFIRMATĂ! AI ${activeStamps}/5 ȘTAMPILE.`;
      }

      await updateDoc(userDocRef, { 
        stampile_active: activeStamps, 
        last_visit: new Date().toISOString() 
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        activeStamps, 
        isFreeWash, 
        message,
        debug: shellyStatus 
      })
    };

  } catch (error) {
    console.error("Global Function Error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
