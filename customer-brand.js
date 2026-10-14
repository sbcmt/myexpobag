/** MY EXPO BAG v1.0.1 — public brand bootstrap (no demo data on customer URLs). */
window.MEB_LOAD_CUSTOMER_BRAND = async function loadBrand(rawSlug) {
  const slug=String(rawSlug||'').trim();
  const fail=message=>{const error=new Error(message);error.customerMessage=message;throw error;};
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length>48) {
    fail('ブランドを指定したURLからアクセスしてください。出展ブースの商品QR、または出展者から共有されたURLをご利用ください。');
  }
  const firebase=window.MEB_FIREBASE_CONFIG||{};
  if(!firebase.apiKey||!firebase.projectId||!firebase.appId)fail('ブランド情報の接続設定が見つかりません。');
  const [{initializeApp,getApps,getApp},{getFirestore,doc,getDoc}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
  ]);
  const app=getApps().length?getApp():initializeApp(firebase);
  const db=getFirestore(app);
  let handle,catalog;
  try{
    // Both reads are documents scoped to the exact URL brand slug.
    const [handleSnap,catalogSnap]=await Promise.all([
      getDoc(doc(db,'brandHandles',slug)),
      getDoc(doc(db,'publishedCatalogs',slug))
    ]);
    if(!handleSnap.exists())fail('指定されたブランドは見つかりません。URLをご確認ください。');
    handle=handleSnap.data();
    catalog=catalogSnap.exists()?catalogSnap.data():null;
  }catch(error){
    if(error.customerMessage)throw error;
    fail('ブランド情報を確認できません。通信環境、またはFirestoreの公開設定をご確認ください。');
  }
  if(handle.slug!==slug || !handle.brandId)fail('ブランド情報に不整合があります。');
  // Existing brands created before public display names were enabled are
  // published on their next authenticated admin visit. Never use FIELDNOTE.
  const name=typeof handle.displayName==='string'&&handle.displayName.trim()?handle.displayName.trim():'ブランド公開準備中';
  const products=Array.isArray(catalog?.products)?catalog.products.filter(p=>
    p && typeof p.id==='string' && typeof p.name==='string' && typeof p.price==='number' && p.price>=0
  ):[];
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
