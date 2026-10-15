/** MY EXPO BAG v1.0.1 — Owner-only paginated CSV exports (no third-party API). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,orderBy,limit,startAfter,deleteDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id),firebase=window.MEB_FIREBASE_CONFIG||{};
const app=getApps().length?getApp():initializeApp(firebase),db=getFirestore(app);
let owner=null,brand=null,busy=false,customers=[],sales=[],selectedCustomers=[],selectedSales=[];
function message(value,failed=false){$('status').textContent=value;$('status').classList.toggle('error',failed);}
function lock(flag){busy=flag;['load','mail','sales','shipping'].forEach(id=>$(id).disabled=flag||!owner);}
const localDate=(date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const localStamp=date=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
const dateOf=x=>x?.toDate?.()|| (typeof x==='string'?new Date(x):null);
const validDate=x=>x instanceof Date&&!Number.isNaN(x.getTime());
function selectedByDate(d){if(!validDate(d))return false;const date=localDate(d),from=$('from').value,to=$('to').value;return (!from||date>=from)&&(!to||date<=to);}
async function fetchAll(ref,ordering){
 let last=null,records=[];
 for(let batch=0;batch<200;batch++){
  const q=last?query(ref,orderBy(ordering,'asc'),startAfter(last),limit(200)):query(ref,orderBy(ordering,'asc'),limit(200));
  const page=await getDocs(q);
  for(const snap of page.docs)records.push({id:snap.id,...snap.data()});
  if(page.size<200)return records;
  last=page.docs.at(-1);
  message(`${records.length}件まで読み込み中…`);
 }
 throw Error('大量データの取得上限に達しました。日付指定だけでなく、バックエンドで分割処理が必要です。');
}
function csvCell(value){let s=String(value??'');if(/^[\s\uFEFF]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function writeCsv(filename,header,rows){
 const csv='\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function nameFor(type){return `MY_EXPO_BAG_${brand.slug}_${type}_${localDate(new Date()).replaceAll('-','')}.csv`;}
const receiptState=id=>sales.find(s=>s.orderId===id)?.status||'QR発行済み（未受付）';
function refreshCounts(){
 const handed=selectedSales.filter(x=>x.status==='handedOff');
 const delivery=handed.filter(x=>x.hasPreorder&&customers.some(y=>y.orderId===x.orderId));
 $('count').textContent=`登録者：${selectedCustomers.length}件 ／ 完了注文：${handed.length}件 ／ 配送対象：${delivery.length}件`;
 const ul=$('deletable');ul.replaceChildren();
 if(!delivery.length){const li=document.createElement('li');li.textContent='削除できる配送情報はありません。';ul.append(li);return;}
 for(const sale of delivery){const customer=selectedCustomers.find(c=>c.orderId===sale.orderId);const li=document.createElement('li');const span=document.createElement('span');span.textContent=sale.orderId+'｜'+(customer?.shipping?.name||customer?.buyerName||'')+'（要：発送済み確認）';
 const btn=document.createElement('button');btn.type='button';btn.className='delete';btn.textContent='個人情報を削除';
 btn.onclick=async()=>{
  if(busy)return;
  if(!confirm('この注文は発送済みですか？\n'+sale.orderId+'\n氏名・住所・電話番号・メールがFirebaseから消え、復元できません。購入履歴は残ります。'))return;
  const typed=prompt('誤削除防止のため「削除」と入力してください。');if(typed!=='削除')return;
  lock(true);try{await deleteDoc(doc(db,'customerOrders',brand.slug,'orders',sale.orderId));message('個人情報を削除しました。CSVデータを再取得してください。');customers=customers.filter(x=>x.orderId!==sale.orderId);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==sale.orderId);refreshCounts();}catch(err){console.error(err);message('削除に失敗しました：'+(err.message||err),true);}finally{lock(false);}
 };li.append(span,btn);ul.append(li);}
}
async function reload(){if(!owner||busy)return;if($('from').value&&$('to').value&&$('from').value>$('to').value){message('日付の開始・終了が逆です。',true);return;}
 lock(true);message('Firebaseの注文履歴を取得しています…');try{
  const [allCustomers,allSales]=await Promise.all([
   fetchAll(collection(db,'customerOrders',brand.slug,'orders'),'createdAt'),
   fetchAll(collection(db,'brands',owner.uid,'scannedOrders'),'scanTime')
  ]);
  customers=allCustomers.filter(x=>x.brandId===owner.uid);
  sales=allSales.filter(x=>x.brandId===owner.uid);
  selectedCustomers=customers.filter(x=>selectedByDate(dateOf(x.createdAt)));
  selectedSales=sales.filter(x=>selectedByDate(dateOf(x.scanTime)));
  message(`読込完了：登録者 ${customers.length}件・販売記録 ${sales.length}件。対象期間のCSVを保存できます。`);
  refreshCounts();
 }catch(err){console.error(err);message('履歴の取得に失敗しました。認証・Firestoreルールを確認してください：'+(err.message||err),true);}finally{lock(false);}
}
$('load').onclick=reload;
$('mail').onclick=()=>{
 const header=['注文ID','登録日時(JST)','氏名','メールアドレス','メール配信希望','注文状態','予約商品あり'];
 const rows=selectedCustomers.map(c=>[c.orderId,localStamp(dateOf(c.createdAt)),c.buyerName,c.buyerEmail,c.marketingConsent?'はい':'いいえ',receiptState(c.orderId),c.hasPreorder?'はい':'いいえ']);
 writeCsv(nameFor('mailing_list'),header,rows);
};
$('sales').onclick=()=>{
 const header=['注文ID','QR読取日時(JST)','状態','商品ID','商品名','バリエーションコード','バリエーション名','数量','商品単価(税込)','商品行小計(税込)','注文合計(税込・送料含む)','送料(税込)','予約商品'];
 const rows=[];for(const s of selectedSales.filter(x=>x.status==='handedOff'))(s.remainingLines||[]).forEach((line,i)=>{rows.push([s.orderId,localStamp(dateOf(s.scanTime)),'受付完了',line.id,line.name,line.variant||'',line.variantName||'',line.qty,line.unitPrice,line.unitPrice*line.qty,i===0?s.amount:'',i===0?(s.shippingFee||0):'',line.preorder?'はい':'いいえ']);});
 writeCsv(nameFor('purchased_items'),header,rows);
};
$('shipping').onclick=()=>{
 const header=['注文ID','QR読取日時(JST)','予約商品ID','商品名','バリエーション','数量','郵便番号','住所','お届け先氏名','電話番号','注文合計(税込)','送料(税込)','送料区分'];
 const info=new Map(customers.map(c=>[c.orderId,c]));const rows=[];
 for(const s of selectedSales.filter(x=>x.status==='handedOff'&&x.hasPreorder)){
  const c=info.get(s.orderId);if(!c)continue;
  let first=true;for(const line of s.remainingLines||[]){if(!line.preorder)continue;
   rows.push([s.orderId,localStamp(dateOf(s.scanTime)),line.id,line.name,line.variantName||line.variant||'',line.qty,c.shipping?.postal?"'"+c.shipping.postal:'',c.shipping?.address||'',c.shipping?.name||'',c.shipping?.phone?"'"+c.shipping.phone:'',first?s.amount:'',first?(s.shippingFee||0):'',(s.shippingFee||0)>0?'送料お客様負担':'送料当社負担']);first=false;}
 }
 writeCsv(nameFor('shipping_private'),header,rows);
};
if(!['apiKey','authDomain','projectId','appId'].every(k=>cfgValue(k)))message('Firebase設定がありません。',true);
function cfgValue(k){return typeof firebase[k]==='string'&&firebase[k].length>0;}
onAuthStateChanged(getAuth(app),async user=>{
 if(!user){location.replace('./login.html');return;}
 try{const docSnap=await getDoc(doc(db,'brands',user.uid));if(!docSnap.exists()||docSnap.data().ownerUid!==user.uid)throw Error('管理権限がありません。');owner=user;brand=docSnap.data();$('brand-state').textContent=`${brand.displayName}｜管理者のみ閲覧可能`;lock(false);await reload();}
 catch(err){console.error(err);message('ブランド情報を取得できません：'+(err.message||err),true);}
});
