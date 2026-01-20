/**
 * Motor Test Click - Premium Car Wash v2.5
 * Focus: Verificarea legăturii Netlify -> Shelly Cloud
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
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    
    // 1. TEST FIREBASE
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'loyalty', plateId);
    let activeStamps = 1;
    let isFreeWash = false;

    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      await setDoc(userDocRef, { telefon, nr_inmatriculare: plateId, stampile_active: 1, last_visit: new Date().toISOString() });
    } else {
      activeStamps = (userDoc.data().stampile_active || 0) + 1;
      if (activeStamps >= 5) {
        isFreeWash = true;
        activeStamps = 0;
      }
      await updateDoc(userDocRef, { stampile_active: activeStamps, last_visit: new Date().toISOString() });
    }

    // 2. TEST CLICK (SHELLY)
    let shellyStatus = "Not Triggered";
    if (isFreeWash) {
      const shellyUrl = process.env.SHELLY_IP;
      if (shellyUrl) {
        const shellyRes = await fetch(shellyUrl, { method: 'GET', timeout: 8000 });
        shellyStatus = shellyRes.ok ? "CLICK SUCCESS" : "SHELLY CLOUD ERROR";
      } else {
        shellyStatus = "MISSING URL IN NETLIFY";
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: "success", 
        activeStamps, 
        isFreeWash, 
        shellyStatus,
        message: isFreeWash ? "CLICK AR TREBUI SĂ SE AUZĂ!" : `Vizita ${activeStamps}/5 înregistrată.`
      })
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: "Check Netlify Logs" }) };
  }
};
