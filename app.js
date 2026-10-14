/** MY EXPO BAG — Customer experience v1.0.1 (demo / no order backend yet) */
(() => {
  'use strict';
  const cfg = window.MEB_CONFIG;
  if (!cfg) { document.body.textContent = '設定ファイルを読み込めませんでした。'; return; }
  const COLORS = {
    natural:   { main:'#315746', sub:'#F2EEE6', text:'#26372F' },
    monotone:  { main:'#20252B', sub:'#EEF0F2', text:'#22262A' },
    urban:     { main:'#284D87', sub:'#EEF3FA', text:'#1C2D42' },
    soft:      { main:'#A04C67', sub:'#FAF0F3', text:'#432D37' },
    active:    { main:'#A9472B', sub:'#FFF2E2', text:'#3C2E25' },
  };
  const ICONS = {
    bag: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    left:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    right:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    plus:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    close:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };
  const $ = sel => document.querySelector(sel);
  const byId = id => cfg.products.find(p => p.id === id);
  const yen = n => '¥' + Math.max(0,Math.round(n)).toLocaleString('ja-JP');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fileSafe = value => /^(\.\/|\/|https:\/\/)[\w.%/?=&#:+-]+$/i.test(value||'') ? value : '';
  const unitPrice = p => Number.isFinite(p.eventPrice) && p.eventPrice >= 0 && p.eventPrice < p.price ? p.eventPrice : p.price;
  const cartKey = `meb-cart-${cfg.version}-${cfg.brand.id}-${cfg.event.id}`;
  const state = { category:'all', cart:{}, order:null, modalOpen:false, previewTheme:null, toastTimer:null };
  const activeBuild = window.MEB_CURRENT_BUILD || '20261014-recommend-refresh-01';
  let lastReleaseCheck = Date.now();
  let releaseCheckBusy = false;
  let pendingReleaseBuild = '';
  const releaseCheckIntervalMs = 45_000;

  const ensureCart = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(cartKey) || '{}');
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [id,qty] of Object.entries(raw)) if(byId(id) && Number.isInteger(qty) && qty > 0 && qty <= 20) state.cart[id] = qty;
      }
    } catch { /* private browsing / blocked storage: session-only bag */ }
  };
  const saveCart = () => { try { localStorage.setItem(cartKey, JSON.stringify(state.cart)); } catch { /* keep in memory */ } };
  const itemCount = () => Object.values(state.cart).reduce((n,q) => n+q,0);
  const colorIsLight = hex => {
    const v = hex.replace('#',''); if(!/^[0-9a-f]{6}$/i.test(v)) return false;
    const rgb = [0,2,4].map(i => parseInt(v.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return (.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])>.38;
  };
  const applyTheme = () => {
    const defaultTheme = COLORS[state.previewTheme||cfg.brand.themePreset] || COLORS.natural;
    const custom = state.previewTheme ? {} : (cfg.brand.customColors || {});
    const palette = { main:custom.main||defaultTheme.main,sub:custom.sub||defaultTheme.sub,text:custom.text||defaultTheme.text };
    if(![palette.main,palette.sub,palette.text].every(s => /^#[0-9a-fA-F]{6}$/.test(s))) return;
    const root = document.documentElement;
    root.style.setProperty('--main',palette.main);root.style.setProperty('--sub',palette.sub);root.style.setProperty('--ink',palette.text);
    root.style.setProperty('--on-main',colorIsLight(palette.main)?'#18231C':'#FFFFFF');
    root.style.setProperty('--badger', palette.sub);
    $('meta[name="theme-color"]').content=palette.main;
  };
  const totalCalc = () => {
    const listSubtotal = cfg.products.reduce((sum,p)=>sum+(state.cart[p.id]||0)*p.price,0);
    const eventSubtotal = cfg.products.reduce((sum,p)=>sum+(state.cart[p.id]||0)*unitPrice(p),0);
    const remaining = {...state.cart};
    // Maximize savings across the exhibitor's at most three bundles; never reuse an item quantity.
    const bundles = (cfg.bundles||[]).slice(0,3).filter(b => b.productIds.length>=2 && b.productIds.every(byId) && b.discountPercent>0);
    let best = { saving:0, details:[] };
    function search(index, saving, details) {
      if(index===bundles.length){if(saving>best.saving) best={saving,details:[...details]}; return;}
      const bundle=bundles[index];
      const required={};for(const id of bundle.productIds) required[id]=(required[id]||0)+1;
      const qtyMax=Math.min(20,...Object.entries(required).map(([id,q])=>Math.floor((remaining[id]||0)/q)));
      const unitBase=bundle.productIds.reduce((n,id)=>n+unitPrice(byId(id)),0);
      const savingsEach=Math.round(unitBase * Math.min(100,Math.max(0,bundle.discountPercent))/100);
      for(let quantity=0;quantity<=qtyMax;quantity++){
        if(quantity) for(const [id,q] of Object.entries(required)) remaining[id]-=q;
        search(index+1,saving+quantity*savingsEach,quantity?[...details,{name:bundle.name,count:quantity,saving:quantity*savingsEach}]:details);
      }
      for(const [id,q] of Object.entries(required)) remaining[id]=(remaining[id]||0)+q*qtyMax;
    }
    search(0,0,[]);
    return { listSubtotal,eventSubtotal,eventSaving:listSubtotal-eventSubtotal,bundleSaving:best.saving,bundles:best.details,total:Math.max(0,eventSubtotal-best.saving) };
  };
  const cardProduct = p => `
    <article class="product-card">
      <button class="product-cover" data-open-product="${esc(p.id)}" aria-label="${esc(p.name)}の詳細を見る">
        ${p.tag?`<span class="product-tag">${esc(p.tag)}</span>`:''}
        <img src="${esc(fileSafe(p.image))}" alt="${esc(p.name)}" loading="lazy"/>
      </button>
      <div class="product-info">
        <div class="product-subtitle">${esc(p.subtitle||'')}</div>
        <h3 class="product-name">${esc(p.name)}</h3>
        <div class="price-line"><div>
          ${unitPrice(p)<p.price?`<span class="price-original">${yen(p.price)}</span>`:''}
          <div class="price-current">${yen(unitPrice(p))}</div>
        </div><button class="add-small" data-add="${esc(p.id)}" aria-label="${esc(p.name)}をBAGに追加">${ICONS.plus}</button></div>
        ${unitPrice(p)<p.price?'<div class="price-extra">EXPO SPECIAL PRICE</div>':''}
      </div>
    </article>`;
  const nav = target => { if(location.hash!==target) location.hash=target; else render(); window.scrollTo({top:0,behavior:'instant'}); };
  const renderHeader = () => {
    const icon = cfg.brand.logoUrl && fileSafe(cfg.brand.logoUrl) ? `<img src="${esc(fileSafe(cfg.brand.logoUrl))}" alt=""/>` : esc(cfg.brand.name.trim().slice(0,1)||'B');
    $('#site-header').innerHTML=`<div class="header-inner"><div class="brand-left"><div class="brand-icon">${icon}</div><div style="min-width:0"><div class="brand-wordmark">${esc(cfg.brand.name)}</div><div class="brand-caption">${esc(cfg.event.name)}</div></div></div><button class="header-action" data-nav="#bag" aria-label="MY BAGを開く" style="position:relative">${ICONS.bag}${itemCount()?`<span class="header-count">${itemCount()}</span>`:''}</button></div>`;
  };
  const renderPreview = () => {
    const q=new URLSearchParams(location.search);if(q.get('preview')!=='1') return '';
    return `<div class="section-pad" style="margin-top:8px"><div style="background:#f7f8f5;padding:12px;border-radius:11px"><div style="font-size:10px;color:#778578;margin-bottom:9px">出展者設定用：カラープレビュー（来場者には非表示）</div><div style="display:flex;flex-wrap:wrap;gap:6px">${Object.keys(COLORS).map(k=>`<button type="button" class="chip ${state.previewTheme===k?'active':''}" data-theme="${k}">${k}</button>`).join('')}</div></div></div>`;
  };
  const renderHome = () => {
    const banner=cfg.event.banner;
    const items=cfg.products.filter(p => state.category==='all'||p.categoryId===state.category);
    const categories = [{id:'all',name:'すべて'},...cfg.categories];
    $('#view').innerHTML=`
      <section class="intro"><div class="eyebrow">${esc(cfg.event.accentLabel)}</div><h1 class="intro-title">見つけた「好き」を、<br/>ひとつのBAGに。</h1><p class="intro-description">${esc(cfg.brand.description)}<br/>気になるアイテムを選んで、会場で受け取ろう。</p></section>
      ${banner&&banner.enabled?`<a class="hero-banner" href="#product/${encodeURIComponent(banner.productId)}" aria-label="${esc(banner.title)}"><div class="hero-bg"></div>${banner.imageUrl&&fileSafe(banner.imageUrl)?`<img class="hero-product-image" src="${esc(fileSafe(banner.imageUrl))}" alt=""/>`:'<div class="hero-art"></div>'}<div class="hero-copy"><div style="font-size:10px;letter-spacing:1.5px;font-weight:800">${esc(banner.eyebrow)}</div><h2>${esc(banner.title)}</h2><p>${esc(banner.body||'')}</p><span class="hero-more">詳しく見る &nbsp;→</span></div></a>`:''}
      ${renderPreview()}
      <section><div class="section-pad section-heading"><div><span class="eyebrow">CURATED COLLECTION</span><h2 class="section-title">ITEMS<span style="font-size:13px;color:#bdc5bd"> .</span></h2></div><span class="section-meta">${items.length} ITEMS</span></div>
      <div class="chips" role="group" aria-label="商品カテゴリ">${categories.map(c=>`<button class="chip ${state.category===c.id?'active':''}" data-category="${esc(c.id)}" aria-pressed="${state.category===c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div class="section-pad"><div class="product-grid">${items.length?items.map(cardProduct).join(''):'<p>該当する商品がありません。</p>'}</div></div></section>
      ${cfg.novelty.enabled?`<aside class="gift-info"><div class="gift-icon" aria-hidden="true">✦</div><div><div class="gift-text">${yen(cfg.novelty.minSpend)}以上のご購入でノベルティ対象</div><div class="gift-small">${esc(cfg.novelty.name)}をご用意。${esc(cfg.novelty.note)}</div></div></aside>`:''}
      <div class="float-space"></div>`;
  };
  // Only suggest sets that actually include the open product. The comparison baseline
  // is the sum of prices when bought separately at this event (including EXPO prices).
  // A recommended pair is useful even without an additional set discount.
  // Missing, empty or null discountPercent means 0%; never manufacture a discount.
  const bundleRate = b => b.discountPercent == null || b.discountPercent === '' ? 0 : Number(b.discountPercent);
  const eligibleBundles = productId => (cfg.bundles||[]).slice(0,3).filter(b =>
    Array.isArray(b.productIds) && b.productIds.length >= 2 &&
    b.productIds.includes(productId) && b.productIds.every(byId) &&
    Number.isFinite(bundleRate(b)) && bundleRate(b) >= 0 && bundleRate(b) <= 100
  );
  const bundleRequired = b => {
    const req={};b.productIds.forEach(id=>{req[id]=(req[id]||0)+1;});return req;
  };
  const bundleNeed = b => Object.entries(bundleRequired(b)).filter(([id,qty]) => (state.cart[id]||0) < qty);
  const renderRecommendation = (b,p) => {
    const products=b.productIds.map(byId);
    const individualTotal=products.reduce((sum,item)=>sum+unitPrice(item),0);
    const discountPercent=bundleRate(b);
    const saving=Math.round(individualTotal*discountPercent/100);
    const discounted=saving>0;
    const setPrice=individualTotal-saving;
    const missing=bundleNeed(b);
    const allInBag=missing.length===0;
    const buttonText=allInBag?'MY BAGで合計を確認':
      (missing.length < Object.keys(bundleRequired(b)).length?'足りない商品をBAGに追加':'この組み合わせをBAGに追加');
    return `<article class="recommend-card" aria-label="${esc(b.name)} の組み合わせ提案">
      <div class="recommend-topline"><span class="recommend-badge">${discounted?'まとめ買いでお得':'おすすめの組み合わせ'}</span><span class="recommend-title">${esc(b.name)}</span></div>
      <div class="recommend-products">${products.map((item,index)=>`${index?'<span class="recommend-plus" aria-hidden="true">＋</span>':''}<div class="recommend-item"><div class="recommend-thumb"><img src="${esc(fileSafe(item.image))}" alt="" loading="lazy"/></div><span class="recommend-item-name">${esc(item.name)}</span></div>`).join('')}</div>
      ${discounted ? `<div class="recommend-comparison"><span>別々に買うと <s>${yen(individualTotal)}</s></span><span class="recommend-arrow" aria-hidden="true">→</span><strong>セット価格 ${yen(setPrice)}</strong></div>
      <div class="recommend-savings"><span class="recommend-savings-label">別々に買うより</span><strong>${yen(saving)} お得！</strong></div>` : `<div class="recommend-comparison recommend-comparison-regular"><span>${products.length}点で合計</span><strong>${yen(individualTotal)}</strong></div>`}
      <p class="recommend-note">${esc(b.subtitle||'')}<br/>${discounted?'展示会限定価格がある商品は、その価格を基準に計算しています。':'各商品の展示会限定価格がある場合は、その価格で合計しています。セット追加割引はありません。'}</p>
      ${allInBag?`<button class="recommend-button" data-nav="#bag">${buttonText} →</button>`:`<button class="recommend-button" data-add-bundle="${esc(b.id)}">${buttonText} ＋</button>`}
    </article>`;
  };
  const renderDetail=p=>{
    const suggestions=eligibleBundles(p.id).map(b=>renderRecommendation(b,p)).filter(Boolean).join('');
    $('#view').innerHTML=`<div class="page-body"><button class="back-button" data-nav="#home">${ICONS.left} 商品一覧に戻る</button>
      <div class="detail-cover"><img src="${esc(fileSafe(p.image))}" alt="${esc(p.name)}"/></div><div class="detail-en">${esc(p.subtitle)}</div><h1 class="detail-name">${esc(p.name)}</h1><div class="detail-price">${unitPrice(p)<p.price?`<span class="detail-original">${yen(p.price)}</span>`:''}${yen(unitPrice(p))} <span style="font-size:11px;font-weight:500">税込</span></div>
      ${unitPrice(p)<p.price?'<div class="price-extra">展示会限定価格</div>':''}<p class="detail-description">${esc(p.description||'')}</p>
      <button class="primary-btn" data-add="${esc(p.id)}" data-go-bag="true">＋　MY BAGに追加する</button>
      ${suggestions?`<section class="recommendations" aria-label="おすすめの組み合わせ"><div class="recommend-section-header"><span class="eyebrow">BETTER TOGETHER</span><h2>この商品と一緒にいかがですか？</h2><p>一緒に使いたいアイテムを、組み合わせてご紹介します。</p></div><div class="recommend-list">${suggestions}</div></section>`:''}
      <div class="notice">気になる商品をBAGに追加して、まとめて購入QRを表示できます。代金のお支払いは出展者ブースで行います。</div></div>`;
  };
  const renderBag=()=>{
    const totals=totalCalc();
    const itemRows=cfg.products.filter(p=>state.cart[p.id]).map(p=>`<div class="cart-item"><div class="cart-thumbnail"><img src="${esc(fileSafe(p.image))}" alt=""/></div><div class="cart-main"><div class="cart-title">${esc(p.name)}</div><div class="cart-english">${esc(p.subtitle||'')}</div><div class="cart-amount">${yen(unitPrice(p)*(state.cart[p.id]||0))}</div><div class="qty-row"><button class="remove-btn" data-remove="${esc(p.id)}">削除</button><button class="qty-btn" data-qty="${esc(p.id)}" data-step="-1" aria-label="${esc(p.name)}を1つ減らす">−</button><span class="qty-value">${state.cart[p.id]}</span><button class="qty-btn" data-qty="${esc(p.id)}" data-step="1" aria-label="${esc(p.name)}を1つ増やす">+</button></div></div></div>`).join('');
    $('#view').innerHTML=`<div class="page-body"><button class="back-button" data-nav="#home">${ICONS.left} 商品一覧に戻る</button><h1 class="page-title">MY BAG<span style="color:var(--main)">.</span></h1><p class="page-subtitle">選んだ商品とお支払い金額をご確認ください。</p>
      ${itemCount()?`${itemRows}<section class="order-box"><h2 class="order-heading">ご注文内容</h2>
      <div class="order-row"><span class="order-label">通常価格 合計</span><strong>${yen(totals.listSubtotal)}</strong></div>
      ${totals.eventSaving>0?`<div class="order-row"><span class="order-label">展示会限定価格による割引</span><span class="order-positive">−${yen(totals.eventSaving)}</span></div>`:''}
      ${totals.bundles.map(b=>`<div class="order-row"><span class="order-label">セット割引：${esc(b.name)} × ${b.count}</span><span class="order-positive">−${yen(b.saving)}</span></div>`).join('')}
      <div class="order-total"><span>お支払い予定額</span><strong>${yen(totals.total)}</strong></div><div class="tiny-text" style="text-align:right;margin-top:5px">税込・お支払いは会場で</div></section>
      ${cfg.novelty.enabled?`<div class="gift-eligible"><strong>✦ ${totals.total>=cfg.novelty.minSpend?'ノベルティ対象です':'ノベルティ特典'}</strong><p>${totals.total>=cfg.novelty.minSpend?esc(cfg.novelty.name)+'の交換対象となります。':'あと'+yen(cfg.novelty.minSpend-totals.total)+'のお買い物で特典の対象に。'} ${esc(cfg.novelty.note)}</p></div>`:''}
      <div class="purchase-action"><button class="primary-btn" data-checkout>購入QRを開く　→</button><p class="helptext">初回はお名前とメールアドレスの登録が必要です。<br/>このデモでは実際の注文は送信されません。</p></div>`:
      `<div class="empty-cart"><span class="empty-cart-emoji">▢</span><h2>MY BAGは空です</h2><p>気になった商品をBAGに追加しましょう。<br/>ここでまとめて注文QRを開けます。</p><button class="outline-btn" data-nav="#home">商品を探す　→</button></div>`}</div>`;
  };
  const renderQr=()=>{
    if(!state.order){$('#view').innerHTML=`<div class="page-body"><h1 class="page-title">注文QR</h1><p class="page-subtitle">このQRはページを閉じると再表示できません。<br/>MY BAGから再度発行してください。</p><button class="primary-btn" data-nav="#bag">MY BAGを見る</button></div>`;return;}
    const order=state.order;
    $('#view').innerHTML=`<div class="page-body qr-page"><button class="back-button" data-nav="#bag" style="display:flex">${ICONS.left} MY BAGに戻る</button><div class="eyebrow">CHECKOUT QR</div><h1 class="page-title" style="margin-top:9px">購入QR</h1><p class="page-subtitle">この画面を出展者スタッフに見せてください。</p>
      <section class="qr-card"><div class="qr-status">動作確認用 QR</div><div class="qr-canvas-wrap"><canvas id="order-qr" width="300" height="300" role="img" aria-label="購入QRコード"></canvas></div><div class="qr-order-id">${esc(order.id)}</div><div class="qr-instructions">スタッフにQRを見せて<br/>会計・ノベルティ交換を行います。</div></section>
      <div style="margin-top:18px"><div class="qr-data-row"><span>ご注文点数</span><strong>${order.count}点</strong></div><div class="qr-data-row"><span>お支払い予定額</span><strong>${yen(order.total)}</strong></div>${order.gift?`<div class="qr-data-row"><span>ノベルティ</span><strong>${esc(cfg.novelty.name)} 対象</strong></div>`:''}</div>
      <div class="demo-alert"><strong>現在はデモ機能です。</strong><br/>QRには注文識別子だけが入り、氏名・メール・金額は含まれません。まだサーバーへの注文登録と出展者端末での照会はできません。実販売には使用しないでください。</div>
      <button class="outline-btn" data-nav="#home">商品一覧に戻る</button></div>`;
    try{
      const code=new window.QRCodeCore(0,window.QRErrorCorrectLevel.M);code.addData('MEB-DEMO:'+order.id);code.make();
      const canvas=$('#order-qr'),ctx=canvas.getContext('2d');const count=code.getModuleCount();const quiet=4;const size=canvas.width;const cell=Math.floor(size/(count+quiet*2));const offset=Math.floor((size-cell*(count+quiet*2))/2);
      ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#111';
      for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(code.isDark(r,c))ctx.fillRect(offset+(c+quiet)*cell,offset+(r+quiet)*cell,cell,cell);
    }catch(error){console.error('QR生成エラー',error);$('.qr-canvas-wrap').innerHTML='<p>QRを生成できませんでした。</p>';}
  };
  const renderFloating=page=>{
    const el=$('#floating-bag');const count=itemCount();if(page!=='home' && page!=='detail'||count<1){el.hidden=true;el.innerHTML='';return;}
    el.hidden=false;el.innerHTML=`<button class="floating-bag" data-nav="#bag"><span class="floating-left">${ICONS.bag} MY BAGを見る <span class="bag-pill">${count}</span></span><span class="floating-price">${yen(totalCalc().total)}　→</span></button>`;
  };
  function render(){
    applyTheme();renderHeader();
    const hash=decodeURIComponent(location.hash.replace(/^#/,''));
    let page='home';
    if(hash==='bag')page='bag';else if(hash==='qr')page='qr';else if(hash.startsWith('product/'))page='detail';
    if(page==='bag')renderBag();else if(page==='qr')renderQr();else if(page==='detail'){
      const p=byId(hash.slice(8));if(p)renderDetail(p);else{page='home';renderHome()}
    }else renderHome();
    renderFloating(page);document.title=`${cfg.brand.name} | MY EXPO BAG v${cfg.version}`;
  }
  function toast(message){const box=$('#toast');box.textContent=message;box.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>box.classList.remove('show'),1800);}
  function editCart(id,delta){
    if(!byId(id)||!Number.isInteger(delta))return;
    const old=state.cart[id]||0;
    if(delta>0 && old>=20){toast('1商品あたり20点までです');return;}
    const next=Math.max(0,Math.min(20,old+delta));
    if(next===0)delete state.cart[id];else state.cart[id]=next;
    saveCart();render();
  }
  function addBundle(id){
    const b=(cfg.bundles||[]).slice(0,3).find(x=>x.id===id);
    if(!b || !Array.isArray(b.productIds) || !b.productIds.every(byId))return;
    const missing=bundleNeed(b);
    if(!missing.length){nav('#bag');return;}
    if(missing.some(([pid,qty])=>qty>20)){toast('商品は各20点まで追加できます');return;}
    missing.forEach(([pid,qty])=>{state.cart[pid]=qty;});
    saveCart();render();toast('おすすめの組み合わせをMY BAGに追加しました');
  }
  function showCheckout(){
    if(!itemCount())return;
    state.modalOpen=true;
    $('#modal-root').innerHTML=`<div class="modal-backdrop" id="checkout-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div class="modal-heading"><h2 id="checkout-title" class="modal-title">購入QRを開く</h2><button type="button" class="icon-button" data-close-modal aria-label="閉じる">${ICONS.close}</button></div>
      <p class="modal-desc">会場でのお会計用QRを作成します。<br/>お客様情報を入力してください。</p>
      <div class="auth-tabs" role="group" aria-label="登録方法"><button class="auth-tab active" type="button">メール登録</button><button class="auth-tab" type="button" disabled aria-label="LINE連携は準備中">LINE連携（準備中）</button></div>
      <form id="checkout-form"><label class="form-label" for="buyer-name">お名前 <span style="color:#ae5d51">*</span></label><input class="form-input" id="buyer-name" name="name" autocomplete="name" required maxlength="80" placeholder="山田 太郎"/>
      <label class="form-label" for="buyer-email">メールアドレス <span style="color:#ae5d51">*</span></label><input class="form-input" id="buyer-email" name="email" type="email" autocomplete="email" required maxlength="200" placeholder="sample@example.com"/>
      <label class="form-check"><input type="checkbox" name="news"/><span>新商品やイベントのお知らせをメールで受け取る（任意）</span></label>
      <p class="tiny-text">お名前・メールアドレスは注文確認のために利用する想定です。お知らせ配信への同意は任意です。正式公開前に出展者ごとのプライバシー案内を追加します。</p>
      <p class="tiny-text" style="color:#955b34"><strong>デモ：</strong>入力された情報はサーバーへ送信されず、このページを開いている間だけ保持します。</p>
      <div class="form-error" id="checkout-error" role="alert"></div><button class="primary-btn" type="submit">購入QRを表示する →</button></form></section></div>`;
    $('#buyer-name').focus();
  }
  function closeModal(){state.modalOpen=false;$('#modal-root').innerHTML='';}
  function submitCheckout(form){
    if(!form.reportValidity())return;
    const fd=new FormData(form),name=String(fd.get('name')||'').trim(),email=String(fd.get('email')||'').trim();
    if(!name||!email){$('#checkout-error').textContent='お名前とメールアドレスを入力してください。';return;}
    const bytes=new Uint8Array(10);if(window.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
    const id='DEMO-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const totals=totalCalc();
    state.order={id,name,email,newsletterConsent:fd.get('news')==='on',createdAt:new Date().toISOString(),items:{...state.cart},count:itemCount(),total:totals.total,gift:!!cfg.novelty.enabled&&totals.total>=cfg.novelty.minSpend};
    closeModal();nav('#qr');
  }
  document.addEventListener('click', event=>{
    if(event.target.id==='checkout-overlay'){closeModal();return;}
    const clickable=event.target.closest('[data-nav],[data-open-product],[data-add],[data-qty],[data-remove],[data-add-bundle],[data-category],[data-checkout],[data-close-modal],[data-theme]');
    if(!clickable)return;
    if(clickable.hasAttribute('data-nav'))nav(clickable.dataset.nav);
    else if(clickable.hasAttribute('data-open-product'))nav('#product/'+encodeURIComponent(clickable.dataset.openProduct));
    else if(clickable.hasAttribute('data-add')){editCart(clickable.dataset.add,1);toast('MY BAGに追加しました');if(clickable.dataset.goBag==='true')nav('#bag');}
    else if(clickable.hasAttribute('data-qty'))editCart(clickable.dataset.qty,Number(clickable.dataset.step));
    else if(clickable.hasAttribute('data-remove')){delete state.cart[clickable.dataset.remove];saveCart();render();}
    else if(clickable.hasAttribute('data-add-bundle'))addBundle(clickable.dataset.addBundle);
    else if(clickable.hasAttribute('data-category')){state.category=clickable.dataset.category;render();}
    else if(clickable.hasAttribute('data-checkout'))showCheckout();
    else if(clickable.hasAttribute('data-close-modal'))closeModal();
    else if(clickable.hasAttribute('data-theme')){state.previewTheme=clickable.dataset.theme;render();}
  });
  document.addEventListener('submit',event=>{if(event.target.id!=='checkout-form')return;event.preventDefault();submitCheckout(event.target);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.modalOpen)closeModal();});
  window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});});
  // GitHub Pages / home-screen launch: check a tiny release file instead of
  // downloading product images or all app assets in a loop. No Service Worker
  // caches are registered by this app. Updates roll in when returning to the app.
  const showReleaseNotice = () => {
    let notice = $('#release-notice');
    if (!notice) {
      notice=document.createElement('div');
      notice.id='release-notice';
      notice.className='release-notice';
      notice.setAttribute('role','status');
      notice.innerHTML='<span>新しい画面が公開されました</span><button type="button" data-apply-release>更新する</button>';
      document.body.appendChild(notice);
    }
    notice.hidden=false;
  };
  const applyRelease = () => {
    if (!pendingReleaseBuild) return;
    const nextUrl=new URL(location.href);
    nextUrl.searchParams.set('update',pendingReleaseBuild);
    window.location.replace(nextUrl.href);
  };
  const checkRelease = async () => {
    if (releaseCheckBusy || document.visibilityState==='hidden' || !navigator.onLine) return;
    if (Date.now()-lastReleaseCheck<releaseCheckIntervalMs) return;
    lastReleaseCheck=Date.now();
    releaseCheckBusy=true;
    try {
      const response=await fetch('./release.json?nocache='+Date.now(),{cache:'no-store'});
      if(!response.ok) return;
      const release=await response.json();
      if(typeof release.build!=='string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(release.build)) return;
      if(release.build!==activeBuild){
        pendingReleaseBuild=release.build;
        // Do not discard customer information entered in a modal or an open QR.
        if(state.modalOpen || state.order || location.hash==='#qr') showReleaseNotice();
        else applyRelease();
      }
    } catch (error) {
      // A temporary network problem must not interrupt shopping.
      console.debug('更新チェックをスキップしました',error);
    } finally {releaseCheckBusy=false;}
  };
  document.addEventListener('click', event=>{
    if(event.target.closest('[data-apply-release]')) applyRelease();
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRelease();});
  window.addEventListener('pageshow',()=>checkRelease());
  window.addEventListener('focus',()=>checkRelease());
  window.addEventListener('online',()=>checkRelease());
  setInterval(checkRelease,120_000);
  ensureCart();render();
})();
