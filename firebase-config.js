// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBipUhbJpinTshZt7JRdPDyjVZ2s-RYnbs",
  authDomain: "rotta-nautica.firebaseapp.com",
  databaseURL: "https://rotta-nautica-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "rotta-nautica",
  storageBucket: "rotta-nautica.firebasestorage.app",
  messagingSenderId: "30930294461",
  appId: "1:30930294461:web:fd415f1a5896016e0d49d4",
  measurementId: "G-DTCZ9CKDRF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
