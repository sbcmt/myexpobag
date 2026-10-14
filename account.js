/** MY EXPO BAG v1.0.1 — owner-only account profile, branding and Firebase Auth settings. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged,EmailAuthProvider,reauthenticateWithCredential,verifyBeforeUpdateEmail,updatePassword,reload} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $=id=>document.getElementById(id);
const config=window.MEB_FIREBASE_CONFIG||{};
const loginUrl=new URL('./login.html',location.href).href;
const brandSetupUrl=new URL('./brand-setup.html',location.href).href;
const placeholder='<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="23" r="13"/><path d="M7 60c0-13.5 11.2-23 25-23s25 9.5 25 23z"/></svg>';
const passwordPolicy=/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@&_\-])[A-Za-z\d@&_\-]{8,}$/;
let auth,db,currentUser,brandRecord,iconValue='';
const showStatus=(id,message,kind='')=>{const node=$(id);node.textContent=message;node.className='status'+(kind?' '+kind:'');};
const validIcon=value=>value==='' || (value.length<=70000 && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
const avatar=value=>{
  const root=$('brand-avatar');root.replaceChildren();
  if(validIcon(value) && value){const img=document.createElement('img');img.src=value;img.alt='登録済みブランドアイコン';root.append(img);}
  else root.innerHTML=placeholder;
};
function explain(error){
  switch(error?.code){
    case 'permission-denied':return '保存が許可されませんでした。Firestoreのルールを更新したか確認してください。';
    case 'auth/wrong-password':case 'auth/invalid-credential':return '現在のパスワードが正しくありません。';
    case 'auth/requires-recent-login':return '再認証が必要です。ログアウト後、もう一度ログインしてください。';
    case 'auth/email-already-in-use':return 'そのメールアドレスはすでに登録されています。';
    case 'auth/invalid-email':return 'メールアドレスを確認してください。';
    case 'auth/weak-password':return '新しいパスワードが条件を満たしていません。';
    case 'auth/too-many-requests':return '試行回数が多いため、しばらく時間をおいてください。';
    case 'auth/network-request-failed':case 'unavailable':return 'ネットワーク接続を確認してください。';
    default:return '操作を完了できませんでした。入力内容とFirebaseの設定を確認してください。';
  }
}
async function compressIcon(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG・JPG・WebP形式の画像を選択してください。');
  if(file.size>1024*1024)throw new Error('元画像は1MB以下にしてください。');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('画像を読み込めませんでした。'));el.src=url;});
    let result='';
    // Small self-contained image: no Firebase Storage/Blaze required for the first release.
    for(const side of [256,224,192,160,128]){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=side;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を加工できませんでした。');
      const ratio=Math.min(side/img.naturalWidth,side/img.naturalHeight);
      const w=Math.max(1,Math.round(img.naturalWidth*ratio));
      const h=Math.max(1,Math.round(img.naturalHeight*ratio));
      ctx.clearRect(0,0,side,side);
      ctx.drawImage(img,Math.floor((side-w)/2),Math.floor((side-h)/2),w,h);
      for(const quality of [.8,.68,.56,.44]){
        result=canvas.toDataURL('image/webp',quality);
        if(validIcon(result) && result.length<=65000)return result;
      }
    }
    throw new Error('画像を十分に小さくできませんでした。別の画像をお試しください。');
  }finally{URL.revokeObjectURL(url);}
}
async function verifyOwner(user){
  const brandRef=doc(db,'brands',user.uid);
  const snap=await getDoc(brandRef);
  if(!snap.exists()){location.replace(brandSetupUrl);return;}
  const record=snap.data();
  if(record.ownerUid!==user.uid || !record.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug))throw new Error('ブランド情報に不整合があります。');
  const handle=await getDoc(doc(db,'brandHandles',record.slug));
  if(!handle.exists() || handle.data().brandId!==user.uid)throw new Error('公開ブランド情報が見つかりません。');
  brandRecord=record;iconValue=validIcon(record.logoUrl||'')?record.logoUrl:'';
  $('display-name').value=record.displayName||'';
  $('brand-slug').value=record.slug;
  await reload(user);
  $('account-email').value=user.email||'';
  avatar(iconValue);
  $('save-brand').disabled=false;
  $('loading').hidden=true;$('account-shell').hidden=false;
}
async function reauth(password){
  if(!currentUser?.email)throw new Error('ログインメールが取得できません。');
  await reauthenticateWithCredential(currentUser,EmailAuthProvider.credential(currentUser.email,password));
}
$('brand-icon-file').addEventListener('change',async()=>{
  const file=$('brand-icon-file').files?.[0];if(!file)return;
  showStatus('brand-status','画像を加工しています…');
  try{iconValue=await compressIcon(file);avatar(iconValue);showStatus('brand-status','アイコンを選択しました。「ブランド情報を保存」で反映されます。');}
  catch(error){showStatus('brand-status',error.message||'画像を読み込めませんでした。','error');}
  finally{$('brand-icon-file').value='';}
});
$('remove-icon').addEventListener('click',()=>{iconValue='';avatar('');showStatus('brand-status','画像を解除しました。「ブランド情報を保存」で反映されます。');});
$('brand-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!currentUser||!brandRecord)return;
  const displayName=$('display-name').value.trim();
  if(!displayName||[...displayName].length>100){showStatus('brand-status','ブランド名は1〜100文字で入力してください。','error');return;}
  if(!validIcon(iconValue)){showStatus('brand-status','画像が大きすぎます。別の画像を選択してください。','error');return;}
  const btn=$('save-brand');btn.disabled=true;showStatus('brand-status','ブランド情報を保存しています…');
  try{
    const batch=writeBatch(db);
    batch.update(doc(db,'brands',currentUser.uid),{displayName,logoUrl:iconValue,updatedAt:serverTimestamp()});
    batch.update(doc(db,'brandHandles',brandRecord.slug),{displayName,logoUrl:iconValue});
    await batch.commit();
    brandRecord={...brandRecord,displayName,logoUrl:iconValue};
    showStatus('brand-status','保存しました。管理画面へ戻ります。','ok');
    location.assign(new URL('./admin.html',location.href).href);
  }catch(error){showStatus('brand-status',explain(error),'error');}
  finally{btn.disabled=false;}
});
function toggle(id,button){const el=$(id);el.hidden=!el.hidden;$(button).setAttribute('aria-expanded',String(!el.hidden));}
$('toggle-email').addEventListener('click',()=>toggle('email-panel','toggle-email'));
$('toggle-password').addEventListener('click',()=>toggle('password-panel','toggle-password'));
$('email-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentUser)return;
  const newEmail=$('new-email').value.trim();
  if(newEmail.toLowerCase()===(currentUser.email||'').toLowerCase()){showStatus('email-status','現在と異なるメールアドレスを入力してください。','error');return;}
  const btn=$('save-email');btn.disabled=true;showStatus('email-status','本人確認を行っています…');
  try{
    await reauth($('email-current-password').value);
    await verifyBeforeUpdateEmail(currentUser,newEmail);
    showStatus('email-status','新しいメールアドレスへ確認メールを送信しました。メールのリンクで確定してください。','ok');
    $('email-form').reset();
  }catch(error){showStatus('email-status',explain(error),'error');}
  finally{btn.disabled=false;$('email-current-password').value='';}
});
$('password-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentUser)return;
  const next=$('new-password').value;
  if(!passwordPolicy.test(next)){showStatus('password-status','8文字以上で、英大文字・英小文字・数字・指定記号（@ & - _）をすべて含めてください。','error');return;}
  if(next!==$('confirm-password').value){showStatus('password-status','新しいパスワードが一致しません。','error');return;}
  const btn=$('save-password');btn.disabled=true;showStatus('password-status','本人確認を行っています…');
  try{
    await reauth($('password-current').value);
    await updatePassword(currentUser,next);
    $('password-form').reset();
    showStatus('password-status','パスワードを変更しました。','ok');
  }catch(error){showStatus('password-status',explain(error),'error');}
  finally{btn.disabled=false;$('password-current').value='';}
});
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim())){
  $('loading').textContent='Firebaseの接続情報を確認してください。';
}else{
  try{
    const app=getApps().length?getApp():initializeApp(config);
    auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth,async user=>{
      if(!user){location.replace(loginUrl);return;}
      currentUser=user;
      try{await verifyOwner(user);}
      catch(error){$('loading').textContent='アカウント情報を取得できません。Firestoreのルールや通信状態をご確認ください。';}
    },()=>{$('loading').textContent='ログイン状態を確認できませんでした。';});
  }catch(error){$('loading').textContent='Firebaseを読み込めませんでした。';}
}
