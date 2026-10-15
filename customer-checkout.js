/** Private checkout intake. No PII in public catalog / QR / confirmations. v1.0.1 */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const cfg=window.MEB_FIREBASE_CONFIG||{};
const app=getApps().length?getApp():initializeApp(cfg);
const auth=getAuth(app),db=getFirestore(app);
window.MEB_SAVE_PRIVATE_CHECKOUT=async function(payload){
 if(!auth.currentUser)await signInAnonymously(auth);
 if(!auth.currentUser)throw Error('購入情報を保護して保存するための認証ができません。');
 const slug=payload.slug,orderId=payload.orderId;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!/^DEMO-[A-F0-9]{20}$/.test(orderId))throw Error('注文番号が正しくありません。');
 const data={...payload,creatorUid:auth.currentUser.uid,createdAt:serverTimestamp()};
 await setDoc(doc(db,'customerOrders',slug,'orders',orderId),data);
 return true;
};
