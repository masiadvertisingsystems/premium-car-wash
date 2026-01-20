/**
 * Premium Car Wash - Loyalty & Hardware Automation v2.2
 * Strategia 1M Euro: Costuri zero, fidelizare maximă, execuție instantanee.
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const fetch = require('node-fetch');

// Configurare Firebase - Preluată din Netlify Environment Variables
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = "premium-car-wash";

// Configurare Shelly Uni Plus
const SHELLY_IP = process.env.SHELLY_IP; // IP-ul local sau URL-ul Cloud
const SHELLY_AUTH_KEY = process.env.SHELLY_AUTH_KEY; // Token-ul de acces

exports.handler = async (event, context) => {
  // Setări CORS pentru a permite accesul de pe orice dispozitiv mobil la boxă
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  // Gestionare pre-flight request pentru browser
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { telefon, nr_inmatriculare, jetoane } = JSON.parse(event.body);
    const userAgent = event.headers['user-agent'] || 'unknown';

    if (!telefon || !nr_inmatriculare) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Date de identificare lipsă." }) };
    }

    // Normalizare identificator unic (Mașina este entitatea plătitoare)
    const plateId = nr_inmatriculare.toUpperCase().replace(/\s+/g, '');
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'loyalty', plateId);
    const userDoc = await getDoc(userDocRef);

    let activeStamps = 0;
    let isFreeWash = false;
    let message = "";

    if (!userDoc.exists()) {
      // CAZUL 1: Client nou - Prima vizită
      activeStamps = 1;
      await setDoc(userDocRef, {
        telefon,
        nr_inmatriculare: plateId,
        stampile_active: 1,
        total_lifetime_visits: 1,
        user_agent: userAgent,
        last_visit: new Date().toISOString(),
        history: [{ date: new Date().toISOString(), tokens: jetoane, type: 'paid' }]
      });
      message = "Bun venit la Premium Car Wash! Prima ștampilă a fost adăugată. Mai ai 4 până la spălarea GRATUITĂ.";
    } else {
      // CAZUL 2: Client existent - Verificăm pragul de 5
      const userData = userDoc.data();
      let currentActive = userData.stampile_active || 0;
      let totalLifetime = (userData.total_lifetime_visits || 0) + 1;

      if (currentActive >= 4) {
        // ACTIVARE SPĂLARE GRATUITĂ (Vizita nr. 5)
        isFreeWash = true;
        activeStamps = 0; // RESETAREA ștampilelor conform cerinței
        message = "FELICITĂRI! Ai acumulat 4 ștampile. Această spălare este GRATUITĂ! Se activează acum...";

        // COMANDĂ HARDWARE: Activăm Releul Shelly Uni Plus
        if (SHELLY_IP) {
          try {
            // Trimitem comanda către Shelly pentru a închide releul timp de 60 sec (sau timpul unei spălări)
            const shellyUrl = `http://${SHELLY_IP}/rpc/Switch.Set?id=0&on=true&toggle_after=60`;
            await fetch(shellyUrl, {
              method: 'GET',
              timeout: 5000,
              headers: SHELLY_AUTH_KEY ? { 'Authorization': `Basic ${SHELLY_AUTH_KEY}` } : {}
            });
          } catch (hwError) {
            console.error("Eroare comunicare Shelly:", hwError.message);
            // Chiar dacă hardware-ul e offline, salvăm vizita pentru a nu frauda clientul
          }
        }

        await updateDoc(userDocRef, {
          stampile_active: 0,
          total_lifetime_visits: totalLifetime,
          last_visit: new Date().toISOString(),
          history: [...(userData.history || []).slice(-10), { date: new Date().toISOString(), type: 'free' }]
        });
      } else {
        // ADAUGARE ȘTAMPILĂ (Vizitele 1-4)
        activeStamps = currentActive + 1;
        const ramase = 5 - activeStamps;
        message = `Vizita confirmată! Ai ${activeStamps}/4 ștampile. Încă ${ramase} vizite până la spălarea GRATUITĂ.`;

        await updateDoc(userDocRef, {
          stampile_active: activeStamps,
          total_lifetime_visits: totalLifetime,
          last_visit: new Date().toISOString(),
          history: [...(userData.history || []).slice(-10), { date: new Date().toISOString(), tokens: jetoane, type: 'paid' }]
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        isFreeWash,
        activeStamps,
        message,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error("Eroare procesare fidelitate:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Sistemul a întâmpinat o eroare tehnică." })
    };
  }
};
