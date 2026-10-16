/** Owner-only real product and variant QR price cards (no demo catalog). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id),cfg=window.MEB_FIREBASE_CONFIG||{};
const query=new URLSearchParams(location.search);
const ids=new Set(String(query.get('ids')||'').split(',').filter(Boolean));
let style=query.get('style')==='accent'?'accent':'white';
let lines=[],brandName='',brandSlug='';
const out=$('paper-output');
const yen=n=>'¥'+Math.round(Number(n)||0).toLocaleString('ja-JP');
function showMessage(s){out.replaceChildren();const p=document.createElement('p');p.className='notice';p.textContent=s;out.append(p);}
function productUrl(id,variant=''){
 const u=new URL('./index.html',location.href);
 u.searchParams.set('brand',brandSlug);
 u.hash='#product/'+encodeURIComponent(id)+(variant?'?variant='+encodeURIComponent(variant):'');
 return u.href;
}
function makeQr(url){
 const qr=new window.QRCodeCore(0,window.QRErrorCorrectLevel.M);
 qr.addData(url);qr.make();const n=qr.getModuleCount(),border=4,pixel=5;
 const c=document.createElement('canvas');c.width=c.height=(n+border*2)*pixel;
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
 ctx.fillStyle='#111';for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect((col+border)*pixel,(r+border)*pixel,pixel,pixel);
 return c.toDataURL('image/png');
}
function cardFor({product:p,variant:v,published}){
 const el=document.createElement('article');el.className='pricecard '+style+(published?'':' unpublished');
 const qr=document.createElement('div');qr.className='qr-area';
 const img=document.createElement('img');img.src=makeQr(productUrl(p.id,v.code||''));img.alt=p.name+(v.name?' '+v.name:'')+'の商品ページQR';
 const note=document.createElement('div');note.className='scan-note';note.textContent='商品ページQR';qr.append(img,note);
 const info=document.createElement('div');info.className='information';
 const brand=document.createElement('div');brand.className='brand';brand.textContent=brandName;
 const name=document.createElement('div');name.className='item';name.textContent=p.name;
 const prices=document.createElement('div');prices.className='price';
 const regular=Number.isFinite(v.price)?v.price:p.price;
 const eventPrice=Number.isFinite(v.eventPrice)?v.eventPrice:p.eventPrice;
 const sale=Number.isFinite(eventPrice)&&eventPrice>=0&&eventPrice<regular;
 if(sale){const crossed=document.createElement('div');crossed.className='normal strike';crossed.textContent='通常 '+yen(regular);prices.append(crossed);}
 const now=document.createElement('div');now.className='now'+(sale?' event':'');
 if(sale){const label=document.createElement('small');label.textContent='展示会';now.append(label);}now.append(document.createTextNode(yen(sale?eventPrice:regular)));prices.append(now);
 info.append(brand,name,prices);
 if(v.name){const detail=document.createElement('div');detail.className='meta';detail.textContent='種類：'+v.name;detail.style.marginTop='auto';info.append(detail);}
 el.append(qr,info);return el;
}
function render(){out.replaceChildren();if(!lines.length){showMessage('該当する登録商品がありません。管理画面から選び直してください。');return;}
 for(let i=0;i<lines.length;i+=10){const paper=document.createElement('div');paper.className='paper';const sheet=document.createElement('div');sheet.className='sheet';lines.slice(i,i+10).forEach(x=>sheet.append(cardFor(x)));paper.append(sheet);out.append(paper);}
 for(const t of ['white','accent'])$(t).classList.toggle('active',t===style);
 const n=lines.filter(x=>!x.published).length;
 document.querySelector('.notice').textContent=n?`⚠ 未公開のカードが${n}枚あります。商品を「お客様ページに反映」したあとに掲示してください。`:'登録済み商品・バリエーションの正式QRです。印刷時はA4・倍率100%・余白なしを確認してください。';
}
for(const t of ['white','accent'])$(t).addEventListener('click',()=>{style=t;render();});
$('print').addEventListener('click',()=>window.print());
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k]))showMessage('Firebase設定を確認してください。');
else{
 const app=getApps().length?getApp():initializeApp(cfg),db=getFirestore(app);
 onAuthStateChanged(getAuth(app),async user=>{
  if(!user){location.replace('./login.html');return;}
  try{
   const b=await getDoc(doc(db,'brands',user.uid));if(!b.exists()||b.data().ownerUid!==user.uid)throw Error('ブランド情報が見つかりません。');
   brandSlug=b.data().slug;brandName=b.data().displayName||brandSlug;
   const [drafts,pub]=await Promise.all([getDocs(collection(db,'brands',user.uid,'products')),getDoc(doc(db,'publishedCatalogs',brandSlug))]);
   const pubIds=new Set((pub.data()?.products||[]).map(p=>p.id));
   const all=drafts.docs.map(s=>s.data()).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string');
   const selected=ids.size?all.filter(p=>ids.has(p.id)):all;
   lines=selected.flatMap(p=>{
    const variants=Array.isArray(p.variants)&&p.variants.length?p.variants:[{code:'',name:''}];
    return variants.map(v=>({product:p,variant:v,published:pubIds.has(p.id)}));
   });
   render();
  }catch(e){console.error(e);showMessage('商品情報の取得に失敗しました：'+(e.message||'通信エラー'));}
 });
}
