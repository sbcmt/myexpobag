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
  const state = { category:'all', cart:{}, selectedColors:{}, pendingBundle:'', order:null, checkoutMode:'register', modalOpen:false, previewTheme:null, toastTimer:null };
  // App updates are checked independently of the visible version (fixed at 1.0.1).
  const currentHashes = window.MEB_ASSET_HASHES || {};
  const hashSource = window.MEB_DIGEST_TEXT;
  const currentEtags = window.MEB_ASSET_ETAGS || {};
  const trackedFiles = window.MEB_ASSET_FILES || ['index.html','styles.css','config.js','qr.js','app.js'];
  let lastReleaseCheck = 0;
  let releaseCheckBusy = false;
  let pendingReleaseBuild = '';
  const releaseCheckIntervalMs = 15_000;

  const variantsOf = p => (Array.isArray(p.variants) ? p.variants : []).filter(v=>v && typeof v.code==='string' && typeof v.name==='string' && v.code);
  const skuKey = (id,color='') => encodeURIComponent(id)+'::'+encodeURIComponent(color);
  const fromSkuKey = key => {
    const pos=key.indexOf('::');
    if(pos<0) return { id:key,color:'' }; // previous bag data stays readable
    try { return {id:decodeURIComponent(key.slice(0,pos)),color:decodeURIComponent(key.slice(pos+2))}; }
    catch { return {id:'',color:''}; }
  };
  const selectedVariant = (p,color) => variantsOf(p).find(v=>v.code===color);
  const cartLines = () => Object.entries(state.cart).map(([key,qty])=>{
    const {id,color}=fromSkuKey(key);
    return {key,id,color,qty,product:byId(id)};
  }).filter(line=>line.product && line.qty>0);
  const cartQtyByProduct = () => {
    const counts={};for(const line of cartLines())counts[line.id]=(counts[line.id]||0)+line.qty;
    return counts;
  };
  const missingColors = () => cartLines().filter(line=>variantsOf(line.product).length && !selectedVariant(line.product,line.color));
  const ensureCart = () => {
    try {
      const raw=JSON.parse(localStorage.getItem(cartKey)||'{}');
      if(!raw || typeof raw!=='object' || Array.isArray(raw))return;
      for(const [key,qty] of Object.entries(raw)){
        const {id,color}=fromSkuKey(key),p=byId(id);
        if(!p || !Number.isInteger(qty) || qty<1 || qty>20)continue;
        if(color && !selectedVariant(p,color))continue;
        const normalized=skuKey(id,color);
        state.cart[normalized]=Math.min(20,(state.cart[normalized]||0)+qty);
      }
    }catch { /* browser storage unavailable -> temporary bag */ }
  };
  const saveCart = () => {try{localStorage.setItem(cartKey,JSON.stringify(state.cart));}catch{ /* use in-memory bag */ }};
  const itemCount = () => cartLines().reduce((n,line)=>n+line.qty,0);
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
  const totalCalc = (registered=false) => {
    const listSubtotal = cartLines().reduce((sum,line)=>sum+line.qty*line.product.price,0);
    const eventSubtotal = cartLines().reduce((sum,line)=>sum+line.qty*unitPrice(line.product),0);
    const remaining = cartQtyByProduct();
    const bundles = (cfg.bundles||[]).slice(0,3).filter(b=>Array.isArray(b.productIds) && b.productIds.length>=2 && b.productIds.every(byId) && Number(b.discountPercent)>0);
    let best={saving:0,details:[]};
    function search(index,saving,details){
      if(index===bundles.length){if(saving>best.saving)best={saving,details:[...details]};return;}
      const bundle=bundles[index],required={};
      for(const id of bundle.productIds)required[id]=(required[id]||0)+1;
      const qtyMax=Math.min(20,...Object.entries(required).map(([id,qty])=>Math.floor((remaining[id]||0)/qty)));
      const sum=bundle.productIds.reduce((n,id)=>n+unitPrice(byId(id)),0);
      const eachSaving=Math.round(sum*Math.min(100,Math.max(0,Number(bundle.discountPercent)))/100);
      for(let quantity=0;quantity<=qtyMax;quantity++){
        if(quantity)for(const [id,qty]of Object.entries(required))remaining[id]-=qty;
        search(index+1,saving+quantity*eachSaving,quantity?[...details,{name:bundle.name,count:quantity,saving:quantity*eachSaving}]:details);
      }
      for(const [id,qty]of Object.entries(required))remaining[id]=(remaining[id]||0)+qty*qtyMax;
    }
    search(0,0,[]);
    const beforeAppDiscount=Math.max(0,eventSubtotal-best.saving);
    const configuredRate=Number(cfg.event?.appPurchaseDiscountPercent??0);
    const eligibleAppDiscountPercent=Number.isFinite(configuredRate)?Math.min(100,Math.max(0,configuredRate)):0;
    const appDiscountPercent=registered?eligibleAppDiscountPercent:0;
    const appDiscountAmount=Math.min(beforeAppDiscount,Math.round(beforeAppDiscount*appDiscountPercent/100));
    const total=beforeAppDiscount-appDiscountAmount;
    return {listSubtotal,eventSubtotal,eventSaving:listSubtotal-eventSubtotal,bundleSaving:best.saving,
      bundles:best.details,beforeAppDiscount,eligibleAppDiscountPercent,appDiscountPercent,appDiscountAmount,total};
  };
  const cardProduct = p => `
    <article class="product-card">
      <button class="product-cover" data-open-product="${esc(p.id)}" aria-label="${esc(p.name)}の商品ページを開く">
        ${p.tag?`<span class="product-tag">${esc(p.tag)}</span>`:''}
        <img src="${esc(fileSafe(p.image))}" alt="${esc(p.name)}" loading="lazy"/>
      </button>
      <div class="product-info">
        <div class="product-subtitle">${esc((cfg.categories.find(c=>c.id===p.categoryId)||{}).name||'')} · ID: ${esc(p.id)}</div>
        <h3 class="product-name">${esc(p.name)}</h3>
        <div class="price-line"><div>
          ${unitPrice(p)<p.price?`<span class="price-original">${yen(p.price)}</span>`:''}
          <div class="price-current">${yen(unitPrice(p))}</div>
        </div><button class="add-small" data-add="${esc(p.id)}" aria-label="${esc(p.name)}をBAGに追加">${ICONS.plus}</button></div>
        ${unitPrice(p)<p.price?'<div class="price-extra">展示会限定価格</div>':''}
      </div>
    </article>`;
  const nav = target => { if(location.hash!==target) location.hash=target; else render(); window.scrollTo({top:0,behavior:'instant'}); };
  const renderHeader = () => {
    const logo = cfg.brand.logoUrl || '';
    const safeLogo = (/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo) && logo.length <= 70000) ? logo : fileSafe(logo);
    const icon = safeLogo ? `<img src="${esc(safeLogo)}" alt=""/>` : esc(cfg.brand.name.trim().slice(0,1)||'B');
    $('#site-header').innerHTML=`<div class="header-inner"><div class="brand-left"><div class="brand-icon">${icon}</div><div style="min-width:0"><div class="brand-wordmark">${esc(cfg.brand.name)}</div>${String(cfg.event.name||'').trim()?`<div class="brand-caption">${esc(cfg.event.name)}</div>`:''}</div></div><button class="header-action" data-nav="#bag" aria-label="MY BAGを開く" style="position:relative">${ICONS.bag}${itemCount()?`<span class="header-count">${itemCount()}</span>`:''}</button></div>`;
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
  const bundleNeed = b => {const counts=cartQtyByProduct();return Object.entries(bundleRequired(b)).filter(([id,qty])=>(counts[id]||0)<qty).map(([id,qty])=>[id,qty-(counts[id]||0)]);};
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
    const variants=variantsOf(p);
    const color=state.selectedColors[p.id]||'';
    const category=(cfg.categories.find(c=>c.id===p.categoryId)||{}).name||'未分類';
    $('#view').innerHTML=`<div class="page-body"><button class="back-button" data-nav="#home">${ICONS.left} 商品一覧に戻る</button>
      <div class="detail-cover"><img src="${esc(fileSafe(p.image))}" alt="${esc(p.name)}"/></div>
      ${p.image2&&fileSafe(p.image2)?`<div class="detail-second"><img src="${esc(fileSafe(p.image2))}" alt="${esc(p.name)} サブ画像" loading="lazy"/></div>`:''}
      <div class="detail-en">${esc(category)}　／　商品ID：${esc(p.id)}</div>
      <h1 class="detail-name">${esc(p.name)}</h1>
      <div class="detail-price">${unitPrice(p)<p.price?`<span class="detail-original">${yen(p.price)}</span>`:''}${yen(unitPrice(p))} <span style="font-size:11px;font-weight:500">税込</span></div>
      ${unitPrice(p)<p.price?'<div class="price-extra">展示会限定価格</div>':''}
      ${variants.length?`<section class="variants"><p class="variant-label">カラーを選択 <span>（必須）</span></p><div class="variant-options">${variants.map(v=>`<button type="button" class="variant-chip ${v.code===color?'selected':''}" data-product="${esc(p.id)}" data-variant="${esc(v.code)}" aria-pressed="${v.code===color}">${esc(v.name)}</button>`).join('')}</div></section>`:''}
      <button class="primary-btn" data-add="${esc(p.id)}" data-go-bag="true">＋　MY BAGに追加する</button>
      ${suggestions?`<section class="recommendations" aria-label="おすすめの組み合わせ"><div class="recommend-section-header"><span class="eyebrow">BETTER TOGETHER</span><h2>この商品と一緒にいかがですか？</h2></div><div class="recommend-list">${suggestions}</div></section>`:''}
      <div class="notice">会場の商品を見て色を選んでください。お支払いは出展者ブースで行います。</div></div>`;
  };
  const renderBag=()=>{
    const totals=totalCalc(false),needColors=missingColors();
    const itemRows=cartLines().map(line=>`<div class="cart-item"><div class="cart-thumbnail"><img src="${esc(fileSafe(line.product.image))}" alt=""/></div><div class="cart-main"><div class="cart-title">${esc(line.product.name)}</div>
      <div class="cart-english">ID: ${esc(line.id)}${line.color?' · '+esc(selectedVariant(line.product,line.color)?.name||line.color):(variantsOf(line.product).length?' · カラー未選択':'')}</div>
      <div class="cart-amount">${yen(unitPrice(line.product)*line.qty)}</div><div class="qty-row"><button class="remove-btn" data-remove="${esc(line.key)}">削除</button>
      <button class="qty-btn" data-qty="${esc(line.key)}" data-step="-1" aria-label="${esc(line.product.name)}を1つ減らす">−</button><span class="qty-value">${line.qty}</span>
      <button class="qty-btn" data-qty="${esc(line.key)}" data-step="1" aria-label="${esc(line.product.name)}を1つ増やす">+</button></div>
      ${variantsOf(line.product).length&&!line.color?`<button class="pick-color-link" data-open-product="${esc(line.id)}">カラーを選ぶ →</button>`:''}</div></div>`).join('');
    $('#view').innerHTML=`<div class="page-body"><button class="back-button" data-nav="#home">${ICONS.left} 商品一覧に戻る</button><h1 class="page-title">MY BAG<span style="color:var(--main)">.</span></h1><p class="page-subtitle">商品とお支払い予定金額をご確認ください。</p>
      ${itemCount()?`${itemRows}<section class="order-box"><h2 class="order-heading">ご注文内容</h2>
      <div class="order-row"><span class="order-label">通常価格 合計</span><strong>${yen(totals.listSubtotal)}</strong></div>
      ${totals.eventSaving>0?`<div class="order-row"><span class="order-label">展示会限定価格による割引</span><span class="order-positive">−${yen(totals.eventSaving)}</span></div>`:''}
      ${totals.bundles.map(b=>`<div class="order-row"><span class="order-label">セット割引：${esc(b.name)} × ${b.count}</span><span class="order-positive">−${yen(b.saving)}</span></div>`).join('')}
      <div class="order-total"><span>商品合計（税込）</span><strong>${yen(totals.beforeAppDiscount)}</strong></div>
      ${totals.eligibleAppDiscountPercent>0?`<div class="register-offer">お名前とメール登録で <strong>さらに${totals.eligibleAppDiscountPercent}%OFF</strong><br/>登録後 ${yen(totalCalc(true).total)} ／ 登録せず購入も可能</div>`:''}
      <div class="tiny-text" style="text-align:right;margin-top:9px">お支払いは会場で</div></section>
      ${cfg.novelty.enabled?`<div class="gift-eligible"><strong>✦ ノベルティ特典</strong><p>${yen(cfg.novelty.minSpend)}以上のお支払いで ${esc(cfg.novelty.name)} の対象。${esc(cfg.novelty.note)}</p></div>`:''}
      <div class="purchase-action">${needColors.length?`<p class="color-warning">カラーが未選択の商品があります。該当商品を開いてカラーを選び直してください。</p>`:''}<button class="primary-btn" data-checkout ${needColors.length?'disabled':''}>購入QRを開く　→</button><p class="helptext">お名前・メール登録で割引（設定時）。登録せず購入することもできます。<br/>実際の注文はまだ送信されません。</p></div>`:
      `<div class="empty-cart"><span class="empty-cart-emoji">▢</span><h2>MY BAGは空です</h2><p>気になった商品をBAGに追加しましょう。</p><button class="outline-btn" data-nav="#home">商品を探す　→</button></div>`}</div>`;
  };
  // This QR is an unsigned order *preview*, never proof of payment.
  // Identity/email is NOT embedded. The future backend will join the order ID
  // to the consent / customer record after securely saving it.
  // Compact field names keep the QR scannable on phones. Map is in README.
  const orderQrPayload = order => JSON.stringify({
    t:'MEB2',o:order.id,b:cfg.brand.id,e:cfg.event.id,
    i:order.items.map(x=>[x.id,x.color,x.qty]),r:order.registered?1:0,
    c:'JPY',s:order.beforeAppDiscount,p:order.appDiscountPercent,
    d:order.appDiscountAmount,a:order.total
  });
  const renderQr=()=>{
    if(!state.order){$('#view').innerHTML=`<div class="page-body"><h1 class="page-title">購入QR</h1><p class="page-subtitle">購入QRは再読み込みすると消えます。<br/>MY BAGから再度発行してください。</p><button class="primary-btn" data-nav="#bag">MY BAGを見る</button></div>`;return;}
    const order=state.order;
    $('#view').innerHTML=`<div class="page-body qr-page"><button class="back-button" data-nav="#bag" style="display:flex">${ICONS.left} MY BAGに戻る</button><div class="eyebrow">CHECKOUT QR</div><h1 class="page-title" style="margin-top:9px">購入QR</h1><p class="page-subtitle">この画面を出展者スタッフに見せてください。</p>
      <section class="qr-card"><div class="qr-status">動作確認用 QR</div><div class="qr-canvas-wrap"><canvas id="order-qr" width="480" height="480" role="img" aria-label="購入QRコード"></canvas></div>
      <div class="qr-price-box"><div class="qr-price-label">合計金額（税込）</div><div class="qr-price-base">${yen(order.beforeAppDiscount)}</div>
        ${order.appDiscountPercent>0?`<div class="qr-app-discount"><span>合計から${order.appDiscountPercent}%OFF</span><span>−${yen(order.appDiscountAmount)}</span></div><div class="qr-price-final"><span>割引後のお支払い金額</span><strong>${yen(order.total)}</strong></div>`:''}
      </div><div class="qr-order-id">${esc(order.id)}</div><div class="qr-instructions">スタッフにQRを見せて<br/>お会計を行います。</div></section>
      <div style="margin-top:18px"><div class="qr-data-row"><span>登録方法</span><strong>${order.registered?'名前・メールを登録':'登録をスキップ'}</strong></div>
        ${order.registered?`<div class="qr-data-row"><span>お名前</span><strong>${esc(order.name)}</strong></div><div class="qr-data-row"><span>メール</span><strong class="email-text">${esc(order.email)}</strong></div>`:''}
        <div class="qr-data-row"><span>ご注文点数</span><strong>${order.count}点</strong></div>
        ${order.items.map(line=>`<div class="qr-data-row"><span>${esc(line.id)}${line.color?' / '+esc(line.color):''}</span><strong>×${line.qty}</strong></div>`).join('')}
        <div class="qr-data-row"><span>お支払い予定額</span><strong>${yen(order.total)}</strong></div>
        ${order.gift?`<div class="qr-data-row"><span>ノベルティ</span><strong>${esc(cfg.novelty.name)} 対象</strong></div>`:''}</div>
      <div class="demo-alert"><strong>現在はデモ用です。</strong><br/>QRには注文ID・商品ID・色コード・数量・金額・割引条件が入っています。名前とメールはQRには含まれず、サーバーにも保存していません。出展者側の注文記録・CSV連携と価格検証は未実装です。このQRを実際の支払い・特典交換には使用しないでください。</div>
      <button class="outline-btn" data-nav="#home">商品一覧に戻る</button></div>`;
    try{
      const code=new window.QRCodeCore(0,window.QRErrorCorrectLevel.M);code.addData(orderQrPayload(order));code.make();
      const canvas=$('#order-qr'),ctx=canvas.getContext('2d');const count=code.getModuleCount();const quiet=4;const size=canvas.width;const cell=Math.floor(size/(count+quiet*2));const offset=Math.floor((size-cell*(count+quiet*2))/2);
      if(cell<2)throw new Error('QR内の商品数が多すぎます');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#111';
      for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(code.isDark(r,c))ctx.fillRect(offset+(c+quiet)*cell,offset+(r+quiet)*cell,cell,cell);
    }catch(error){console.error('QR生成エラー',error);$('.qr-canvas-wrap').innerHTML='<p>QRを生成できませんでした。商品の点数や内容をご確認ください。</p>';}
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
  function editCart(key,delta){
    const {id}=fromSkuKey(key);if(!byId(id)||!Number.isInteger(delta))return;
    const old=state.cart[key]||0;
    if(delta>0 && old>=20){toast('1商品・カラーあたり20点までです');return;}
    const next=Math.max(0,Math.min(20,old+delta));
    if(next===0)delete state.cart[key];else state.cart[key]=next;
    saveCart();render();
  }
  function addItem(id,goBag=false){
    const product=byId(id);if(!product)return;
    if(state.pendingBundle){
      const pending=(cfg.bundles||[]).find(b=>b.id===state.pendingBundle);
      if(pending?.productIds.includes(id)){completeBundle();return;}
    }
    const variants=variantsOf(product),color=state.selectedColors[id]||'';
    if(variants.length&&!selectedVariant(product,color)){
      if(location.hash==='#product/'+encodeURIComponent(id))toast('カラーを選択してください');
      else{nav('#product/'+encodeURIComponent(id));toast('カラーを選択してください');}
      return;
    }
    const key=skuKey(id,color);
    if((state.cart[key]||0)>=20){toast('1商品・カラーあたり20点までです');return;}
    editCart(key,1);toast('MY BAGに追加しました');if(goBag)nav('#bag');
  }
  function completeBundle(){
    const id=state.pendingBundle;
    const bundle=(cfg.bundles||[]).slice(0,3).find(b=>b.id===id);
    if(!bundle){state.pendingBundle='';return;}
    const missing=bundleNeed(bundle);
    const needsColor=missing.find(([pid])=>variantsOf(byId(pid)).length && !selectedVariant(byId(pid),state.selectedColors[pid]||''));
    if(needsColor){
      nav('#product/'+encodeURIComponent(needsColor[0]));
      toast('この組み合わせのカラーを選択してください');
      return;
    }
    for(const [pid,qty] of missing){
      const key=skuKey(pid,state.selectedColors[pid]||'');
      if((state.cart[key]||0)+qty>20){state.pendingBundle='';toast('1商品・カラーあたり20点までです');return;}
    }
    for(const [pid,qty] of missing){
      const key=skuKey(pid,state.selectedColors[pid]||'');
      state.cart[key]=(state.cart[key]||0)+qty;
    }
    state.pendingBundle='';saveCart();nav('#bag');toast('組み合わせをMY BAGに追加しました');
  }
  function addBundle(id){
    const bundle=(cfg.bundles||[]).slice(0,3).find(b=>b.id===id);
    if(!bundle||!Array.isArray(bundle.productIds)||!bundle.productIds.every(byId))return;
    state.pendingBundle=id;
    completeBundle();
  }
  function showCheckout(){
    if(!itemCount()||missingColors().length)return;
    state.modalOpen=true;state.checkoutMode='register';
    const offer=totalCalc(true),original=totalCalc(false);
    $('#modal-root').innerHTML=`<div class="modal-backdrop" id="checkout-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div class="modal-heading"><h2 id="checkout-title" class="modal-title">購入QRを開く</h2><button type="button" class="icon-button" data-close-modal aria-label="閉じる">${ICONS.close}</button></div>
      ${offer.eligibleAppDiscountPercent>0?`<div class="checkout-offer">お名前とメールを登録すると <strong>合計から${offer.eligibleAppDiscountPercent}%OFF</strong><br/><span>登録なら ${yen(offer.total)} ／ スキップなら ${yen(original.total)}</span></div>`:''}
      <p class="modal-desc">登録するか、入力せずに購入QRを表示するか選べます。</p>
      <div class="auth-tabs" role="group" aria-label="購入者情報の登録"><button class="auth-tab active" data-checkout-mode="register" type="button" aria-pressed="true">登録して購入</button><button class="auth-tab" data-checkout-mode="skip" type="button" aria-pressed="false">入力をスキップ → QR表示</button></div>
      <form id="checkout-form"><div id="registration-fields">
        <label class="form-label" for="buyer-name">お名前 <span style="color:#ae5d51">*</span></label><input class="form-input" id="buyer-name" name="name" autocomplete="name" required maxlength="80" placeholder="山田 太郎"/>
        <label class="form-label" for="buyer-email">メールアドレス <span style="color:#ae5d51">*</span></label><input class="form-input" id="buyer-email" name="email" type="email" autocomplete="email" required maxlength="200" placeholder="sample@example.com"/>
        <label class="form-check"><input type="checkbox" name="news"/><span>新商品やイベントのお知らせをメールで受け取る（任意）</span></label>
        <p class="tiny-text">購入者情報の登録と、広告メールを受け取る同意は別です。出展者によるプライバシー案内は管理画面接続時に追加します。</p></div>
        <div id="skip-description" class="skip-description" hidden>登録なしでQRを発行します。${offer.eligibleAppDiscountPercent>0?'アプリ購入割引は適用されません。':'商品・セット割引はそのまま適用されます。'}</div>
        <div class="checkout-price-preview" id="checkout-price-preview">${offer.eligibleAppDiscountPercent>0?`<span>登録後のお支払い金額</span><strong>${yen(offer.total)}</strong>`:`<span>お支払い予定額</span><strong>${yen(offer.total)}</strong>`}</div>
        <p class="tiny-text" style="color:#955b34"><strong>デモ：</strong>お名前・メールはこの画面内のみで扱い、サーバーへ送信しません。QRにも入れません。</p>
        <div class="form-error" id="checkout-error" role="alert"></div><button class="primary-btn" type="submit">購入QRを表示する →</button></form></section></div>`;
    $('#buyer-name').focus();
  }
  function setCheckoutMode(mode){
    if(!state.modalOpen||!['register','skip'].includes(mode))return;
    state.checkoutMode=mode;
    const register=mode==='register';
    $('#registration-fields').hidden=!register;$('#skip-description').hidden=register;
    $('#buyer-name').required=register;$('#buyer-email').required=register;
    document.querySelectorAll('[data-checkout-mode]').forEach(btn=>{const active=btn.dataset.checkoutMode===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    const totals=totalCalc(register);
    $('#checkout-price-preview').innerHTML=`<span>${register&&totals.appDiscountPercent>0?'割引後の': ''}お支払い予定額</span><strong>${yen(totals.total)}</strong>`;
    $('#checkout-error').textContent='';
  }
  function closeModal(){state.modalOpen=false;$('#modal-root').innerHTML='';}
  function submitCheckout(form){
    const registered=state.checkoutMode==='register';
    if(registered&&!form.reportValidity())return;
    const fd=new FormData(form),name=registered?String(fd.get('name')||'').trim():'',email=registered?String(fd.get('email')||'').trim():'';
    if(registered&&(!name||!email)){$('#checkout-error').textContent='お名前とメールアドレスを入力してください。';return;}
    if(!window.crypto?.getRandomValues){$('#checkout-error').textContent='安全な注文番号を作成できません。HTTPSで開いてください。';return;}
    const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);
    const id='DEMO-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const totals=totalCalc(registered);
    const items=cartLines().map(line=>({id:line.id,color:line.color,qty:line.qty}));
    state.order={id,registered,name,email,newsletterConsent:registered&&fd.get('news')==='on',createdAt:new Date().toISOString(),
      items,count:itemCount(),listSubtotal:totals.listSubtotal,eventSubtotal:totals.eventSubtotal,bundleSaving:totals.bundleSaving,
      beforeAppDiscount:totals.beforeAppDiscount,appDiscountPercent:totals.appDiscountPercent,
      appDiscountAmount:totals.appDiscountAmount,total:totals.total,
      gift:!!cfg.novelty.enabled&&totals.total>=cfg.novelty.minSpend};
    closeModal();nav('#qr');
  }
  document.addEventListener('click', event=>{
    if(event.target.id==='checkout-overlay'){closeModal();return;}
    const clickable=event.target.closest('[data-nav],[data-open-product],[data-add],[data-qty],[data-remove],[data-add-bundle],[data-category],[data-checkout],[data-close-modal],[data-theme],[data-variant],[data-checkout-mode]');
    if(!clickable)return;
    if(clickable.hasAttribute('data-nav')){state.pendingBundle='';nav(clickable.dataset.nav);}
    else if(clickable.hasAttribute('data-open-product'))nav('#product/'+encodeURIComponent(clickable.dataset.openProduct));
    else if(clickable.hasAttribute('data-add'))addItem(clickable.dataset.add,clickable.dataset.goBag==='true');
    else if(clickable.hasAttribute('data-qty'))editCart(clickable.dataset.qty,Number(clickable.dataset.step));
    else if(clickable.hasAttribute('data-remove')){delete state.cart[clickable.dataset.remove];saveCart();render();}
    else if(clickable.hasAttribute('data-add-bundle'))addBundle(clickable.dataset.addBundle);
    else if(clickable.hasAttribute('data-category')){state.category=clickable.dataset.category;render();}
    else if(clickable.hasAttribute('data-checkout'))showCheckout();
    else if(clickable.hasAttribute('data-close-modal'))closeModal();
    else if(clickable.hasAttribute('data-theme')){state.previewTheme=clickable.dataset.theme;render();}
    else if(clickable.hasAttribute('data-variant')){state.selectedColors[clickable.dataset.product]=clickable.dataset.variant;render();}
    else if(clickable.hasAttribute('data-checkout-mode')){
      const mode=clickable.dataset.checkoutMode;
      setCheckoutMode(mode);
      // "Skip" is an action, not a second form step: issue the unregistered QR immediately.
      if(mode==='skip')submitCheckout($('#checkout-form'));
    }
  });
  document.addEventListener('submit',event=>{if(event.target.id!=='checkout-form')return;event.preventDefault();submitCheckout(event.target);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.modalOpen)closeModal();});
  window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});});
  // A Home Screen PWA can retain its old document while in the background.
  // On focus / visibility / periodic checks, compare actual live files with the
  // exact ones used at boot. No manual release.json update needed.
  const showReleaseNotice = () => {
    let notice = $('#release-notice');
    if (!notice) {
      notice=document.createElement('div');
      notice.id='release-notice';
      notice.className='release-notice';
      notice.setAttribute('role','status');
      notice.innerHTML='<span>最新の商品・画面が公開されました</span><button type="button" data-apply-release>更新する</button>';
      document.body.appendChild(notice);
    }
    notice.hidden=false;
  };
  const applyRelease = () => {
    if (!pendingReleaseBuild) return;
    const nextUrl=new URL(location.href);
    // Unique navigation URL prevents WebKit's document/BFCache from
    // restoring a permanently stale installed-app document.
    nextUrl.searchParams.set('meb_refresh',Date.now().toString(36));
    window.location.replace(nextUrl.href);
  };
  const checkRelease = async (force=false) => {
    if (releaseCheckBusy || document.visibilityState==='hidden' || !navigator.onLine || !hashSource) return;
    if (!force && Date.now()-lastReleaseCheck<releaseCheckIntervalMs) return;
    // Even forced foreground checks should not fire dozens of requests rapidly.
    if (Date.now()-lastReleaseCheck<3000) return;
    lastReleaseCheck=Date.now();
    releaseCheckBusy=true;
    try {
      const results=await Promise.all(trackedFiles.map(async filename=>{
        const url='./'+filename+'?meb_check='+Date.now();
        // Most static hosts (including GitHub Pages) return ETag. First check
        // the small headers, avoiding repeated JS/image data downloads.
        if(currentEtags[filename]){
          try{
            const head=await fetch(url,{method:'HEAD',cache:'no-store'});
            if(head.ok && head.headers.get('ETag')===currentEtags[filename]){
              return [filename,currentHashes[filename]];
            }
          }catch(_) { /* HEAD unavailable: check exact file contents */ }
        }
        const response=await fetch(url,{cache:'no-store'});
        if (!response.ok) throw new Error('更新確認 '+filename+': '+response.status);
        return [filename,hashSource(await response.text())];
      }));
      if (results.some(([name,hash])=>hash!==currentHashes[name])){
        pendingReleaseBuild='changed';
        // Preserve unsent form contents and the provisional checkout QR.
        if(state.modalOpen || state.order || location.hash==='#qr') showReleaseNotice();
        else applyRelease();
      }
    } catch (error) {
      console.debug('更新確認ができませんでした',error);
    } finally {releaseCheckBusy=false;}
  };
  document.addEventListener('click', event=>{
    if(event.target.closest('[data-apply-release]')) applyRelease();
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRelease(true);});
  window.addEventListener('pageshow',()=>checkRelease(true));
  window.addEventListener('focus',()=>checkRelease(true));
  window.addEventListener('online',()=>checkRelease(true));
  setInterval(()=>checkRelease(),90_000);
  ensureCart();render();
})();
