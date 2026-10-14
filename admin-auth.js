/** MY EXPO BAG v1.0.1 — Firebase auth + brand-bound admin page. */
const config=window.MEB_FIREBASE_CONFIG||{};
const configured=['apiKey','authDomain','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim().length>0);
const loginUrl=new URL('./login.html',location.href).href;
const brandSetupUrl=new URL('./brand-setup.html',location.href).href;
if(!configured){location.replace(loginUrl)}else{
  try{
    const [{initializeApp,getApps,getApp},{getAuth,onAuthStateChanged,signOut},{getFirestore,getDoc,doc,updateDoc}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
    ]);
    const app=getApps().length?getApp():initializeApp(config);
    const auth=getAuth(app),db=getFirestore(app);
    const logout=document.getElementById('logout-btn');
    onAuthStateChanged(auth,async user=>{
      if(!user){location.replace(loginUrl);return;}
      try{
        const snapshot=await getDoc(doc(db,'brands',user.uid));
        if(!snapshot.exists()){location.replace(brandSetupUrl);return;}
        const brand=snapshot.data();
        // Publish ONLY the non-sensitive brand name/logo for public customer pages.
        // For existing brands, this upgrades the earlier slug-only document.
        // Brand/owner identity stays immutable and is validated by Firestore rules.
        if(brand.slug){
          await updateDoc(doc(db,'brandHandles',brand.slug),{
            displayName:brand.displayName,logoUrl:brand.logoUrl||''
          });
        }
        const link=new URL('./index.html',location.href);
        link.searchParams.set('brand',brand.slug);
        document.getElementById('customer-page-link').href=link.href;
        document.getElementById('current-brand-name').textContent=brand.displayName;
        document.documentElement.classList.remove('auth-pending');
        logout.hidden=false;
      }catch(error){
        // Do not reveal the admin UI when a verified brand assignment cannot be read.
        const next=new URL(brandSetupUrl);
        next.searchParams.set('error','firestore');
        location.replace(next.href);
      }
    },()=>location.replace(loginUrl));
    logout.addEventListener('click',async()=>{
      logout.disabled=true;
      try{await signOut(auth);location.replace(loginUrl);}
      catch(e){logout.disabled=false;alert('ログアウトできませんでした。通信状態をご確認ください。');}
    });
  }catch(e){location.replace(loginUrl);}
}
