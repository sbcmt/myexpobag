/** MY EXPO BAG v1.0.1 — brand-owned product/category management (not yet public). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const firebase=window.MEB_FIREBASE_CONFIG||{};
const loginUrl=new URL('./login.html',location.href).href;
const brandSetupUrl=new URL('./brand-setup.html',location.href).href;
const maxProducts=300;
let db,user=null,brand=null,products=new Map(),categories=[],importData=null,busy=false;
let pendingImage=null,imageProcessing=false,imageRevision=0,imagesReady=[],imageKnown=new Set();
const coll=()=>collection(db,'brands',user.uid,'products');
const prodRef=id=>doc(db,'brands',user.uid,'products',id);
const catRef=()=>doc(db,'brands',user.uid,'catalogSettings','main');
const imageRef=id=>doc(db,'brands',user.uid,'productImages',id);
const trim=v=>String(v??'').trim();
const yen=n=>'¥'+Number(n).toLocaleString('ja-JP');
function status(message,error=false){const e=$('status');e.textContent=message;e.className='status'+(error?' error':'');e.hidden=false;}
function setBusy(flag){busy=flag;for(const id of ['product-save','import-save','images-save'])$(id).disabled=flag||imageProcessing||(id==='import-save'&&!importData)||(id==='images-save'&&!imagesReady.length);if(user)categoryOptions();}
function money(value,label,optional=false){
 const v=trim(value);if(optional&&v==='')return null;
 if(!/^\d{1,9}$/.test(v)||Number(v)>100000000)throw Error(label+'は0〜100,000,000の整数で入力してください。');
 return Number(v);
}
// Images are isolated from product documents so product list reads stay small.
// Uploaded originals (<=15 MB) are converted in the browser to <=80 KiB each.
const IMAGE_DATA_LIMIT=109200; // data URI characters: roughly 80 KiB of image bytes
const MAX_ORIGINAL_IMAGE_BYTES=15*1024*1024;
function imagePreview(data){
 const img=$('product-image-preview');img.hidden=!data;
 if(data){img.src=data;img.alt='商品画像のプレビュー';}
 else img.removeAttribute('src');
}
function imageFormatOK(f){return /\.(?:jpe?g|png|webp|heic|heif)$/i.test(f.name||'') || /^image\/(?:jpe?g|png|webp|heic|heif)$/i.test(f.type||'');}
async function compressImage(file){
 if(!imageFormatOK(file))throw Error('画像はJPG・PNG・WebP・HEIC/HEIFから選択してください。');
 if(!file.size||file.size>MAX_ORIGINAL_IMAGE_BYTES)throw Error('元画像は1枚15MB以内にしてください。');
 const objectUrl=URL.createObjectURL(file);let bitmap;
 try{
  let photo;
  try{photo=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('画像形式を読み取れませんでした。'));img.src=objectUrl;});}
  catch(error){if(typeof createImageBitmap==='function'){try{bitmap=await createImageBitmap(file);photo=bitmap;}catch(_){/* unsupported */}}
   if(!photo)throw Error('画像を開けませんでした。iPhoneの場合は写真をJPEGで書き出して再度お試しください。');
  }
  const width=photo.naturalWidth||photo.width,height=photo.naturalHeight||photo.height;
  if(!width||!height)throw Error('画像のサイズを確認できませんでした。');
  for(const maxSide of [800,720,640,560,480,400,320]){
   const scale=Math.min(1,maxSide/Math.max(width,height));
   const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('画像処理に対応していないブラウザです。');
   // White product-photo background keeps transparent PNGs predictable in JPEG fallback.
   ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(photo,0,0,w,h);
   for(const mime of ['image/webp','image/jpeg']){
    for(const quality of [.83,.72,.60,.50,.40,.30]){
     const data=canvas.toDataURL(mime,quality);
     // Safari may silently encode a different image type: detect it.
     if(data.startsWith('data:'+mime+';base64,')&&data.length<=IMAGE_DATA_LIMIT)return data;
    }
   }
  }
  throw Error('80KB以下へ変換できませんでした。別の画像を試してください。');
 }finally{bitmap?.close?.();URL.revokeObjectURL(objectUrl);}
}
async function onImageSelected(){
 const file=$('product-image').files?.[0],revision=++imageRevision;
 pendingImage=null;imagePreview('');if(!file){$('product-image-hint').textContent='未選択の場合、登録済み画像は変更しません。';return;}
 imageProcessing=true;setBusy(busy);$('product-image-hint').textContent='画像を自動圧縮しています…';
 try{const data=await compressImage(file);if(revision!==imageRevision)return;
  pendingImage=data;imagePreview(data);$('product-image-hint').textContent='保存画像：約'+Math.ceil((data.length-data.indexOf(',')-1)*3/4/1024)+'KB ／ 「商品を保存」で画像も登録';
 }catch(err){if(revision===imageRevision){$('product-image-hint').textContent='画像は未選択です。';$('product-image').value='';status(err.message,true);}}
 finally{if(revision===imageRevision){imageProcessing=false;setBusy(busy);}}
}
async function loadSavedImage(id,revision){
 $('product-image-hint').textContent='登録済み画像を確認しています…';imagePreview('');
 try{
  const snap=await getDoc(imageRef(id));if(revision!==imageRevision)return;
  const data=snap.exists()?snap.data().imageData:'';
  imagePreview(typeof data==='string'&&/^data:image\/(webp|jpeg);base64,/.test(data)?data:'');
  $('product-image-hint').textContent=snap.exists()?'登録済み画像あり。画像を選び直すと上書きされます。':'画像未登録。画像を選択して保存できます。';
  if(snap.exists())imageKnown.add(id);
 }catch(error){if(revision===imageRevision)$('product-image-hint').textContent='登録済み画像の確認に失敗しました。';}
}
function clearImagesPreview(){imagesReady=[];$('images-save').disabled=true;$('images-preview').hidden=true;$('images-preview').replaceChildren();$('images-count').textContent='';}
function imageBulkCheck(){
 clearImagesPreview();
 const files=Array.from($('images-import').files||[]);if(!files.length)return;
 if(files.length>50){status('画像は1回50枚まで選択してください。',true);return;}
 let accepted=[];const errors=[],ids=new Set(),duplicates=new Set();
 for(const f of files){
  const m=f.name.match(/^(.+)\.(jpg|jpeg|png|webp|heic|heif)$/i);
  if(!m){errors.push(f.name+'：画像形式が対象外');continue;}
  const id=m[1];
  if(!products.has(id)){errors.push(f.name+'：商品ID「'+id+'」が未登録（大文字・小文字も一致が必要）');continue;}
  if(ids.has(id)){duplicates.add(id);errors.push(f.name+'：同じIDの画像が複数あります');continue;}
  if(f.size>MAX_ORIGINAL_IMAGE_BYTES){errors.push(f.name+'：15MBを超えています');continue;}
  ids.add(id);accepted.push({id,file:f});
 }
 accepted=accepted.filter(e=>!duplicates.has(e.id));
 if(duplicates.size)for(const id of duplicates)errors.push(id+'：重複しているため同IDの画像はすべて除外しました');
 imagesReady=accepted;
 const box=$('images-preview');
 for(const item of accepted){const line=document.createElement('div');line.textContent='✓ '+item.id+' ← '+item.file.name;box.append(line);}
 for(const reason of errors){const line=document.createElement('div');line.style.color='#a4342c';line.textContent='× '+reason;box.append(line);}
 box.hidden=false;$('images-count').textContent=accepted.length+'枚登録可能'+(errors.length?'／'+errors.length+'枚は除外':'');
 $('images-save').disabled=!accepted.length||busy;
 if(errors.length)status('画像名と商品IDが一致しないファイルなどを除外しました。下の一覧をご確認ください。',true);
}
async function saveBulkImages(){
 if(busy||!imagesReady.length)return;
 const toSave=imagesReady.slice();if(!confirm(toSave.length+'件の画像を商品IDに紐づけて保存しますか？既存画像は上書きします。'))return;
 setBusy(true);let ok=0;const errors=[];
 try{
  for(const entry of toSave){
   status('画像を保存中… '+(ok+errors.length+1)+' / '+toSave.length+'（'+entry.id+'）');
   try{
    const data=await compressImage(entry.file);
    const batch=writeBatch(db);batch.set(imageRef(entry.id),{productId:entry.id,imageData:data,updatedAt:serverTimestamp()});
    await batch.commit();imageKnown.add(entry.id);ok++;
   }catch(error){console.error(error);errors.push(entry.id+'：'+(error.message||'保存失敗'));}
  }
  if(!errors.length){$('images-import').value='';clearImagesPreview();status(ok+'件の商品画像を保存しました。');}
  else{imagesReady=toSave.filter(e=>errors.some(v=>v.startsWith(e.id+'：')));$('images-count').textContent='失敗した'+imagesReady.length+'件は再試行できます';$('images-save').disabled=false;status(ok+'件保存、'+errors.length+'件失敗。\n'+errors.slice(0,5).join('\n'),true);}
 }finally{setBusy(false);}
}
function parseVariants(value){
 const input=trim(value);if(!input)return [];
 const entries=input.split('|').map(v=>trim(v)).filter(Boolean);
 if(entries.length>20)throw Error('カラーは20種類以内にしてください。');
 const used=new Set();
 return entries.map(item=>{
  const i=item.indexOf(':');if(i<1)throw Error('カラーは「BK:ブラック | WH:ホワイト」の形式で入力してください。');
  const code=trim(item.slice(0,i)).toUpperCase(),name=trim(item.slice(i+1));
  if(!/^[A-Z0-9_-]{1,16}$/.test(code)||!name||name.length>40||used.has(code))throw Error('カラーコード・名前の形式、または重複を確認してください。');
  used.add(code);return {code,name};
 });
}
function productOf(fields){
 const id=trim(fields.id),name=trim(fields.name),categoryName=trim(fields.categoryName);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(id))throw Error('商品IDは半角英数字で始まる40文字以内の英数字・-・_にしてください。');
 if(!name||name.length>100)throw Error(id+'：商品名は1〜100文字で入力してください。');
 if(!categoryName||categoryName.length>40)throw Error(id+'：カテゴリは1〜40文字で入力してください。');
 const price=money(fields.price,id+'の通常価格'),eventPrice=money(fields.eventPrice,id+'の展示会価格',true);
 if(eventPrice!==null&&eventPrice>=price)throw Error(id+'：展示会価格は通常価格より小さくしてください。');
 const variants=Array.isArray(fields.variants)?fields.variants:parseVariants(fields.colors);
 if(variants.length>20)throw Error('カラーは20種類までです。');
 return {id,name,categoryName,price,eventPrice,variants,active:fields.active!==false};
}
function inputData(){return productOf({id:$('product-id').value,name:$('product-name').value,categoryName:$('product-category').value,price:$('product-price').value,eventPrice:$('product-event-price').value,colors:$('product-colors').value,active:$('product-active').checked});}
function categoryOptions(){
 $('categories').replaceChildren();$('category-options').replaceChildren();$('category-count').textContent=categories.length+'件';
 if(!categories.length){const p=document.createElement('p');p.className='muted';p.textContent='カテゴリは未登録です。';$('categories').append(p);}
 for(const name of categories){
  const dat=document.createElement('option');dat.value=name;$('category-options').append(dat);
  const item=document.createElement('span');item.className='cat';item.append(document.createTextNode(name));
  const btn=document.createElement('button');btn.type='button';btn.textContent='×';btn.title=name+'を削除';btn.disabled=[...products.values()].some(p=>p.categoryName===name)||busy;
  btn.addEventListener('click',()=>removeCategory(name));item.append(btn);$('categories').append(item);
 }
}
function productList(){
 $('product-count').textContent=products.size;
 const box=$('product-list');box.replaceChildren();
 if(!products.size){const p=document.createElement('p');p.className='muted';p.textContent='商品はまだ登録されていません。';box.append(p);return;}
 for(const p of [...products.values()].sort((a,b)=>a.id.localeCompare(b.id,'ja'))){
  const row=document.createElement('div');row.className='product';
  const info=document.createElement('div');info.className='product-info';
  const name=document.createElement('div');name.className='product-name';name.textContent=p.name+(p.active===false?'（非表示）':'');
  const meta=document.createElement('div');meta.className='product-meta';meta.textContent=[p.id,p.categoryName,yen(p.price),p.eventPrice!==null&&p.eventPrice!==undefined?'展示会 '+yen(p.eventPrice):'',(p.variants||[]).length?'カラー '+p.variants.length+'種':''].filter(Boolean).join(' ／ ');
  info.append(name,meta);const edit=document.createElement('button');edit.type='button';edit.textContent='編集';edit.addEventListener('click',()=>editProduct(p.id));
  const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='削除';del.addEventListener('click',()=>deleteProduct(p.id));
  row.append(info,edit,del);box.append(row);
 }
}
function render(){categoryOptions();productList();}
function editProduct(id){
 const p=products.get(id);if(!p)return;
 $('product-id').value=p.id;$('product-id').readOnly=true;$('product-name').value=p.name;
 $('product-category').value=p.categoryName;$('product-price').value=p.price;$('product-event-price').value=p.eventPrice??'';
 $('product-colors').value=(p.variants||[]).map(v=>v.code+':'+v.name).join(' | ');$('product-active').checked=p.active!==false;
 pendingImage=null;$('product-image').value='';loadSavedImage(id,++imageRevision);
 $('edit-note').textContent='編集中：'+p.id+'（商品IDは変更できません）';$('product-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function clearForm(){ ++imageRevision;pendingImage=null;imageProcessing=false;$('product-form').reset();$('product-id').readOnly=false;$('product-active').checked=true;$('edit-note').textContent='新規登録';imagePreview('');$('product-image-hint').textContent='未選択の場合、登録済み画像は変更しません。';setBusy(busy);}
function toFirestore(p,original){return {...p,createdAt:original?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()};}
async function saveProduct(event){
 event.preventDefault();if(busy||imageProcessing||!user)return;
 let p;try{p=inputData();}catch(err){status(err.message,true);return;}
 if(!products.has(p.id)&&products.size>=maxProducts){status('登録上限300商品です。',true);return;}
 const nextCategories=categories.includes(p.categoryName)?categories:[...categories,p.categoryName];
 if(nextCategories.length>80){status('カテゴリは80件以内にしてください。',true);return;}
 setBusy(true);
 try{
  const batch=writeBatch(db);batch.set(prodRef(p.id),toFirestore(p,products.get(p.id)));
  if(pendingImage)batch.set(imageRef(p.id),{productId:p.id,imageData:pendingImage,updatedAt:serverTimestamp()});
  if(nextCategories.length!==categories.length)batch.set(catRef(),{categories:nextCategories,updatedAt:serverTimestamp()});
  await batch.commit();const imageWasSaved=!!pendingImage;if(imageWasSaved)imageKnown.add(p.id);products.set(p.id,{...products.get(p.id),...p});categories=nextCategories;render();clearForm();status('「'+p.name+'」を'+(imageWasSaved?'画像とともに':'')+'保存しました。');
 }catch(err){console.error(err);status('保存できませんでした。認証・Firestoreルール・通信環境をご確認ください。',true);}finally{setBusy(false);}
}
async function addCategory(event){
 event.preventDefault();if(busy)return;
 const name=trim($('new-category').value);if(!name||name.length>40){status('カテゴリ名は1〜40文字で入力してください。',true);return;}
 if(categories.includes(name)){status('このカテゴリは登録済みです。',true);return;}
 if(categories.length>=80){status('カテゴリは80件以内にしてください。',true);return;}
 setBusy(true);try{const next=[...categories,name];const batch=writeBatch(db);batch.set(catRef(),{categories:next,updatedAt:serverTimestamp()});await batch.commit();categories=next;render();$('new-category').value='';status('カテゴリを追加しました。');}
 catch(err){console.error(err);status('カテゴリを保存できませんでした。',true);}finally{setBusy(false);}
}
async function removeCategory(name){
 if(busy||[...products.values()].some(p=>p.categoryName===name))return;
 if(!confirm('「'+name+'」を削除しますか？'))return;
 setBusy(true);try{const next=categories.filter(v=>v!==name);const batch=writeBatch(db);batch.set(catRef(),{categories:next,updatedAt:serverTimestamp()});await batch.commit();categories=next;render();status('カテゴリを削除しました。');}
 catch(err){status('カテゴリの削除に失敗しました。',true);}finally{setBusy(false);}
}
async function deleteProduct(id){
 if(busy)return;const p=products.get(id);if(!p||!confirm('「'+p.name+'（'+id+'）」を削除しますか？'))return;
 setBusy(true);try{const batch=writeBatch(db);batch.delete(prodRef(id));batch.delete(imageRef(id));await batch.commit();products.delete(id);imageKnown.delete(id);render();if($('product-id').value===id)clearForm();status('商品を削除しました。');}
 catch(err){console.error(err);status('商品を削除できませんでした。',true);}finally{setBusy(false);}
}
function csvCells(text,delimiter){
 const rows=[];let row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quote){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quote=false;else cell+=c;}
  else if(c==='"'){if(cell!=='')throw Error('CSVの引用符が不正です。');quote=true;}
  else if(c===delimiter){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quote)throw Error('CSVの引用符が閉じていません。');row.push(cell);if(row.some(x=>x!==''))rows.push(row);return rows;
}
function parseFile(text,filename){
 const src=text.replace(/^\uFEFF/,'');const delimiter=/\.tsv$/i.test(filename)?'\t':(src.split(/\r?\n/,1)[0].includes('\t')?'\t':',');
 const rows=csvCells(src,delimiter);if(rows.length<2)throw Error('ヘッダーと商品データが必要です。');
 const normalize=s=>trim(s).toLowerCase().replace(/[\s_]/g,'');
 const aliases={id:['商品id','id','sku','商品コード'],name:['商品名','name'],categoryName:['カテゴリ','カテゴリー','category'],price:['通常価格','価格','price'],eventPrice:['展示会価格','展示会限定価格','eventprice'],colors:['カラー','カラーバリエーション','colors','variants'],active:['表示','公開','active','visible']};
 const headings=rows.shift().map(normalize),idx={};
 for(const [key,opts] of Object.entries(aliases))idx[key]=headings.findIndex(h=>opts.map(normalize).includes(h));
 if(['id','name','categoryName','price'].some(key=>idx[key]<0))throw Error('商品ID・商品名・カテゴリ・通常価格の列が必要です。');
 if(rows.length>maxProducts)throw Error('一度に登録できるのは300商品までです。');
 const results=[],used=new Set();for(let i=0;i<rows.length;i++){
  const row=rows[i];const get=key=>idx[key]<0?'':(row[idx[key]]??'');const rawActive=trim(get('active'));
  const active=!['0','false','off','非表示','×','無効'].includes(rawActive.toLowerCase());
  try{
    const p=productOf({id:get('id'),name:get('name'),categoryName:get('categoryName'),price:get('price'),eventPrice:get('eventPrice'),colors:get('colors'),active});
    if(used.has(p.id))throw Error('ファイル内で商品IDが重複しています：'+p.id);
    used.add(p.id);results.push(p);
  }catch(err){throw Error((i+2)+'行目：'+err.message);}
 }
 if(new Set([...categories,...results.map(p=>p.categoryName)]).size>80)throw Error('登録後のカテゴリが80件を超えます。');
 const newIds=results.filter(p=>!products.has(p.id));if(products.size+newIds.length>maxProducts)throw Error('ブランドの商品登録上限300件を超えます。');
 return results;
}
async function fileChanged(){
 importData=null;$('import-save').disabled=true;$('import-preview').hidden=true;
 const f=$('import-file').files?.[0];if(!f)return;
 if(f.size>2*1024*1024){status('ファイルは2MB以内にしてください。',true);return;}
 try{const rows=parseFile(await f.text(),f.name);importData=rows;
  const box=$('import-preview');box.replaceChildren();
  const h=document.createElement('strong');h.textContent='確認：'+rows.length+'商品（新規 '+rows.filter(p=>!products.has(p.id)).length+'件、上書き '+rows.filter(p=>products.has(p.id)).length+'件）';box.append(h);
  rows.slice(0,12).forEach(p=>{const d=document.createElement('div');d.textContent=p.id+' ／ '+p.name+' ／ '+p.categoryName+' ／ '+yen(p.price)+(p.eventPrice!==null?' → '+yen(p.eventPrice):'');box.append(d);});
  if(rows.length>12){const d=document.createElement('div');d.textContent='ほか '+(rows.length-12)+'件';box.append(d);}
  box.hidden=false;$('import-save').disabled=false;status('内容を確認しました。間違いがなければ「確認した商品を登録」を押してください。');
 }catch(err){status(err.message,true);}
}
async function importProducts(){
 if(!importData||busy)return;
 const rows=importData;const newCategories=[...new Set([...categories,...rows.map(p=>p.categoryName)])];
 if(!confirm(rows.length+'商品の登録・上書きを実行しますか？'))return;
 setBusy(true);
 try{const batch=writeBatch(db);
  for(const p of rows)batch.set(prodRef(p.id),toFirestore(p,products.get(p.id)));
  if(newCategories.length!==categories.length)batch.set(catRef(),{categories:newCategories,updatedAt:serverTimestamp()});
  await batch.commit();for(const p of rows)products.set(p.id,{...products.get(p.id),...p});categories=newCategories;
  importData=null;$('import-file').value='';$('import-preview').hidden=true;render();status(rows.length+'商品の一括登録が完了しました。');
 }catch(err){console.error(err);status('一括登録できませんでした。保存内容は更新されていません。',true);}finally{setBusy(false);}
}
const headers=['商品ID','商品名','カテゴリ','通常価格','展示会価格','カラー','表示'];
const sample=[['LT-001','LEDランタン','ランタン',4800,4200,'BK:ブラック | KH:カーキ','表示'],['BG-002','キャンバスバッグ','バッグ',3200,'','','表示']];
function cell(v,sep){const s=String(v??'');return sep==='\t'?s.replace(/[\t\r\n]+/g,' '):'"'+s.replace(/"/g,'""')+'"';}
function downloadFile(name,rows,delimiter){const csv='\uFEFF'+rows.map(row=>row.map(v=>cell(v,delimiter)).join(delimiter)).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:delimiter==='\t'?'text/tab-separated-values;charset=utf-8':'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function exportProducts(){const rows=[headers,...[...products.values()].sort((a,b)=>a.id.localeCompare(b.id,'ja')).map(p=>[p.id,p.name,p.categoryName,p.price,p.eventPrice??'',(p.variants||[]).map(v=>v.code+':'+v.name).join(' | '),p.active===false?'非表示':'表示'])];downloadFile('myexpobag_products.csv',rows,',');}
async function refresh(){if(!user)return;try{
 const [catSnap,prodSnap]=await Promise.all([getDoc(catRef()),getDocs(coll())]);
 categories=catSnap.exists()&&Array.isArray(catSnap.data().categories)?catSnap.data().categories.filter(x=>typeof x==='string'):[];
 products=new Map(prodSnap.docs.map(snapshot=>[snapshot.id,snapshot.data()]));render();return true;
 }catch(err){console.error(err);status('商品情報を読み込めませんでした。Firestoreルールをご確認ください。',true);return false;}}
$('product-form').addEventListener('submit',saveProduct);$('product-clear').addEventListener('click',clearForm);
$('product-image').addEventListener('change',onImageSelected);
$('images-import').addEventListener('change',imageBulkCheck);$('images-save').addEventListener('click',saveBulkImages);
$('category-form').addEventListener('submit',addCategory);$('refresh-products').addEventListener('click',async()=>{if(await refresh())status('登録情報を更新しました。');});
$('import-file').addEventListener('change',fileChanged);$('import-save').addEventListener('click',importProducts);
$('download-csv').addEventListener('click',()=>downloadFile('myexpobag_template.csv',[headers,...sample],','));
$('download-tsv').addEventListener('click',()=>downloadFile('myexpobag_template.tsv',[headers,...sample],'\t'));
$('export-csv').addEventListener('click',exportProducts);
const configured=['apiKey','authDomain','projectId','appId'].every(k=>typeof firebase[k]==='string'&&firebase[k].trim());
if(!configured){$('loading').textContent='Firebaseの接続設定がありません。';document.documentElement.classList.remove('auth-pending');}
else try{
 const app=getApps().length?getApp():initializeApp(firebase);db=getFirestore(app);const auth=getAuth(app);
 onAuthStateChanged(auth,async u=>{
  if(!u){location.replace(loginUrl);return;}
  try{const snap=await getDoc(doc(db,'brands',u.uid));if(!snap.exists()){location.replace(brandSetupUrl);return;}
   const b=snap.data();if(b.ownerUid!==u.uid||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug))throw Error('brand mismatch');
   user=u;brand=b;$('brand-label').textContent=b.displayName+'　｜　v1.0.1';await refresh();$('loading').hidden=true;$('shell').hidden=false;document.documentElement.classList.remove('auth-pending');
  }catch(err){console.error(err);$('loading').textContent='ブランド情報を読み込めません。Firestoreルールをご確認ください。';document.documentElement.classList.remove('auth-pending');}
 },()=>{$('loading').textContent='ログイン情報を確認できませんでした。';document.documentElement.classList.remove('auth-pending');});
}catch(err){$('loading').textContent='Firebaseを読み込めませんでした。';document.documentElement.classList.remove('auth-pending');}
