// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyAe1OY5Hi10KI53WXhYXQ_GlyRXtw0y8_c",
    authDomain: "misaq-lims-new.firebaseapp.com",
    projectId: "misaq-lims-new",
    storageBucket: "misaq-lims-new.firebasestorage.app",
    messagingSenderId: "1043996265411",
    appId: "1:1043996265411:web:62adf2d5c1790ad45b0b76"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();