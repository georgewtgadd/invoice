/*
  AppStorage + Auth abstraction.

  - Inside a Claude.ai artifact: uses Claude's built-in window.storage,
    tied to your Claude.ai account. No sign-in needed.
  - Everywhere else (GitHub Pages, opened locally, etc.): uses Firebase
    Authentication (email/password) + Firestore, so your data survives
    clearing browser history, moving devices, etc. Requires a one-time
    Firebase project setup — see README.md.

  Everything is stored as a single document per signed-in user:
    users/{uid}  ->  { settings_gadd, settings_tvparty, contacts, invoiceHistory }
  Each field holds a JSON *string* (not a native object), so the rest of
  the app can keep using JSON.stringify/JSON.parse exactly as before —
  this file is the only thing that knows where the data actually lives.
*/
(function(){
  "use strict";

  var STORAGE_MODE = (typeof window.storage !== 'undefined' && window.storage && typeof window.storage.get === 'function') ? 'claude' : 'firebase';

  var fb = { ready: false, auth: null, db: null, user: null };
  var docCache = null;
  var authListeners = [];

  function configIsFilledIn(){
    var c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.projectId &&
      String(c.apiKey).indexOf('YOUR_') !== 0 &&
      String(c.projectId).indexOf('YOUR_') !== 0);
  }

  function initFirebaseIfNeeded(){
    if(STORAGE_MODE !== 'firebase' || fb.ready) return fb.ready;
    if(typeof firebase === 'undefined' || !configIsFilledIn()) return false;
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      fb.auth = firebase.auth();
      fb.db = firebase.firestore();
      fb.ready = true;
      fb.auth.onAuthStateChanged(function(user){
        fb.user = user;
        docCache = null;
        authListeners.forEach(function(cb){ cb(user); });
      });
    } catch(e){
      console.error('Firebase initialization failed', e);
      fb.ready = false;
    }
    return fb.ready;
  }

  function userDocRef(){
    if(!fb.db || !fb.user) return null;
    return fb.db.collection('users').doc(fb.user.uid);
  }

  async function ensureDocCache(){
    if(docCache) return docCache;
    var ref = userDocRef();
    if(!ref){ docCache = {}; return docCache; }
    try {
      var snap = await ref.get();
      docCache = snap.exists ? (snap.data() || {}) : {};
    } catch(e){
      console.error('Firestore read failed', e);
      docCache = {};
    }
    return docCache;
  }

  var AppStorage = {
    mode: STORAGE_MODE,

    get: async function(key, shared){
      if(STORAGE_MODE === 'claude'){
        try { return await window.storage.get(key, !!shared); } catch(e){ return null; }
      }
      if(!fb.ready || !fb.user) return null;
      var data = await ensureDocCache();
      var field = key.replace(/:/g, '_');
      return (data && data[field] !== undefined) ? { key: key, value: data[field], shared: !!shared } : null;
    },

    set: async function(key, value, shared){
      if(STORAGE_MODE === 'claude'){
        try { return await window.storage.set(key, value, !!shared); } catch(e){ return null; }
      }
      if(!fb.ready || !fb.user) return null;
      var ref = userDocRef();
      if(!ref) return null;
      var field = key.replace(/:/g, '_');
      var patch = {};
      patch[field] = value;
      try {
        await ref.set(patch, { merge: true });
        var data = await ensureDocCache();
        data[field] = value;
        return { key: key, value: value, shared: !!shared };
      } catch(e){
        console.error('Firestore write failed', e);
        return null;
      }
    }
  };

  var Auth = {
    mode: STORAGE_MODE,

    isConfigured: function(){
      return STORAGE_MODE === 'claude' || configIsFilledIn();
    },

    onChange: function(cb){
      authListeners.push(cb);
      initFirebaseIfNeeded();
    },

    currentUser: function(){ return fb.user; },

    signUp: async function(email, password){
      if(!initFirebaseIfNeeded()) throw new Error('Firebase is not configured yet.');
      return fb.auth.createUserWithEmailAndPassword(email, password);
    },

    signIn: async function(email, password){
      if(!initFirebaseIfNeeded()) throw new Error('Firebase is not configured yet.');
      return fb.auth.signInWithEmailAndPassword(email, password);
    },

    resetPassword: async function(email){
      if(!initFirebaseIfNeeded()) throw new Error('Firebase is not configured yet.');
      return fb.auth.sendPasswordResetEmail(email);
    },

    signOut: async function(){
      if(fb.auth) return fb.auth.signOut();
    }
  };

  window.AppStorage = AppStorage;
  window.Auth = Auth;
})();
