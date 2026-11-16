/* Configurazione Firebase per vedere le altre barche (flotta.js).
   La copi da Firebase → Impostazioni progetto → Le tue app → app Web → "Configurazione SDK" (opzione "Config").
   Questi valori non sono segreti: identificano il progetto, la protezione dei dati la fanno le regole del database.
   Finché restano vuoti la funzione "Barche con Rotta Nautica" resta spenta e il resto dell'app funziona normalmente. */
window.RN_FIREBASE = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: ''
};
