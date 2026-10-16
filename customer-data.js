/** MY EXPO BAG v1.0.1 — Owner-only paginated CSV exports (no third-party API). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,orderBy,limit,startAfter,deleteDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id),firebase=window.MEB_FIREBASE_CONFIG||{};
const app=getApps().length?getApp():initializeApp(firebase),db=getFirestore(app);
let owner=null,brand=null,busy=false,customers=[],sales=[],selectedCustomers=[],selectedSales=[];
function message(value,failed=false){$('status').textContent=value;$('status').classList.toggle('error',failed);}
function lock(flag){
 busy=flag;
 ['load','mail','sales','shipping','shipping-xlsx'].forEach(id=>$(id).disabled=flag||!owner);
 for(const [type,selectId,deleteId] of [['customer','select-customers','delete-customers'],['sale','select-sales','delete-sales']]){
  const eligible=type==='customer'?selectedCustomers.length:selectedSales.filter(x=>['handedOff','cancelled'].includes(x.status)).length;
  $(selectId).disabled=flag||!owner||eligible===0;
  $(deleteId).disabled=flag||!owner||historyPicked(type).length===0;
 }
}
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
function nameFor(type,ext='csv'){return `MY_EXPO_BAG_${brand.slug}_${type}_${localDate(new Date()).replaceAll('-','')}.${ext}`;}
const receiptState=id=>sales.find(s=>s.orderId===id)?.status||'QR発行済み（未受付）';
function renderHistory(){
 // Status and count are scoped to the selected JST date range; do not change other periods.
 const configs=[
  {data:selectedCustomers,id:'customer-history',className:'registration-select',select:'select-customers',del:'delete-customers',count:'customer-selection-count',type:'customer'},
  {data:selectedSales,id:'sales-history',className:'sale-select',select:'select-sales',del:'delete-sales',count:'sales-selection-count',type:'sale'}
 ];
 for(const cfg of configs){
  const ul=$(cfg.id);ul.replaceChildren();let available=0;
  for(const rec of cfg.data){
   const eligible=cfg.type==='customer'||['handedOff','cancelled'].includes(rec.status);
   if(eligible)available++;
   const li=document.createElement('li');if(!eligible)li.className='blocked';
   const cb=document.createElement('input');cb.type='checkbox';cb.className=cfg.className;cb.value=rec.orderId||rec.id;
   cb.disabled=!eligible;cb.setAttribute('aria-label',(rec.orderId||rec.id)+' を削除対象に選択');
   const info=document.createElement('span');
   info.textContent=cfg.type==='customer'?(rec.orderId||rec.id)+'｜'+(rec.buyerName||rec.shipping?.name||'氏名未登録')+(rec.deliverySubmitted?'｜配送先登録済み':''):
     (rec.orderId||rec.id)+'｜'+({handedOff:'お渡し済み',cancelled:'取消済み',reserved:'在庫確保中'}[rec.status]||rec.status||'不明')+'｜'+(Number(rec.amount||0)).toLocaleString('ja-JP')+'円';
   if(!eligible){const t=document.createElement('small');t.textContent='（処理中のため削除不可）';info.append(t);}
   li.append(cb,info);ul.append(li);
  }
  if(!cfg.data.length){const li=document.createElement('li');li.textContent='該当する履歴はありません。';ul.append(li);}
  $(cfg.select).disabled=busy||!owner||available===0;
  const picked=ul.querySelectorAll('input:checked').length;
  $(cfg.del).disabled=busy||!owner||!picked;
  $(cfg.count).textContent=available+'件が選択可能／選択中：'+picked+'件';
 }
}
function historyPicked(type){return [...document.querySelectorAll(type==='customer'?'.registration-select:checked':'.sale-select:checked')].map(x=>x.value);}
for(const [type,sel,del] of [['customer','select-customers','delete-customers'],['sale','select-sales','delete-sales']]){
 $(sel).addEventListener('click',()=>{
  const cl=type==='customer'?'.registration-select:not(:disabled)':'.sale-select:not(:disabled)';
  const all=[...document.querySelectorAll(cl)];const isAll=all.every(cb=>cb.checked);
  all.forEach(cb=>cb.checked=!isAll);
  refreshHistorySelection();
 });
 $(del).addEventListener('click',()=>deleteHistory(type));
}
function refreshHistorySelection(){
 for(const [type,del,count] of [['customer','delete-customers','customer-selection-count'],['sale','delete-sales','sales-selection-count']]){
  const available=type==='customer'?selectedCustomers.length:selectedSales.filter(x=>['handedOff','cancelled'].includes(x.status)).length;
  const picked=historyPicked(type).length;
  $(del).disabled=busy||!owner||picked===0;
  $(count).textContent=available+'件が選択可能／選択中：'+picked+'件';
 }
}
$('customer-history').addEventListener('change',refreshHistorySelection);
$('sales-history').addEventListener('change',refreshHistorySelection);
async function deleteHistory(type){
 if(busy||!owner||!brand)return;
 const ids=historyPicked(type);if(!ids.length)return;
 const isCustomer=type==='customer';
 if(!isCustomer){
  const valid=new Set(selectedSales.filter(x=>['handedOff','cancelled'].includes(x.status)).map(x=>x.orderId));
  if(ids.some(id=>!valid.has(id))){message('進行中の販売記録は削除できません。',true);return;}
 }
 const description=isCustomer?'登録者・配送先データ':'販売履歴';
 const warning=isCustomer?'未対応注文の本人確認・配送情報登録ができなくなる場合があります。':'売上履歴から消えます。在庫は元に戻りません。QRの公開確認情報は再利用防止のため残ります。';
 if(!confirm(description+' '+ids.length+'件をFirebaseから完全に削除します。\n'+warning+'\n復元できません。続けますか？'))return;
 const phrase=ids.length+'件削除';if(prompt('誤操作防止：'+phrase+' と入力してください。')!==phrase)return;
 lock(true);let done=0;const errors=[];
 try{
  for(const id of ids){
   try{
    await deleteDoc(isCustomer?doc(db,'customerOrders',brand.slug,'orders',id):doc(db,'brands',owner.uid,'scannedOrders',id));
    done++;
    if(isCustomer){customers=customers.filter(x=>x.orderId!==id);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==id);}
    else{sales=sales.filter(x=>x.orderId!==id);selectedSales=selectedSales.filter(x=>x.orderId!==id);}
   }catch(err){errors.push(id+'：'+(err.message||err));}
  }
  refreshCounts();
  message(description+' '+done+'件を削除しました。'+(errors.length?'\n失敗：'+errors.join('\n'):'')+'\n期間中の集計とCSV出力に反映されています。',errors.length>0);
 }finally{lock(false);refreshCounts();}
}
function refreshCounts(){
 const handed=selectedSales.filter(x=>x.status==='handedOff');
 const delivery=handed.filter(x=>x.hasPreorder&&customers.some(y=>y.orderId===x.orderId&&y.deliverySubmitted===true));
 $('count').textContent=`登録者：${selectedCustomers.filter(c=>c.registered===true).length}件 ／ 完了注文：${handed.length}件 ／ 配送対象：${delivery.length}件`;
 const ul=$('deletable');ul.replaceChildren();$('select-delivery').disabled=!delivery.length;$('delete-selected').disabled=!delivery.length;
 if(!delivery.length){const li=document.createElement('li');li.textContent='削除できる配送情報はありません。';ul.append(li);renderHistory();return;}
 for(const sale of delivery){const customer=selectedCustomers.find(c=>c.orderId===sale.orderId);const li=document.createElement('li');const span=document.createElement('span');span.textContent=sale.orderId+'｜'+(customer?.shipping?.name||customer?.buyerName||'')+'（要：発送済み確認）';
 const check=document.createElement('input');check.type='checkbox';check.className='delivery-select';check.value=sale.orderId;check.setAttribute('aria-label',sale.orderId+' を一括削除対象に選択');check.style.width='18px';check.style.height='18px';li.append(check);
 const btn=document.createElement('button');btn.type='button';btn.className='delete';btn.textContent='個人情報を削除';
 btn.onclick=async()=>{
  if(busy)return;
  if(!confirm('この注文は発送済みですか？\n'+sale.orderId+'\n氏名・住所・電話番号・メールがFirebaseから消え、復元できません。購入履歴は残ります。'))return;
  const typed=prompt('誤削除防止のため「削除」と入力してください。');if(typed!=='削除')return;
  lock(true);try{await deleteDoc(doc(db,'customerOrders',brand.slug,'orders',sale.orderId));message('個人情報を削除しました。CSVデータを再取得してください。');customers=customers.filter(x=>x.orderId!==sale.orderId);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==sale.orderId);refreshCounts();}catch(err){console.error(err);message('削除に失敗しました：'+(err.message||err),true);}finally{lock(false);}
 };li.append(span,btn);ul.append(li);}
 renderHistory();
}
$('select-delivery').onclick=()=>{const checks=[...document.querySelectorAll('.delivery-select')];const all=checks.every(c=>c.checked);checks.forEach(c=>c.checked=!all);};
$('delete-selected').onclick=async()=>{
 if(busy||!owner)return;
 const ids=[...document.querySelectorAll('.delivery-select:checked')].map(c=>c.value);
 if(!ids.length){message('削除する発送済み注文を選択してください。',true);return;}
 if(!confirm('選択した'+ids.length+'件はすべて発送済みですか？\nFirebaseの氏名・住所・電話番号・メールが削除され、元に戻せません。\n購入履歴は残ります。'))return;
 if(prompt('誤削除防止のため「'+ids.length+'件削除」と入力してください。')!==ids.length+'件削除')return;
 lock(true);let done=0;const errors=[];
 try{
  for(const id of ids){
   try{await deleteDoc(doc(db,'customerOrders',brand.slug,'orders',id));done++;customers=customers.filter(x=>x.orderId!==id);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==id);}
   catch(err){errors.push(id+'：'+(err.message||err));}
  }
  refreshCounts();message(done+'件の個人情報を削除しました。'+(errors.length?'\n失敗：'+errors.join('\n'):'') ,!!errors.length);
 }finally{lock(false);}
};
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
 const rows=selectedCustomers.filter(c=>c.registered===true).map(c=>[c.orderId,localStamp(dateOf(c.createdAt)),c.buyerName,c.buyerEmail,c.marketingConsent?'はい':'いいえ',receiptState(c.orderId),c.hasPreorder?'はい':'いいえ']);
 writeCsv(nameFor('mailing_list'),header,rows);
};
$('sales').onclick=()=>{
 const header=['注文ID','QR読取日時(JST)','状態','商品ID','商品名','バリエーションコード','バリエーション名','数量','商品単価(税込)','商品行小計(税込)','商品合計(税込・送料別)','送料(税込)','請求合計(税込・送料含む)','予約商品'];
 const rows=[];for(const s of selectedSales.filter(x=>x.status==='handedOff'))(s.remainingLines||[]).forEach((line,i)=>{rows.push([s.orderId,localStamp(dateOf(s.scanTime)),'受付完了',line.id,line.name,line.variant||'',line.variantName||'',line.qty,line.unitPrice,line.unitPrice*line.qty,i===0?s.amount-(s.shippingFee||0):'',i===0?(s.shippingFee||0):'',i===0?s.amount:'',line.preorder?'はい':'いいえ']);});
 writeCsv(nameFor('purchased_items'),header,rows);
};
const shipHeader=['注文ID','QR読取日時(JST)','予約商品ID','商品名','バリエーション','数量','郵便番号','都道府県','住所','お届け先氏名','電話番号','発送通知メール','商品合計(税込・送料別)','送料(税込)','請求合計(税込・送料含む)','送料区分'];
function shippingRows(){
 const info=new Map(customers.filter(c=>c.deliverySubmitted===true).map(c=>[c.orderId,c]));
 const entries=[];
 for(const sale of selectedSales.filter(x=>x.status==='handedOff'&&x.hasPreorder)){
  const customer=info.get(sale.orderId);if(!customer)continue;
  for(const line of sale.remainingLines||[]){if(!line.preorder)continue;entries.push({sale,customer,line});}
 }
 entries.sort((a,b)=>String(a.line.id).localeCompare(String(b.line.id),'ja',{numeric:true})||a.sale.orderId.localeCompare(b.sale.orderId));
 const seen=new Set();
 return entries.map(({sale:s,customer:c,line})=>{
  const first=!seen.has(s.orderId);seen.add(s.orderId);
  return [s.orderId,localStamp(dateOf(s.scanTime)),line.id,line.name,line.variantName||line.variant||'',line.qty,
    String(c.shipping?.postal||''),c.shipping?.prefecture||'',c.shipping?.address||'',c.shipping?.name||'',String(c.shipping?.phone||''),c.shipping?.email||'',
    first?s.amount-(s.shippingFee||0):'',first?(s.shippingFee||0):'',first?s.amount:'',(s.shippingFee||0)>0?'送料お客様負担':'送料当社負担'];
 });
}
$('shipping').onclick=()=>{
 const rows=shippingRows().map(row=>row.map((v,i)=>(i===6||i===10)&&v?"'"+v:v));
 writeCsv(nameFor('shipping_private'),shipHeader,rows);
};
function excel(type){
 if(!window.XLSX){message('Excel出力ライブラリを読み込めません。ネットワークを確認するかCSVをご利用ください。',true);return;}
 const rows=shippingRows();if(!rows.length){message('対象の配送データがありません。配送先入力とスタッフ対応完了をご確認ください。',true);return;}
 const ws=window.XLSX.utils.aoa_to_sheet([shipHeader,...rows]);
 // Force postal codes and phone numbers to textual Excel cells (leading zeros).
 for(let i=1;i<=rows.length;i++)for(const col of [6,10]){const addr=window.XLSX.utils.encode_cell({r:i,c:col});if(ws[addr]){ws[addr].t='s';ws[addr].v=String(rows[i-1][col]||'');ws[addr].z='@';}}
 ws['!cols']=[{wch:28},{wch:23},{wch:17},{wch:28},{wch:20},{wch:8},{wch:13},{wch:13},{wch:48},{wch:23},{wch:18},{wch:34},{wch:22},{wch:12},{wch:22},{wch:20}];
 const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,ws,'配送先・予約商品ID順');
 try{window.XLSX.writeFile(book,nameFor('shipping_private','xlsx'),{bookType:'xlsx'});}catch(error){console.error(error);message('Excelの出力に失敗しました：'+error.message,true);}
}
$('shipping-xlsx').onclick=()=>excel('xlsx');
if(!['apiKey','authDomain','projectId','appId'].every(k=>cfgValue(k)))message('Firebase設定がありません。',true);
function cfgValue(k){return typeof firebase[k]==='string'&&firebase[k].length>0;}
onAuthStateChanged(getAuth(app),async user=>{
 if(!user){location.replace('./login.html');return;}
 try{const docSnap=await getDoc(doc(db,'brands',user.uid));if(!docSnap.exists()||docSnap.data().ownerUid!==user.uid)throw Error('管理権限がありません。');owner=user;brand=docSnap.data();$('brand-state').textContent=`${brand.displayName}｜管理者のみ閲覧可能`;lock(false);await reload();}
 catch(err){console.error(err);message('ブランド情報を取得できません：'+(err.message||err),true);}
});
