/** MY EXPO BAG v1.0.1 — Admin auth guard when Firebase is configured. */
const config=window.MEB_FIREBASE_CONFIG||{};
const configured=['apiKey','authDomain','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim().length>0);
if(!configured){
  location.replace(new URL('./login.html',location.href).href);
}else{
  try {
  const [{initializeApp,getApps,getApp},{getAuth,onAuthStateChanged,signOut}] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')
  ]);
  // The admin document contains no protected customer data. Firestore rules must
  // enforce signed-in user + brand membership independently of this UI guard.
  const app=getApps().length?getApp():initializeApp(config);
  const auth=getAuth(app);
  const logout=document.getElementById('logout-btn');
  const loginUrl=()=>{
    const url=new URL('./login.html',location.href);
    const brand=new URLSearchParams(location.search).get('brand');
    if(brand && /^[a-z0-9-]{1,48}$/.test(brand))url.searchParams.set('brand',brand);
    return url.href;
  };
  onAuthStateChanged(auth,user=>{
    if(!user){location.replace(loginUrl());return;}
    document.documentElement.classList.remove('auth-pending');
    logout.hidden=false;
  },()=>{location.replace(loginUrl());});
  logout.addEventListener('click',async()=>{
    logout.disabled=true;
    try{await signOut(auth);location.replace(loginUrl());}
    catch(e){logout.disabled=false;alert('ログアウトできませんでした。通信状態をご確認ください。');}
  });
  }catch(e){location.replace(new URL('./login.html',location.href).href);}
}
