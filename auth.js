// ===================================================================
// Class Source — Auth + Cloud Save
// ===================================================================
// Paste your Firebase config below (from Firebase Console > Project
// Settings > General > Your apps > Web app).
// ===================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAn5mmUCbEX0AWNoLb-Ouw--7EmPoz_g2w",
  authDomain: "class-source.firebaseapp.com",
  projectId: "class-source",
  storageBucket: "class-source.firebasestorage.app",
  messagingSenderId: "644444299307",
  appId: "1:644444299307:web:d726002ce4a289baa94a6e",
  measurementId: "G-G2T9GPLKEL"
};

const EMAIL_DOMAIN = "@classsource.com";
const LOCAL_KEY = "cs_progress";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let saveTimer = null;
let manualLoginInProgress = false;

// -------------------------------------------------------------
// Local progress helpers
// -------------------------------------------------------------

function getLocalProgress() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    return {};
  }
}

function setLocalProgress(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data || {}));
}

function hasAnyProgress(data) {
  return data && Object.keys(data).length > 0;
}

// -------------------------------------------------------------
// Cloud progress helpers
// -------------------------------------------------------------

async function getCloudProgress(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data().progress || {}) : null;
}

async function setCloudProgress(uid, progress) {
  await setDoc(
    doc(db, "users", uid),
    { progress, updatedAt: Date.now() },
    { merge: true }
  );
}

function pushCloudSave() {
  if (!currentUser) return;
  clearTimeout(saveTimer);
  // debounce so rapid saves don't spam Firestore
  saveTimer = setTimeout(() => {
    setCloudProgress(currentUser.uid, getLocalProgress()).catch(console.error);
  }, 800);
}

// -------------------------------------------------------------
// Public save/load API — used by games
// -------------------------------------------------------------

window.ClassSource = {
  // Save progress for a single game. `data` can be any JSON-safe value.
  saveProgress(gameId, data) {
    const all = getLocalProgress();
    all[gameId] = data;
    setLocalProgress(all);
    pushCloudSave();
  },
  // Load progress for a single game, or null if none saved.
  loadProgress(gameId) {
    const all = getLocalProgress();
    return Object.prototype.hasOwnProperty.call(all, gameId) ? all[gameId] : null;
  },
  isLoggedIn() {
    return !!currentUser;
  }
};

// Bridge for games running inside an <iframe> (same-origin or not).
// A game can either call window.top.ClassSource directly (if same-origin)
// or postMessage({ type: "cs-save", gameId, data }) / ({ type: "cs-load", gameId })
// to the parent window, which will reply with { type: "cs-load-reply", gameId, data }.
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "cs-save" && msg.gameId) {
    window.ClassSource.saveProgress(msg.gameId, msg.data);
  }

  if (msg.type === "cs-load" && msg.gameId) {
    const data = window.ClassSource.loadProgress(msg.gameId);
    event.source.postMessage({ type: "cs-load-reply", gameId: msg.gameId, data }, "*");
  }
});

// -------------------------------------------------------------
// UI wiring
// -------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const authBtn = document.getElementById("authBtn");
  const loginOverlay = document.getElementById("loginOverlay");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginCancel = document.getElementById("loginCancel");
  const overwriteOverlay = document.getElementById("overwriteOverlay");
  const overwriteYes = document.getElementById("overwriteYes");
  const overwriteNo = document.getElementById("overwriteNo");

  function setButtonState(loggedIn) {
    authBtn.textContent = loggedIn ? "Logout" : "Login";
  }

  function openLogin() {
    loginError.textContent = "";
    loginForm.reset();
    loginOverlay.classList.add("show");
  }
  function closeLogin() {
    loginOverlay.classList.remove("show");
  }
  function openOverwrite() {
    overwriteOverlay.classList.add("show");
  }
  function closeOverwrite() {
    overwriteOverlay.classList.remove("show");
  }

  authBtn.addEventListener("click", () => {
    if (currentUser) {
      signOut(auth);
    } else {
      openLogin();
    }
  });

  loginCancel.addEventListener("click", closeLogin);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!username || !password) return;

    const email = username.includes("@") ? username : username + EMAIL_DOMAIN;

    loginError.textContent = "";
    manualLoginInProgress = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      closeLogin();
      await handlePostLogin(cred.user);
    } catch (err) {
      loginError.textContent = "Login failed. Check your username and password.";
      console.error(err);
    } finally {
      manualLoginInProgress = false;
    }
  });

  // Resolves what to do about local vs cloud progress after a manual login.
  async function handlePostLogin(user) {
    const local = getLocalProgress();
    const cloud = await getCloudProgress(user.uid);

    if (cloud === null) {
      // No cloud save yet — just upload whatever is on this device.
      await setCloudProgress(user.uid, local);
      return;
    }

    if (!hasAnyProgress(local)) {
      // Nothing to lose locally — just pull the cloud copy down.
      setLocalProgress(cloud);
      return;
    }

    // Both exist — ask the user which one should win.
    openOverwrite();

    const choice = await new Promise((resolve) => {
      overwriteYes.onclick = () => resolve("overwrite");
      overwriteNo.onclick = () => resolve("keep");
    });

    closeOverwrite();

    if (choice === "overwrite") {
      // Overwrite the existing cloud progress with this device's progress.
      await setCloudProgress(user.uid, local);
    } else {
      // Keep the existing cloud progress, load it onto this device.
      setLocalProgress(cloud);
    }
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    setButtonState(!!user);

    if (user && !manualLoginInProgress) {
      // Session restored automatically (e.g. page refresh) — no prompt,
      // just make sure this device has the latest cloud copy.
      const cloud = await getCloudProgress(user.uid);
      if (cloud !== null) setLocalProgress(cloud);
    }
  });
});
