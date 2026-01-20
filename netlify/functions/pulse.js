const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, increment, arrayUnion, getDoc, setDoc } = require('firebase/firestore');

/**
 * MASI PWS - Receptor Impuls Serverless
 * Această funcție rulează în infrastructura Netlify și acționează ca un releu digital.
 * Primește semnalul de la Shelly Uni Plus și securizează datele în Firebase.
 */

const firebaseConfig = {
  // ATENȚIE: Completează aceste date din consola ta Firebase (Settings -> Project Settings)
  apiKey: "AIzaSyDlzoN9-l_Gvk3ZV2sERlRNQux5QdoSYi4", 
  authDomain: "premium-car-wash.firebaseapp.com",
  projectId: "premium-car-wash",
  storageBucket: "premium-car-wash.appspot.com",
  messagingSenderId: "SENDER_ID_AICI",a
  appId: "1:1066804021666:web:9494cf947ea14502758afb"
};

// Inițializare Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  // Parametrii trimiși de Shelly prin Webhook: ?plate=OT22MAS&washId=DRAGANESTI_01
  const plate = (event.queryStringParameters.plate || 'ANONIM').toUpperCase();
  const washId = event.queryStringParameters.washId || 'LOCATIE_TEST';

  console.log(`Impuls primit pentru: ${plate} la locația ${washId}`);

  try {
    // Calea de acces MASI PWS Global - Documentul clientului bazat pe numărul de înmatriculare
    const customerRef = doc(db, 'artifacts', 'masi-pws-global', 'public', 'data', 'customers', plate);
    
    const docSnap = await getDoc(customerRef);

    if (!docSnap.exists()) {
      // CLIENT NOU: Creăm profilul și înregistrăm prima vizită
      await setDoc(customerRef, {
        plate: plate,
        visits: 1,
        lastVisit: new Date().toISOString(),
        history: [{ 
          timestamp: new Date().toISOString(), 
          location: washId,
          type: 'automatic_pulse'
        }],
        status: 'active'
      });
    } else {
      // CLIENT EXISTENT: Incrementăm numărul de vizite
      await updateDoc(customerRef, {
        visits: increment(1),
        lastVisit: new Date().toISOString(),
        history: arrayUnion({
          timestamp: new Date().toISOString(),
          location: washId,
          type: 'automatic_pulse'
        })
      });
    }

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" // Permitem accesul cross-origin
      },
      body: JSON.stringify({ 
        status: "success", 
        message: `Stampila MASI adaugata pentru ${plate}` 
      }),
    };
  } catch (error) {
    console.error("Eroare Critică Firebase:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        status: "error", 
        error: "Eroare la procesarea impulsului digital" 
      }),
    };
  }
};