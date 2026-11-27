(() => {
'use strict';
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const feed=$('tl-feed'), status=$('tl-status'), more=$('tl-more'), filter=$('tl-filter');
let client, generation=0, limit=20, pageSize=20;
const active=()=>location.hash==='#timeline';
const isPhoto=path=>/\.(jpe?g|png|webp|gif)$/i.test(path);
function cleanup(){
 feed.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load()});
 feed.replaceChildren();more.hidden=true;
}
const config=window.MY_LIFE_VIDEO_CONFIG||{};
const connection=(async()=>{
 if(!config.url||!config.publishableKey)throw Error('クラウド接続が未設定です。');
 const url=new URL(config.url);if(url.protocol!=='https:')throw Error('HTTPSが必要です。');
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
 return createClient(url.origin,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'my-life-public-timeline'}});
})();
connection.catch(()=>{});
function dateLabel(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('ja-JP',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function media(card,item,gen){
 const photo=item.kind==='photo';
 const b=el('button',photo?'写真を表示':'▶ 動画を再生');b.type='button';b.className='secondary';
 const note=el('small','');note.setAttribute('role','status');
 card.append(b,note);
 b.onclick=async()=>{
  b.disabled=true;note.textContent='読み込み中…';
  try{
   const {data,error}=await client.storage.from('vlog-videos').createSignedUrl(item.path,600);
   if(error)throw error;if(gen!==generation||!active())return;
   const m=el(photo?'img':'video');m.className='tl-media';
   if(photo){m.alt=item.title||'投稿写真';m.loading='lazy';m.decoding='async';m.referrerPolicy='no-referrer'}
   else{m.controls=true;m.playsInline=true;m.preload='metadata'}
   m.onerror=()=>{if(gen===generation&&active()){m.replaceWith(b);b.disabled=false;note.textContent='表示できませんでした。再度お試しください。'}};
   m.src=data.signedUrl;b.replaceWith(m);note.textContent='';
  }catch(e){if(gen===generation){note.textContent='取得できませんでした。'+(e.message||'');b.disabled=false}}
 };
 if(photo){if('IntersectionObserver' in window){const ob=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){ob.disconnect();if(gen===generation&&active()&&b.isConnected)b.click()}},{rootMargin:'120px'});ob.observe(b);setTimeout(()=>ob.disconnect(),60000)}else b.click()}
}
function renderCard(item,gen){
 const card=el('article');card.className='panel tl-card';
 const top=el('div');top.className='tl-top';
 const avatar=el('span',Array.from(item.author||'M')[0]||'M');avatar.className='tl-avatar';avatar.setAttribute('aria-hidden','true');
 const meta=el('div');meta.append(el('strong',item.author),el('small',dateLabel(item.created_at)));
 const badge=el('span',({journal:'日記',photo:'写真',video:'動画'})[item.kind]);badge.className='tl-kind';
 top.append(avatar,meta,badge);card.append(top,el('h2',item.title||'無題の投稿'));
 if(item.kind==='journal'){
  if(item.entry_date||item.mood)card.append(el('small',[item.entry_date,item.mood].filter(Boolean).join(' ・ ')));
  card.append(el('p',item.body));
  const extras=[['よかったこと・感謝',item.good],['学び・反省',item.learn],['明日の目標',item.tomorrow]].filter(x=>x[1]);
  if(extras.length){const details=el('details');details.append(el('summary','振り返り・目標を見る'));for(const [label,value] of extras)details.append(el('h3',label),el('p',value));card.append(details)}
 }else{if(item.description)card.append(el('p',item.description));media(card,item,gen)}
 feed.append(card);
}
async function load(){
 const gen=++generation;cleanup();status.textContent='公開投稿を読み込み中…';
 try{
  client=await connection;if(gen!==generation||!active())return;
  const mode=filter.value;
  const wantsJournal=mode==='all'||mode==='journal',wantsMedia=mode!=='journal';
  const empty={data:[],error:null};
  const [rooms,journals,mediaRows]=await Promise.all([
   client.rpc('journal_rooms'),
   wantsJournal?client.from('journal_entries').select('id,owner_id,entry_date,mood,title,body,good,learn,tomorrow,created_at,published').eq('published',true).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1):empty,
   wantsMedia?client.from('vlog_videos').select('id,owner_id,path,title,description,created_at,published').eq('published',true).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1):empty
  ]);
  if(gen!==generation||!active())return;
  const names=new Map((rooms.data||[]).map(r=>[r.user_id,r.display_name]));
  const errors=[];
  if(wantsJournal&&(rooms.error||journals.error))errors.push('日記を取得できません。日記用SQLの設定を確認してください。');
  if(wantsMedia&&mediaRows.error)errors.push('写真・動画を取得できません。');
  const diary=rooms.error||journals.error?[]:(journals.data||[]).filter(r=>r.published===true&&names.has(r.owner_id)).map(r=>({...r,kind:'journal',author:names.get(r.owner_id)}));
  const allMedia=mediaRows.error?[]:(mediaRows.data||[]).filter(r=>r.published===true).map(r=>({...r,kind:isPhoto(r.path)?'photo':'video',author:names.get(r.owner_id)||'MY LIFE'}));
  const items=[...diary,...allMedia].filter(r=>mode==='all'||r.kind===mode).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||a.id.localeCompare(b.id));
  status.textContent=errors.length?errors.join(' '):'公開投稿のみを表示しています。';
  if(!items.length&&!errors.length)feed.append(el('p','まだ公開投稿がありません。'));
  for(const item of items.slice(0,limit))renderCard(item,gen);
  more.hidden=!(items.length>limit||(wantsMedia&&(mediaRows.data||[]).length>limit)||(wantsJournal&&(journals.data||[]).length>limit));
 }catch(e){if(gen===generation&&active())status.textContent='タイムラインを読み込めません: '+(e.message||String(e))}
}
$('tl-refresh').onclick=()=>{limit=pageSize;load()};
filter.onchange=()=>{limit=pageSize;load()};
more.onclick=()=>{limit+=pageSize;load()};
window.addEventListener('hashchange',()=>{if(active()){limit=pageSize;load()}else{generation++;cleanup()}});
if(active())load();
})();
