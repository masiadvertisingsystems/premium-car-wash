/**
 * Premium Car Wash - Pulse API
 * Aceasta este inima sistemului tău care rulează pe serverele Netlify.
 * Orice eroare aici oprește procesarea programărilor, deci codul trebuie să fie ultra-stabil.
 */

exports.handler = async (event, context) => {
  // Strategia 1M Euro: Implementăm întotdeauna un bloc try-catch 
  // pentru a preveni crash-ul total al funcției.
  try {
    // Definirea corectă a ID-ului aplicației pentru a evita eroarea "Unexpected identifier"
    // Folosim o valoare fallback sigură în cazul în care variabila de sistem lipsește.
    const appId = "premium-car-wash";

    // Simulăm un "puls" al sistemului
    const response = {
      status: "online",
      message: "Premium Car Wash API functionează la parametri optimi.",
      timestamp: new Date().toISOString(),
      metadata: {
        app: appId,
        version: "1.0.1",
        environment: "production"
      }
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Permitem accesul de oriunde pentru a nu bloca integrările viitoare (CORS)
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    // Dacă ceva eșuează, returnăm un mesaj de eroare curat, nu un crash de sistem.
    console.error("Eroare în funcția pulse:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: "error",
        error: "Eroare internă de server",
        details: error.message
      })
    };
  }
};
