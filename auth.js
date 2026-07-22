// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// YOUR FIREBASE CONFIG HERE

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_BUCKET",
    messagingSenderId: "YOUR_ID",
    appId: "YOUR_APP_ID"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);


// Elements

const loginButton = document.getElementById("loginBtn");
const overlay = document.getElementById("loginOverlay");
const loginSubmit = document.getElementById("submitLogin");

const usernameBox = document.getElementById("username");
const passwordBox = document.getElementById("password");

const overwriteBox = document.getElementById("overwriteBox");



// Open login

loginButton.onclick = () => {

    if(auth.currentUser){

        signOut(auth);

        loginButton.innerHTML = "Login";

        alert("Logged out");

    }
    else {

        overlay.style.display="flex";

    }

};



// Login

loginSubmit.onclick = async ()=>{


let username=usernameBox.value;
let password=passwordBox.value;


let email=username+"@classsource.com";


try{


await signInWithEmailAndPassword(
    auth,
    email,
    password
);


overlay.style.display="none";


let user=auth.currentUser;



let cloudSave = await getDoc(
    doc(db,"users",user.uid)
);



if(cloudSave.exists()){


let overwrite = confirm(
"Would you like to overwrite your existing progress?"
);



if(overwrite){


await uploadSave();


}
else{


localStorage.setItem(
"gameSave",
JSON.stringify(cloudSave.data().save)
);


}


}



loginButton.innerHTML="Logout";

alert("Logged in");


}

catch(error){

alert("Incorrect username or password");

}


};




// Upload Save

async function uploadSave(){


let user=auth.currentUser;


let saveData =
JSON.parse(
localStorage.getItem("gameSave")
)
|| {};


await setDoc(
doc(db,"users",user.uid),
{

save:saveData,
updated:
Date.now()

}

);


}





// Autosave every 30 seconds

setInterval(()=>{


if(auth.currentUser){

uploadSave();

}


},30000);




// Save before leaving

window.addEventListener(
"beforeunload",
()=>{

if(auth.currentUser){

uploadSave();

}

});
