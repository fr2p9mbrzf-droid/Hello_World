(()=>{
'use strict';
const $=id=>document.getElementById(id),form=$('bu-form');
const active=()=>location.hash==='#budget'&&!form.hidden;
const status=t=>$('rc-status').textContent=t;
let generation=0,frame=null,timer=null,previewURL=null,rawImage=null,ready=false,scanning=false,hasResult=false;
function parseReceipt(text){
 const lines=String(text||'').normalize('NFKC').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const dense=s=>s.replace(/[\s\u3000]/g,'');
 function iso(y,m,d){y=Number(y);m=Number(m);d=Number(d);if(y<2000||y>2099||m<1||m>12||d<1||d>31)return '';const t=new Date(Date.UTC(y,m-1,d));return t.getUTCMonth()===m-1&&t.getUTCDate()===d?y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'):''}
 const dates=new Set();
 for(const l of lines){const s=dense(l);for(const m of s.matchAll(/(20\d{2})[年/.\-](\d{1,2})[月/.\-](\d{1,2})(?:日)?(?!\d)/g)){const d=iso(m[1],m[2],m[3]);if(d)dates.add(d)}
 for(const m of s.matchAll(/(?:令和|R)(\d{1,2})[年/.\-](\d{1,2})[月/.\-](\d{1,2})(?:日)?(?!\d)/gi)){const d=iso(2018+Number(m[1]),m[2],m[3]);if(d)dates.add(d)}}
 function money(s){const t=dense(s).replace(/^[：:¥￥\\]+/,'').replace(/円$/,'').replace(/[,，]/g,'');if(!/^\d{1,10}$/.test(t))return null;const n=Number(t);return Number.isSafeInteger(n)&&n>=1&&n<=1000000000?n:null}
 const candidates=[];
 for(let i=0;i<lines.length;i++){
  const s=dense(lines[i]);if(/小計|税額|消費税|内税|外税|点数|数量|お釣|おつり|お預|預り|ポイント|値引|割引|釣銭|税抜|対象額/.test(s))continue;
  const m=s.match(/^(?:[※*#・]+)?(お支払(?:い)?(?:金額|額)|ご請求(?:金額|額)|請求(?:金額|額)|お買上(?:げ)?(?:合計|金額|計)|税込合計|総合計|合計(?:金額|額)?(?:\(税込\))?|TOTAL(?:AMOUNT)?)(.*)$/i);
  if(!m)continue;
  let suffix=m[2].replace(/^(?:\(税込\)|税込|[:：])+/,''),n=money(suffix);
  if(n===null&&!suffix&&i+1<lines.length)n=money(lines[i+1]);
  if(n!==null)candidates.push(n);
 }
 const totals=[...new Set(candidates)];
 const shop=lines.slice(0,7).find(s=>/[ぁ-んァ-ヶ一-龯A-Za-z]{2}/.test(s)&&!/\d{2,}|レシート|領収|明細|お買|ご利用|ありがとう|電話|住所|登録番号|取引|発行|店舗番号|営業|〒|TEL|receipt|invoice/i.test(s)&&s.length<=70)||'';
 return {amount:totals.length===1?totals[0]:null,date:dates.size===1?[...dates][0]:'',shop,ambiguousTotal:totals.length>1,ambiguousDate:dates.size>1};
}
function stop(){generation++;clearTimeout(timer);timer=null;if(frame){frame.remove();frame=null}rawImage=null;ready=false;scanning=false;$('rc-progress').hidden=true;$('rc-cancel').hidden=true;}
function clear(){stop();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('rc-preview').removeAttribute('src');$('rc-preview').hidden=true;$('rc-results').hidden=true;$('rc-shop').value='';$('rc-date').value='';$('rc-amount').value='';$('rc-raw').textContent='';$('rc-category').value='';$('rc-ai-note').textContent='';$('rc-camera').value='';$('rc-file').value='';hasResult=false;status('');}
function fail(t){stop();status(t);}
async function normalizeImage(file){
 const url=URL.createObjectURL(file);
 try{
  const im=new Image();im.src=url;await new Promise((resolve,reject)=>{if(im.complete&&im.naturalWidth){resolve();return}im.onload=resolve;im.onerror=()=>reject(Error('画像を開けません。JPEGまたはPNGでお試しください。'))});
  if(!im.naturalWidth||!im.naturalHeight)throw Error('画像サイズを確認できません。');
  const scale=Math.min(1,3000/Math.max(im.naturalWidth,im.naturalHeight),Math.sqrt(5000000/(im.naturalWidth*im.naturalHeight)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(im.naturalWidth*scale));canvas.height=Math.max(1,Math.round(im.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('画像処理に対応していません。');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));canvas.width=canvas.height=1;if(!blob)throw Error('画像を変換できませんでした。');
  return blob;
 }finally{URL.revokeObjectURL(url)}
}
async function scan(file){
 if(!file||!active())return;
 if($('bu-form-title').textContent==='記録を編集'){status('レシートから新規記録を作る場合は、先に「新規記録」を押してください。');return}
 const useAI=$('rc-cloud').checked;clear();const run=++generation;
 if(file.size>20000000||file.size===0||(!file.type.startsWith('image/')&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))){status('20MB以下の写真を選択してください。');return}
 scanning=true;$('rc-cancel').hidden=false;$('rc-progress').hidden=false;$('rc-progress').removeAttribute('value');status('画像を準備しています…');
 timer=setTimeout(()=>{if(run===generation)fail('読み取りがタイムアウトしました。通信状況を確認し、写真を撮り直すか手入力してください。')},150000);
 try{
  const blob=await normalizeImage(file);if(run!==generation||!active())return;
  previewURL=URL.createObjectURL(blob);$('rc-preview').src=previewURL;$('rc-preview').hidden=false;
  if(useAI){
   if(!confirm('このレシート写真をOpenAIの画像認識サービスに送信します。個人情報やカード番号が写っていないか確認してください。送信しますか？')){fail('AI送信を中止しました。');return}
   status('AIがレシートを分析中…');
   const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('画像を読み込めません'));reader.readAsDataURL(blob)});
   if(run!==generation||!active())return;
   if(dataUrl.length>2600000)throw Error('写真が大きすぎます。トリミングして再試行してください。');
   const result=await window.MY_LIFE_AI.call('receipt',{image:dataUrl});if(run!==generation||!active())return;
   stop();hasResult=true;
   $('rc-shop').value=typeof result.shop==='string'?result.shop.slice(0,100):'';
   $('rc-date').value=typeof result.date==='string'?result.date:'';
   $('rc-amount').value=Number.isInteger(result.amount)&&result.amount>0&&result.amount<=1000000000?result.amount:'';
   $('rc-category').value=window.MY_LIFE_AI.categories.includes(result.category)?result.category:'';
   $('rc-ai-note').textContent=typeof result.note==='string'?result.note.slice(0,500):'';
   $('rc-raw').textContent='画像AIによる抽出（OCR全文なし）';$('rc-results').hidden=false;
   status('AIの読み取り候補です。写真と照らし合わせ、金額・日付・カテゴリを確認してください。');return;
  }
  rawImage=await blob.arrayBuffer();if(run!==generation||!active())return;
  frame=document.createElement('iframe');frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('title','レシート文字認識');frame.src=new URL('receipt-ocr.html?v=16',location.href).href;document.body.append(frame);
  status('日本語OCRを準備中… 初回は認識用データのダウンロードが必要です。');
 }catch(e){if(run===generation)fail('読み取りを開始できません：'+e.message)}
}
window.addEventListener('message',e=>{
 if(!scanning||!frame||e.source!==frame.contentWindow||e.origin!=='null'||e.data?.type!=='my-life-receipt'||!active())return;
 const m=e.data;
 if(m.kind==='ready'&&!ready&&rawImage){ready=true;const data=rawImage;rawImage=null;frame.contentWindow.postMessage({type:'my-life-receipt-scan',image:data},'*',[data]);return}
 if(m.kind==='progress'){
  if(m.status==='recognizing text'){const n=Math.max(0,Math.min(1,Number(m.progress)||0));$('rc-progress').value=n;status('文字を読み取り中… '+Math.round(n*100)+'%')}
  else{ $('rc-progress').removeAttribute('value');status('認識エンジン・日本語データを準備中…') }return
 }
 if(m.kind==='error'){fail('読み取れませんでした。手入力もできます。 '+String(m.message||'').slice(0,200));return}
 if(m.kind==='result'){
  const text=String(m.text||'').slice(0,30000),p=parseReceipt(text);stop();hasResult=true;
  $('rc-shop').value=p.shop;$('rc-date').value=p.date;$('rc-amount').value=p.amount??'';$('rc-raw').textContent=text;$('rc-category').value=window.MY_LIFE_AI.classify(text);$('rc-results').hidden=false;
  status((!p.amount?(p.ambiguousTotal?'合計候補が複数あります。':'合計金額を特定できませんでした。'):'読み取りが完了しました。')+' 写真と照らし合わせ、店名・日付・金額を確認してください。'+(p.ambiguousDate?' 日付候補も複数あります。':''));
 }
});
$('rc-camera').addEventListener('change',e=>scan(e.target.files[0]));$('rc-file').addEventListener('change',e=>scan(e.target.files[0]));$('rc-cancel').onclick=()=>{clear();status('読み取りを中止しました。')};
$('rc-apply').onclick=()=>{
 if(!hasResult||!active()||$('bu-form-title').textContent==='記録を編集')return;
 const n=Number($('rc-amount').value),date=$('rc-date').value,shop=$('rc-shop').value.trim();
 if(!Number.isInteger(n)||n<1||n>1000000000||!date||!$('rc-date').validity.valid){status('正しい合計金額と日付を入力してください。');return}
 if(($('bu-amount').value||$('bu-note').value)&&!confirm('家計簿の入力欄に読み取った金額・日付・店名を反映しますか？'))return;
 if($('bu-kind').value!=='expense'){$('bu-kind').value='expense';$('bu-kind').dispatchEvent(new Event('change'))}
 $('bu-amount').value=String(n);$('bu-date').value=date;if($('rc-category').value)$('bu-category').value=$('rc-category').value;
 if(shop){const note=$('bu-note').value.trim();$('bu-note').value=('店名：'+shop+(note?'\n'+note:'')).slice(0,1000)}
 clear();status('入力欄に反映しました。カテゴリを確認・選択し、内容を確認して「記録を保存」を押してください。');$('bu-category').focus();
};
form.addEventListener('reset',()=>{clear();$('rc-cloud').checked=false});form.addEventListener('receipt-clear',()=>{clear();$('rc-cloud').checked=false});
window.addEventListener('hashchange',()=>{if(!active()){clear();$('rc-cloud').checked=false}});
new MutationObserver(()=>{if(form.hidden){clear();$('rc-cloud').checked=false}}).observe(form,{attributes:true,attributeFilter:['hidden']});
})();