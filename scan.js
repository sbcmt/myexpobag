/** MY EXPO BAG 1.0.1: authenticated, transactional, idempotent inventory deduction. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const firebase=window.MEB_FIREBASE_CONFIG||{};
let user=null,brand=null,db=null,scanner=null,scanning=false;
const say=(message,isError=false)=>{$('result').textContent=message;$('result').className=isError?'error':'good';};
const yen=n=>'¥'+Math.round(n).toLocaleString('ja-JP');
const loginUrl=new URL('./login.html',location.href).href;
const parseOrder=text=>{
  let raw;try{raw=JSON.parse(String(text||''));}catch{throw Error('購入QRの形式を読み取れません。');}
  if(raw?.t!=='MEB2'||typeof raw.o!=='string'||!/^DEMO-[A-F0-9]{20}$/.test(raw.o))throw Error('対応していない購入QRです。');
  if(raw.b!==brand.slug||raw.e!==brand.slug)throw Error('別の出展ブランドのQRです。');
  if(!Array.isArray(raw.i)||raw.i.length<1||raw.i.length>30)throw Error('購入商品数が不正です。');
  const counts=new Map(),items=[];
  for(const line of raw.i){
    if(!Array.isArray(line)||line.length!==3)throw Error('商品データが不正です。');
    const [id,sku,qty]=line;
    if(typeof id!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(id)||typeof sku!=='string'||sku.length>70||!Number.isInteger(qty)||qty<1||qty>20)throw Error('商品ID・数量が不正です。');
    const variant=sku?sku.startsWith(id+'_')?sku.slice(id.length+1):null:'';
    if(variant===null)throw Error('サブコードが商品IDと一致しません。');
    const key=id+'::'+variant; if(items.some(x=>x.key===key))throw Error('QRに重複したSKUがあります。');
    items.push({id,variant,qty,key});counts.set(id,(counts.get(id)||0)+qty);
  }
  if(items.some(x=>counts.get(x.id)>20))throw Error('同一商品が上限数量を超えています。');
  return {raw,items,counts};
};
function priceFor(product,code){
  const variants=Array.isArray(product.variants)?product.variants:[];
  const variant=code?variants.find(v=>v.code===code):null;
  if(variants.length&&!variant)throw Error('バリエーション指定が不正です：'+product.id);
  if(!variants.length&&code)throw Error('不要なサブコードがあります：'+product.id);
  const normal=Number.isInteger(variant?.price)?variant.price:product.price;
  const event=Number.isInteger(variant?.eventPrice)?variant.eventPrice:product.eventPrice;
  return Number.isInteger(event)&&event>=0&&event<normal?event:normal;
}
async function confirmScan(text){
  if(!user||!brand||scanning)return;
  scanning=true;$('manual-scan').disabled=true;$('camera-start').disabled=true;$('price').textContent='';$('sales-note').textContent='';say('商品・在庫・金額を確認しています…');
  try{
    const {raw,items,counts}=parseOrder(text);
    const stockRef=doc(db,'publishedStock',brand.slug);
    const saleRef=doc(db,'brands',user.uid,'scannedOrders',raw.o);
    const catalogRef=doc(db,'publishedCatalogs',brand.slug);
    const productRefs=[...counts.keys()].map(id=>doc(db,'brands',user.uid,'products',id));
    const outcome=await runTransaction(db,async tx=>{
      // Read all transaction documents before any write.
      const sold=await tx.get(saleRef);
      if(sold.exists())return {duplicate:true,amount:sold.data().amount};
      const [stockSnap,catalogSnap,...productSnaps]=await Promise.all([tx.get(stockRef),tx.get(catalogRef),...productRefs.map(r=>tx.get(r))]);
      if(!stockSnap.exists()||!catalogSnap.exists())throw Error('在庫情報がまだ公開されていません。「お客様ページに反映」を実行してください。');
      const catalog=catalogSnap.data();if(catalog.brandId!==user.uid||stockSnap.data().brandId!==user.uid)throw Error('ブランドの所有情報が一致しません。');
      const publicById=new Map((catalog.products||[]).map(p=>[p.id,p]));
      const privateById=new Map();const qtyById=stockSnap.data().quantities||{};
      productSnaps.forEach((s,i)=>{if(!s.exists())throw Error('登録済み商品が見つかりません。');privateById.set(productRefs[i].id,s.data());});
      let amount=0;
      for(const item of items){
        const p=publicById.get(item.id),privateProduct=privateById.get(item.id);
        if(!p||!privateProduct||privateProduct.active===false)throw Error('商品が現在公開されていません：'+item.id);
        {
          if(!Object.prototype.hasOwnProperty.call(qtyById,item.id))throw Error('在庫情報が未設定の商品です：'+item.id);
          if(qtyById[item.id]!==null && (!Number.isInteger(qtyById[item.id])||qtyById[item.id]<counts.get(item.id)))throw Error('売切れ・在庫不足：'+p.name);
          if(privateProduct.stock!==null&&(!Number.isInteger(privateProduct.stock)||privateProduct.stock<counts.get(item.id)))throw Error('在庫不足（管理側）：'+p.name);
        }
        amount+=priceFor(p,item.variant)*item.qty;
      }
      const remaining=new Map(counts);let bundleDiscount=0;
      const bundles=(catalog.bundles||[]).filter(b=>Array.isArray(b.productIds)&&b.productIds.length===2&&Number.isInteger(b.discountAmount)&&b.discountAmount>0).sort((a,b)=>b.discountAmount-a.discountAmount);
      for(const b of bundles){
        const [a,c]=b.productIds;const count=Math.min(remaining.get(a)||0,remaining.get(c)||0);if(!count)continue;
        const minPrice=id=>Math.min(...items.filter(item=>item.id===id).map(item=>priceFor(publicById.get(id),item.variant)));
        const saving=Math.min(b.discountAmount,minPrice(a)+minPrice(c));bundleDiscount+=saving*count;
        remaining.set(a,remaining.get(a)-count);remaining.set(c,remaining.get(c)-count);
      }
      const base=Math.max(0,amount-Math.min(amount,bundleDiscount));
      const publishedRate=Number(catalog.event?.appPurchaseDiscountPercent||0);
      // Until registration records are server-verified, do NOT grant a QR-claimed discount.
      if(publishedRate>0||Number(raw.p||0)>0)throw Error('登録特典割引の本人確認は未接続です。割引付きQRでの在庫確定はまだできません。');
      if(!Number.isInteger(raw.a)||base!==raw.a||raw.s!==base||raw.d!==0)throw Error('QRに含まれる金額と登録済みの価格が一致しません。');
      const next={...qtyById};
      for(const [id,qty] of counts){
        const product=privateById.get(id);
        if(Number.isInteger(next[id]))next[id]-=qty;
        if(Number.isInteger(product.stock))tx.update(doc(db,'brands',user.uid,'products',id),{stock:product.stock-qty,updatedAt:serverTimestamp()});
      }
      tx.update(stockRef,{quantities:next,updatedAt:serverTimestamp()});
      tx.set(saleRef,{orderId:raw.o,brandId:user.uid,items:items.map(({id,variant,qty})=>({id,variant,qty})),amount:base,scanTime:serverTimestamp()});
      return {duplicate:false,amount:base,items};
    },{maxAttempts:5});
    if(outcome.duplicate){say('このQRはすでに読み取り済みです。\n在庫は再減算していません。');$('price').textContent=yen(outcome.amount);}
    else {say('販売記録を保存し、在庫を更新しました。\n'+outcome.items.map(x=>`${x.id}${x.variant?'_'+x.variant:''} × ${x.qty}`).join('\n'));$('price').textContent=yen(outcome.amount);$('sales-note').textContent='同じQRを再読取しても在庫は減りません。';}
  }catch(err){console.error(err);say(err.message||'読み取り処理に失敗しました。',true);}finally{scanning=false;$('manual-scan').disabled=false;$('camera-start').disabled=false;}
}
async function stopCamera(){if(scanner){try{await scanner.stop();}catch{}try{scanner.clear();}catch{}scanner=null;}$('camera-stop').disabled=true;}
$('camera-start').addEventListener('click',async()=>{
 if(!window.Html5Qrcode){say('カメラ用ライブラリを読み込めませんでした。QR内容の貼り付けをご利用ください。',true);return;}
 await stopCamera();scanner=new window.Html5Qrcode('reader');
 try{await scanner.start({facingMode:'environment'},{fps:8,qrbox:{width:225,height:225}},async value=>{await stopCamera();$('qr-input').value=value;await confirmScan(value);},()=>{});$('camera-stop').disabled=false;}
 catch(err){console.error(err);say('カメラが起動しませんでした。iPhoneのカメラ権限をご確認ください。',true);}
});
$('camera-stop').addEventListener('click',stopCamera);
$('manual-scan').addEventListener('click',()=>confirmScan($('qr-input').value));
if(['apiKey','authDomain','projectId','appId'].some(k=>!firebase[k]))say('Firebaseの設定を読み込めませんでした。',true);
else {
 const app=getApps().length?getApp():initializeApp(firebase);db=getFirestore(app);
 onAuthStateChanged(getAuth(app),async u=>{
  if(!u){location.replace(loginUrl);return;}
  try{const s=await getDoc(doc(db,'brands',u.uid));if(!s.exists()||s.data().ownerUid!==u.uid)throw Error('ブランド管理権限がありません');
   user=u;brand=s.data();$('auth-state').textContent='ログイン中：'+brand.displayName;$('camera-start').disabled=false;$('manual-scan').disabled=false;
  }catch(err){console.error(err);say('ブランド情報を確認できませんでした。',true);}
 });
}
