/** MY EXPO BAG v1.0.1 — public brand bootstrap (no demo data on customer URLs). */
window.MEB_LOAD_CUSTOMER_BRAND = async function loadBrand(rawSlug) {
  const slug=String(rawSlug||'').trim();
  const fail=message=>{const error=new Error(message);error.customerMessage=message;throw error;};
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length>48) {
    fail('ブランドを指定したURLからアクセスしてください。出展ブースの商品QR、または出展者から共有されたURLをご利用ください。');
  }
  const firebase=window.MEB_FIREBASE_CONFIG||{};
  if(!firebase.apiKey||!firebase.projectId||!firebase.appId)fail('ブランド情報の接続設定が見つかりません。');
  const [{initializeApp,getApps,getApp},{getFirestore,doc,getDoc,onSnapshot}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
  ]);
  const app=getApps().length?getApp():initializeApp(firebase);
  const db=getFirestore(app);
  let handle,catalog,publishedTime=0;
  try{
    // Both reads are documents scoped to the exact URL brand slug.
    const [handleSnap,catalogSnap]=await Promise.all([
      getDoc(doc(db,'brandHandles',slug)),
      getDoc(doc(db,'publishedCatalogs',slug))
    ]);
    if(!handleSnap.exists())fail('指定されたブランドは見つかりません。URLをご確認ください。');
    handle=handleSnap.data();
    catalog=catalogSnap.exists()?catalogSnap.data():null;
    publishedTime=catalogSnap.updateTime?.toMillis?.()||0;
  }catch(error){
    if(error.customerMessage)throw error;
    fail('ブランド情報を確認できません。通信環境、またはFirestoreの公開設定をご確認ください。');
  }
  if(handle.slug!==slug || !handle.brandId)fail('ブランド情報に不整合があります。');
  // Existing brands created before public display names were enabled are
  // published on their next authenticated admin visit. Never use FIELDNOTE.
  // Live publication notice for an already-open standalone home-screen app.
  // Checkout QR and registration inputs are never force-dismissed.
  try{
    onSnapshot(doc(db,'publishedCatalogs',slug),snapshot=>{
      if(snapshot.metadata.fromCache)return;
      const next=snapshot.updateTime?.toMillis?.()||0;
      if(next!==publishedTime){
        publishedTime=next;
        if(typeof window.MEB_CATALOG_REFRESH==='function')window.MEB_CATALOG_REFRESH();
        else window.MEB_CATALOG_REFRESH_PENDING=true;
      }
    },error=>console.warn('商品更新の購読に失敗',error));
  }catch(error){console.warn('商品更新の確認に失敗',error);}
  const name=typeof handle.displayName==='string'&&handle.displayName.trim()?handle.displayName.trim():'ブランド公開準備中';
  // Published catalog is a deliberate public snapshot. Private drafts and
  // the demo FIELDNOTE catalog are never used as fallback.
  const products=Array.isArray(catalog?.products)?catalog.products.filter(p=>
    p && typeof p.id==='string' && typeof p.name==='string' &&
    typeof p.price==='number' && Number.isFinite(p.price) && p.price>=0 &&
    typeof p.categoryId==='string'
  ).map(p=>({...p,image:'./assets/product-placeholder.svg',
    variants:Array.isArray(p.variants)?p.variants:[]})):[];
  const allowedImages=new Set(Array.isArray(catalog?.publishedImageIds)?catalog.publishedImageIds:[]);
  const imagePromises=new Map();
  window.MEB_LOAD_PUBLIC_IMAGE=(productId)=>{
    if(!allowedImages.has(productId))return Promise.resolve('');
    if(!imagePromises.has(productId)){
      const promise=getDoc(doc(db,'publishedCatalogs',slug,'images',productId))
        .then(s=>{
          const data=s.exists()?s.data().imageData:'';
          return typeof data==='string' && data.length<=109200 &&
            /^data:image\/(?:jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)?data:'';
        }).catch(error=>{console.warn('商品画像の読み込みに失敗',productId,error);return '';});
      imagePromises.set(productId,promise);
    }
    return imagePromises.get(productId);
  };
  // Only the holder of a high-entropy purchase QR can look up the exact
  // order's public acknowledgement. No customer PII or purchased item list is published.
  // Firestore rules forbid listing orders and allow only exact document reads.
  window.MEB_WATCH_ORDER_CONFIRMATION=(orderId,notify,onError)=>{
    if(!/^DEMO-[A-F0-9]{20}$/.test(String(orderId||'')))return ()=>{};
    return onSnapshot(doc(db,'publicOrderConfirmations',slug,'orders',orderId),snapshot=>{
      if(!snapshot.exists())return;
      const data=snapshot.data();
      if(data.slug===slug && data.orderId===orderId && ['confirmed','cancelled'].includes(data.status))notify(data);
    },error=>{
      console.warn('購入確認の同期に失敗しました',error);
      if(typeof onError==='function')onError(error);
    });
  };
  // Subscribe to the tiny live stock document, not every product separately.
  window.MEB_WATCH_PUBLIC_STOCK=(notify)=>onSnapshot(doc(db,'publishedStock',slug),snap=>{
    if(!snap.exists() || snap.metadata.fromCache)return;
    const quantities=snap.data().quantities||{};
    const variantQuantities=snap.data().variantQuantities||{};
    if(quantities && typeof quantities==='object' && !Array.isArray(quantities)) notify({quantities,variantQuantities});
  },error=>console.warn('在庫同期に失敗しました。',error));
  const categories=Array.isArray(catalog?.categories)?catalog.categories:[];
  const bundles=Array.isArray(catalog?.bundles)?catalog.bundles:[];
  // Do not use demo discounts/novelties from config.js. No published settings = no promo.
  const event=catalog?.event && typeof catalog.event==='object'?catalog.event:{};
  const novelty=catalog?.novelty && typeof catalog.novelty==='object'?catalog.novelty:{};
  const brandTheme=catalog?.theme && typeof catalog.theme==='object'?catalog.theme:{};
  const productIds=new Set(products.map(p=>p.id));
  const safeBanner=event.banner?.enabled && productIds.has(event.banner?.productId)?event.banner:null;
  return {
    version:'1.0.1',
    brand:{id:slug,name,description:'',logoUrl:typeof handle.logoUrl==='string'?handle.logoUrl:'',
      themePreset:typeof brandTheme.preset==='string'?brandTheme.preset:'natural',
      customColors:brandTheme.customColors||{}},
    event:{id:slug,name:typeof handle.eventName==='string'?handle.eventName.trim():'',accentLabel:'MY EXPO BAG',appPurchaseDiscountPercent:
      Number.isFinite(Number(event.appPurchaseDiscountPercent))?Number(event.appPurchaseDiscountPercent):0,
      banner:safeBanner||{enabled:false}},
    categories,products,bundles,
    novelty:{enabled:novelty.enabled===true,name:novelty.name||'',minSpend:Number(novelty.minSpend)||0,note:novelty.note||''},
    line:{enabled:false}
  };
};
