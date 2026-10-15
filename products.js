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
async function imageBulkCheck(){
 clearImagesPreview();const archive=$('images-import').files?.[0];if(!archive)return;
 if(!window.JSZip){status('ZIP読み込みライブラリを読み込めません。インターネット接続を確認してください。',true);return;}
 if(!/\.zip$/i.test(archive.name)||archive.size>50*1024*1024){status('ZIPファイルは50MB以内にしてください。',true);return;}
 imageProcessing=true;setBusy(busy);$('images-count').textContent='ZIPの内容を確認中…';
 try{
  const zip=await window.JSZip.loadAsync(await archive.arrayBuffer());
  const entries=Object.values(zip.files).filter(entry=>!entry.dir&&!/(^|\/)__MACOSX\//.test(entry.name)&&!/(^|\/)\./.test(entry.name));
  if(entries.length>50)throw Error('ZIPに入れられる画像は1回50枚までです。');
  if(!entries.length)throw Error('ZIPに画像がありません。');
  let total=0;const accepted=[],errors=[],seen=new Set(),duplicates=new Set();
  for(const entry of entries){
   const fileName=entry.name.split('/').pop();const match=fileName.match(/^(.+)\.(jpg|jpeg|png|webp|heic|heif)$/i);
   if(!match){errors.push(fileName+'：対応していない形式');continue;}
   const id=match[1];if(!products.has(id)){errors.push(fileName+'：商品ID「'+id+'」が未登録');continue;}
   if(seen.has(id)){duplicates.add(id);errors.push(fileName+'：商品IDが重複しています');continue;}
   seen.add(id);
   const size=entry._data?.uncompressedSize;
   if(!Number.isFinite(size)||size>MAX_ORIGINAL_IMAGE_BYTES||size<=0){errors.push(fileName+'：画像は展開後15MB以内にしてください');continue;}
   total+=size;if(total>150*1024*1024)throw Error('ZIP内の画像容量合計が150MBを超えています。');
   accepted.push({id,entry,fileName});
  }
  imagesReady=accepted.filter(e=>!duplicates.has(e.id));
  const box=$('images-preview');box.replaceChildren();
  for(const item of imagesReady){const el=document.createElement('div');el.textContent='✓ '+item.id+' ← '+item.fileName;box.append(el);}
  for(const error of errors){const el=document.createElement('div');el.style.color='#a4342c';el.textContent='× '+error;box.append(el);}
  box.hidden=false;$('images-count').textContent=imagesReady.length+'画像登録可能'+(errors.length?'／'+errors.length+'件除外':'');
  status(imagesReady.length?'内容を確認しました。保存ボタンで圧縮・登録できます。':'登録可能な画像がありません。',!imagesReady.length);
 }catch(err){clearImagesPreview();status('ZIPの確認に失敗しました：'+err.message,true);}
 finally{imageProcessing=false;setBusy(busy);}
}
async function saveBulkImages(){
 if(busy||!imagesReady.length)return;
 const toSave=imagesReady.slice();if(!confirm(toSave.length+'件の画像を商品IDに紐づけて保存しますか？既存画像は上書きします。'))return;
 setBusy(true);let ok=0;const errors=[];
 try{
  for(const entry of toSave){
   status('画像を保存中… '+(ok+errors.length+1)+' / '+toSave.length+'（'+entry.id+'）');
   try{
    const blob=await entry.entry.async('blob');
    if(blob.size>MAX_ORIGINAL_IMAGE_BYTES)throw Error('展開した画像が15MBを超えています');
    const extension=entry.fileName.split('.').pop().toLowerCase();
    const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'}[extension];
    const file=new File([blob],entry.fileName,{type:mime||'application/octet-stream'});
    const data=await compressImage(file);
    const batch=writeBatch(db);batch.set(imageRef(entry.id),{productId:entry.id,imageData:data,updatedAt:serverTimestamp()});
    await batch.commit();imageKnown.add(entry.id);ok++;
   }catch(error){console.error(error);errors.push(entry.id+'：'+(error.message||'保存失敗'));}
  }
  if(!errors.length){$('images-import').value='';clearImagesPreview();status(ok+'件の商品画像を保存しました。');}
  else{imagesReady=toSave.filter(e=>errors.some(v=>v.startsWith(e.id+'：')));$('images-count').textContent='失敗した'+imagesReady.length+'件は再試行できます';$('images-save').disabled=false;status(ok+'件保存、'+errors.length+'件失敗。\n'+errors.slice(0,5).join('\n'),true);}
 }finally{setBusy(false);}
}
const MAX_VARIANTS=100;
function parseVariants(value){
 const input=trim(value);if(!input)return [];
 const entries=input.split('|').map(v=>trim(v)).filter(Boolean);
 const used=new Set();return entries.map(item=>{const i=item.indexOf(':');if(i<1)throw Error('バリエーションは「BK:ブラック」の形式にしてください。');
  const code=trim(item.slice(0,i)).toUpperCase(),name=trim(item.slice(i+1));
  if(!/^[A-Z0-9_-]{1,25}$/.test(code)||!name||used.has(code))throw Error('サブコードまたは名前を確認してください。');
  used.add(code);return {code,name,price:null,eventPrice:null};
 });
}
function variantRow(values={}){
 const row=document.createElement('div');row.className='variant-entry';row.style.cssText='border-bottom:1px dashed #d7e2e8;padding:8px 0';
 const main=document.createElement('div');main.className='variant-row';
 const make=(label,cls,placeholder,value)=>{const wrap=document.createElement('div');wrap.className='field';const lb=document.createElement('label');lb.textContent=label;const input=document.createElement('input');input.className=cls;input.type='text';input.autocomplete='off';input.placeholder=placeholder;input.value=value??'';wrap.append(lb,input);return wrap;};
 main.append(make('バリエーション名','variant-name','例：ブラック / M',values.name));
 const code=make('サブコード','variant-code','例：LT-001_BK',values.code);code.querySelector('input').maxLength=70;main.append(code);
 const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='danger';remove.addEventListener('click',()=>row.remove());main.append(remove);row.append(main);
 const prices=document.createElement('div');prices.className='cols';prices.append(make('バリエーション通常価格（任意）','variant-price','未設定なら商品価格',values.price));prices.append(make('バリエーション展示会特価（任意）','variant-event-price','未設定なら商品価格',values.eventPrice));row.append(prices);
 return row;
}
function showVariants(variants=[]){
 const root=$('variant-rows');root.replaceChildren();const rows=variants.length?variants:[{},{},{}];
 for(const v of rows)root.append(variantRow(v));
}
function readVariants(id){
 const result=[],codes=new Set();
 for(const el of $('variant-rows').children){
  const name=trim(el.querySelector('.variant-name').value);
  const raw=trim(el.querySelector('.variant-code').value);
  const priceText=trim(el.querySelector('.variant-price').value);
  const eventText=trim(el.querySelector('.variant-event-price').value);
  if(!name&&!raw&&!priceText&&!eventText)continue;
  if(!name||!raw)throw Error('バリエーション名とサブコードはセットで入力してください。');
  if(!raw.startsWith(id+'_'))throw Error('サブコードは「'+id+'_任意コード」の形式にしてください。');
  const code=raw.slice(id.length+1).toUpperCase();
  if(!/^[A-Z0-9_-]{1,25}$/.test(code)||codes.has(code))throw Error('サブコードの形式または重複を確認してください。');
  codes.add(code);
  const price=money(priceText,'バリエーション通常価格',true),eventPrice=money(eventText,'バリエーション展示会価格',true);
  if(price!==null&&eventPrice!==null&&eventPrice>=price)throw Error('バリエーション展示会価格は同じバリエーションの通常価格未満にしてください。');
  result.push({code,name,price,eventPrice});
 }
 if(result.length>MAX_VARIANTS)throw Error('バリエーションは100件以内にしてください。');
 return result;
}
$('add-variant').addEventListener('click',()=>{
 if($('variant-rows').children.length>=MAX_VARIANTS){status('バリエーションは100件以内にしてください。',true);return;}
 const el=variantRow();$('variant-rows').append(el);el.querySelector('.variant-name').focus();
});
showVariants();
function productOf(fields){
 const id=trim(fields.id),name=trim(fields.name),categoryName=trim(fields.categoryName);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(id))throw Error('商品IDは半角英数字で始まる40文字以内の英数字・-・_にしてください。');
 if(!name||name.length>100)throw Error(id+'：商品名は1〜100文字で入力してください。');
 if(!categoryName||categoryName.length>40)throw Error(id+'：カテゴリは1〜40文字で入力してください。');
 const price=money(fields.price,id+'の税込価格'),eventPrice=money(fields.eventPrice,id+'の展示会特価',true);
 if(eventPrice!==null&&eventPrice>=price)throw Error(id+'：展示会特価は税込価格より小さくしてください。');
 const rawVariants=Array.isArray(fields.variants)?fields.variants:parseVariants(fields.colors);
 if(rawVariants.length>MAX_VARIANTS)throw Error('バリエーションは100件以内です。');
 const variants=rawVariants.map(v=>{
  if(!v.code||!v.name||!/^[A-Z0-9_-]{1,25}$/i.test(v.code))throw Error('サブコード・バリエーション名を確認してください。');
  const variantPrice=money(v.price??'',id+'のバリエーション通常価格',true);
  const variantEvent=money(v.eventPrice??'',id+'のバリエーション展示会特価',true);
  const effectivePrice=variantPrice??price;
  if(variantEvent!==null&&variantEvent>=effectivePrice)throw Error(id+'：バリエーション展示会特価は通常価格より小さくしてください。');
  return {code:trim(v.code).toUpperCase(),name:trim(v.name),price:variantPrice,eventPrice:variantEvent};
 });
 if(new Set(variants.map(v=>v.code)).size!==variants.length)throw Error(id+'：サブコードが重複しています。');
 const janCode=trim(fields.janCode??'');if(janCode&&!/^\d{8,14}$/.test(janCode))throw Error(id+'：JANコードは8〜14桁の数字にしてください。');
 const stock=money(fields.stock??'',id+'の在庫数',true);
 const comboProductId=trim(fields.comboProductId??'');
 if(comboProductId&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(comboProductId))throw Error(id+'：組合せ商品IDの形式を確認してください。');
 const comboDiscount=money(fields.comboDiscount??'',id+'の組合せ割引金額',true)??0;
 if(comboDiscount&&!comboProductId)throw Error('組合せ時割引金額を入力する場合は組合せ商品IDも指定してください。');
 return {id,name,categoryName,price,eventPrice,variants,active:fields.active!==false,janCode,preorder:fields.preorder===true,stock,comboProductId,comboDiscount};
}
function inputData(){
 const id=trim($('product-id').value);
 return productOf({id,name:$('product-name').value,categoryName:$('product-category').value,
  price:$('product-price').value,eventPrice:$('product-event-price').value,variants:readVariants(id),active:$('product-active').checked,
  janCode:$('product-jan').value,stock:$('product-stock').value,preorder:$('product-preorder').checked,
  comboProductId:$('product-combo-id').value,comboDiscount:$('product-combo-discount').value});
}
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
  const meta=document.createElement('div');meta.className='product-meta';meta.textContent=[p.id,p.categoryName,yen(p.price),p.eventPrice!==null&&p.eventPrice!==undefined?'展示会 '+yen(p.eventPrice):'',(p.variants||[]).length?'バリエーション '+p.variants.length+'種':''].filter(Boolean).join(' ／ ');
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
 showVariants((p.variants||[]).map(v=>({code:p.id+'_'+v.code,name:v.name,price:v.price??'',eventPrice:v.eventPrice??''})));
 $('product-jan').value=p.janCode||'';$('product-stock').value=p.stock??'';$('product-preorder').checked=p.preorder===true;
 $('product-combo-id').value=p.comboProductId||'';$('product-combo-discount').value=p.comboDiscount||'';$('product-active').checked=p.active!==false;
 pendingImage=null;$('product-image').value='';loadSavedImage(id,++imageRevision);
 $('edit-note').textContent='編集中：'+p.id+'（商品IDは変更できません）';$('product-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function clearForm(){ ++imageRevision;pendingImage=null;imageProcessing=false;$('product-form').reset();showVariants();$('product-id').readOnly=false;$('product-active').checked=true;$('edit-note').textContent='新規登録';imagePreview('');$('product-image-hint').textContent='未選択の場合、登録済み画像は変更しません。';setBusy(busy);}
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
// Japanese 15-column workbook. One product ID may appear on multiple rows for variants.
const headers=['カテゴリ','ID','商品名','税込価格','表示/非表示','JANコード(任意)','展示会特価(任意)','受注予約(任意)','在庫数(任意)','サブコード(任意)','バリエーション項目(任意)','バリエーションごとの通常価格(任意)','バリエーションごとの展示会特価(任意)','組合せ商品ID(任意)','組合せ時割引金額(任意)'];
const sample=[
 ['ランタン','LT-001','LEDランタン',4800,1,'',4200,0,'','LT-001_BK','カラー：ブラック','','','BG-002',500],
 ['ランタン','LT-001','LEDランタン',4800,1,'',4200,0,'','LT-001_KH','カラー：カーキ','','','BG-002',500],
 ['バッグ','BG-002','キャンバスバッグ',3200,1,'','','','','','','','','','']
];
function xlsx(){if(!window.XLSX)throw Error('Excelライブラリが読み込めません。通信環境を確認し、ページを再読み込みしてください。');return window.XLSX;}
function spreadsheetRows(){
 const rows=[];
 for(const p of [...products.values()].sort((a,b)=>a.id.localeCompare(b.id,'ja'))){
  const variants=p.variants?.length?p.variants:[null];
  for(const v of variants)rows.push([p.categoryName,p.id,p.name,p.price,p.active===false?0:1,p.janCode||'',p.eventPrice??'',p.preorder?1:0,p.stock??'',v?p.id+'_'+v.code:'',v?.name||'',v?.price??'',v?.eventPrice??'',p.comboProductId||'',p.comboDiscount||'']);
 }
 return rows;
}
function workbookFor(data){
 const X=xlsx(),wb=X.utils.book_new();
 const how=[
  ['MY EXPO BAG v1.0.1｜商品登録ガイド',''],
  ['手順 1','「商品登録」シートに必要項目を入力します。'],
  ['手順 2','商品IDは半角英数字・ハイフン(-)・アンダースコア(_)のみ。スラッシュ(/)は使えません。'],
  ['手順 3','カラーやサイズが複数ある場合、同じIDの行を増やしてサブコードとバリエーション項目を記入します。'],
  ['手順 4','サブコードは ID_任意コード（例 LT-001_BK）。バリエーションがない商品は空欄です。'],
  ['手順 5','必須：カテゴリ・ID・商品名・税込価格・表示/非表示。表示は1、非表示は0。'],
  ['手順 6','在庫数の空欄は無制限、0は在庫0。受注予約は1なら予約、空欄または0なら通常。'],
  ['手順 7','JANは先頭の0が消えないよう、文字列として入力してください。金額は税込の整数円です。'],
  ['手順 8','保存形式は .xlsx のまま変更せず、管理画面のExcel一括登録から読み込みます。'],
  ['画像ZIP','商品画像は別途 ZIP で登録。画像ファイル名は ID.jpg 等、1IDにつき1枚。'],
  ['安全上の注意','同一IDを登録すると、その商品情報は上書きされます。アップロード前に内容をご確認ください。']
 ];
 const about=[
  ['項目名','必須/任意','入力方法'],
  ['カテゴリ','必須','自由入力。カテゴリ名を統一してください。'],
  ['ID','必須','半角英数字、-、_。商品固有で重複不可。'],
  ['商品名','必須','商品名を入力。'],
  ['税込価格','必須','税込金額を整数で入力。'],
  ['表示/非表示','必須','1 = 表示 / 0 = 非表示'],
  ['JANコード(任意)','任意','8〜14桁の数値文字列。'],
  ['展示会特価(任意)','任意','通常の税込価格より安い整数円。'],
  ['受注予約(任意)','任意','1 = 予約 / 0または空欄 = 通常'],
  ['在庫数(任意)','任意','整数。空欄 = 数量上限なし'],
  ['サブコード(任意)','任意','商品ID_任意コード（例 LT-001_BK）'],
  ['バリエーション項目(任意)','任意','例：カラー：ブラック、サイズ：M'],
  ['バリエーションごとの通常価格(任意)','任意','未入力なら商品の税込価格を使用'],
  ['バリエーションごとの展示会特価(任意)','任意','未入力なら商品の展示会特価を使用'],
  ['組合せ商品ID(任意)','任意','組合せ相手となる商品ID'],
  ['組合せ時割引金額(任意)','任意','組合せ購入時に減額する整数円']
 ];
 const sheets=[['使い方',how],['商品登録',[headers,...data]],['入力例',[headers,...sample]],['項目説明',about]];
 for(const [name,rows] of sheets){
  const ws=X.utils.aoa_to_sheet(rows);ws['!cols']= name==='商品登録'||name==='入力例'?headers.map((h,i)=>({wch:Math.min(i===10?24:21,Math.max(13,h.length+2))})):[{wch:33},{wch:90}];
  if(name==='商品登録'||name==='入力例')ws['!autofilter']={ref:'A1:O'+Math.max(2,rows.length)};
  X.utils.book_append_sheet(wb,ws,name);
 }
 return wb;
}
function downloadWorkbook(fileName,rows){try{xlsx().writeFile(workbookFor(rows),fileName,{bookType:'xlsx'});status('Excelファイルを作成しました。');}catch(err){status(err.message,true);}}
function parseWorkbook(bytes){
 const X=xlsx(),wb=X.read(bytes,{type:'array',cellDates:false});const ws=wb.Sheets['商品登録'];
 if(!ws)throw Error('「商品登録」シートがありません。指定のテンプレートをご使用ください。');
 const rows=X.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false,raw:false});
 if(rows.length<2)throw Error('「商品登録」シートに登録するデータがありません。');
 const normalize=h=>trim(h).replace(/[（(]任意[)）]/g,'').replace(/\s+/g,'').toLowerCase();
 const indexes=headers.map(h=>(rows[0]||[]).findIndex(v=>normalize(v)===normalize(h)));
 if(indexes.some(i=>i<0))throw Error('テンプレートの列が不足しています。15項目を変更しないでください。');
 const entries=new Map();
 for(let i=1;i<rows.length;i++){
  const row=rows[i],get=k=>trim(row[indexes[k]]??'');
  if(!row.some(v=>trim(v)!==''))continue;
  const id=get(1),active=get(4);
  if(!['0','1'].includes(active))throw Error((i+1)+'行目：表示/非表示は 0 か 1 を入力してください。');
  if(get(7)&&!['0','1'].includes(get(7)))throw Error((i+1)+'行目：受注予約は 0 か 1 を入力してください。');
  const base={id,categoryName:get(0),name:get(2),price:get(3),active:active==='1',janCode:get(5),eventPrice:get(6),preorder:get(7)==='1',stock:get(8),comboProductId:get(13),comboDiscount:get(14)};
  const flatKey=JSON.stringify(base);
  let entry=entries.get(id);
  if(entry&&entry.key!==flatKey)throw Error((i+1)+'行目：同じIDの基本項目が他の行と異なります。');
  if(!entry){entry={key:flatKey,base,variants:[]};entries.set(id,entry);}
  const sub=get(9),variantName=get(10),price=get(11),eventPrice=get(12);
  if(sub||variantName||price||eventPrice){
   if(!sub||!variantName||!sub.startsWith(id+'_'))throw Error((i+1)+'行目：サブコードは商品ID_任意コードとバリエーション名をセットで記入してください。');
   const code=sub.slice(id.length+1).toUpperCase();
   entry.variants.push({code,name:variantName,price,eventPrice});
  }
 }
 if(entries.size>maxProducts)throw Error('一度に登録できるのは300商品までです。');
 const results=[];for(const entry of entries.values())results.push(productOf({...entry.base,variants:entry.variants}));
 if(new Set([...categories,...results.map(p=>p.categoryName)]).size>80)throw Error('カテゴリ上限80件を超えます。');
 if(products.size+results.filter(p=>!products.has(p.id)).length>maxProducts)throw Error('ブランドの商品上限300件を超えます。');
 return results;
}
async function fileChanged(){
 importData=null;$('import-save').disabled=true;$('import-preview').hidden=true;
 const f=$('import-file').files?.[0];if(!f)return;
 if(!/\.xlsx$/i.test(f.name)||f.size>5*1024*1024){status('Excel（.xlsx）、5MB以内のファイルを選んでください。',true);return;}
 try{const rows=parseWorkbook(await f.arrayBuffer());importData=rows;
  const box=$('import-preview');box.replaceChildren();const h=document.createElement('strong');
  h.textContent='確認：'+rows.length+'商品（新規 '+rows.filter(p=>!products.has(p.id)).length+'件、上書き '+rows.filter(p=>products.has(p.id)).length+'件）';box.append(h);
  rows.slice(0,12).forEach(p=>{const d=document.createElement('div');d.textContent=p.id+' ／ '+p.name+' ／ '+p.categoryName+' ／ '+yen(p.price)+' ／ バリエーション'+p.variants.length+'件';box.append(d);});
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
$('download-xlsx').addEventListener('click',()=>downloadWorkbook('MY_EXPO_BAG_商品登録テンプレート.xlsx',[]));
$('export-xlsx').addEventListener('click',()=>downloadWorkbook('MY_EXPO_BAG_登録商品.xlsx',spreadsheetRows()));
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
