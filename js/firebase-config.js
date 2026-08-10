// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBXq5mfaCSx_o--I1F86vTPtWKxRNarE3s",
  authDomain: "invoices-62e85.firebaseapp.com",
  projectId: "invoices-62e85",
  storageBucket: "invoices-62e85.firebasestorage.app",
  messagingSenderId: "906565797331",
  appId: "1:906565797331:web:fc6de8c98de23453e35b26",
  measurementId: "G-8MCLWCGV0E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
