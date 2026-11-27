(() => {
'use strict';
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const say=t=>{$('j-status').textContent=t};
const fields=['entry_date','mood','title','body','good','learn','tomorrow'];
let client,user=null,member=null,admin=false,selected=null,editing=null,syncGen=0,roomGen=0,busy=false,rows=[];
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
function reset(){editing=null;$('j-entry').reset();$('j-entry_date').value=today();$('j-form-title').textContent='新しい日記';}
function clear(){roomGen++;rows=[];selected=null;member=null;admin=false;editing=null;reset();$('j-archive').replaceChildren();$('j-rooms').replaceChildren();$('j-room-title').textContent='日記の部屋';$('j-account').textContent='';$('j-request').hidden=true;$('j-entry').hidden=true;$('j-admin').hidden=true;$('j-members').replaceChildren();$('j-rename').hidden=true;$('j-import').hidden=true;$('j-logout').hidden=true;$('j-login').hidden=false;$('j-signup').hidden=true;$('j-signup').reset();$('j-login').reset();$('j-search').value='';}
const statusName=s=>({pending:'承認待ち',approved:'承認済み',rejected:'未承認',revoked:'承認取り消し'})[s]||s;
const button=(text,fn,secondary=true)=>{const b=el('button',text);b.type='button';if(secondary)b.className='secondary';b.onclick=fn;return b};
const busySet=v=>{busy=v;$('j-entry').querySelectorAll('input,textarea,select,button').forEach(e=>e.disabled=v);$('j-logout').disabled=v;$('j-import').disabled=v};
function getLocal(){try{const a=JSON.parse(localStorage.getItem('my-life-journal-v1')||'[]');return Array.isArray(a)?a:[]}catch(_){return []}}
async function sync(){
 const gen=++syncGen;
 const {data,error}=await client.auth.getUser();
 if(gen!==syncGen)return;
 const next=data?.user||null;
 if(next?.id!==user?.id){clear();user=next}
 member=null;admin=false;
 $('j-login').hidden=!!user;$('j-logout').hidden=!user;$('j-entry').hidden=true;$('j-admin').hidden=true;$('j-request').hidden=true;$('j-rename').hidden=true;$('j-import').hidden=true;
 if(user){
  const [m,a]=await Promise.all([client.from('journal_members').select('user_id,display_name,status').eq('user_id',user.id).maybeSingle(),client.rpc('is_vlog_owner')]);
  if(gen!==syncGen)return;
  if(m.error){say('日記の設定を確認してください: '+m.error.message);return}
  if(a.error){say('権限の確認に失敗しました: '+a.error.message);return}
  member=m.data;admin=a.data===true;
  $('j-account').textContent=member?member.display_name+' ・ '+statusName(member.status):'ログイン済み・参加申請が必要';
  if(!member){$('j-request').hidden=false;$('j-request-name').value=String(user.user_metadata?.display_name||'').slice(0,40);}
  else if(member.status==='approved'){$('j-rename').hidden=false;$('j-new-name').value=member.display_name}
  $('j-admin').hidden=!admin;$('j-import').hidden=!(admin&&member?.status==='approved'&&getLocal().length>0);
  if(admin)await adminList(gen);
 }
 if(gen!==syncGen)return;
 const result=await client.rpc('journal_rooms');
 if(gen!==syncGen)return;
 if(result.error){say('日記の部屋を取得できません。SQL設定を確認してください: '+result.error.message);return}
 const rooms=result.data||[];
 if(member && !rooms.some(x=>x.user_id===user.id))rooms.unshift({user_id:user.id,display_name:member.display_name});
 rooms.sort((a,b)=>(a.user_id===user?.id?-1:b.user_id===user?.id?1:0));
 const box=$('j-rooms');box.replaceChildren();
 if(!rooms.length)box.append(el('p','公開中の日記の部屋はまだありません。'));
 for(const room of rooms){const mine=room.user_id===user?.id;
  const b=button(room.display_name+'の日記'+(mine?'（自分）':''),()=>choose(room),!mine);b.classList.add('j-room-button');box.append(b);
 }
 const target=rooms.find(x=>x.user_id===selected?.user_id)||rooms.find(x=>x.user_id===user?.id)||rooms[0];
 if(target){const same=selected?.user_id===target.user_id;await choose(target,!same)}
 else{selected=null;roomGen++;rows=[];$('j-archive').replaceChildren();$('j-room-title').textContent='日記の部屋';}
}
async function choose(room,clearForm=true){
 if(busy&&clearForm)return;
 selected=room;const gen=++roomGen;
 if(clearForm){reset();$('j-search').value=''}
 $('j-room-title').textContent=room.display_name+'の日記';
 $('j-entry').hidden=!(user?.id===room.user_id&&member?.status==='approved');
 $('j-rooms').querySelectorAll('button').forEach(b=>b.classList.toggle('j-selected',b.textContent===room.display_name+'の日記'+(room.user_id===user?.id?'（自分）':'')));
 rows=[];$('j-archive').replaceChildren(el('p','読み込み中…'));
 const {data,error}=await client.from('journal_entries').select('id,owner_id,entry_date,mood,title,body,good,learn,tomorrow,published,created_at').eq('owner_id',room.user_id).order('entry_date',{ascending:false}).order('created_at',{ascending:false});
 if(gen!==roomGen)return;
 if(error){$('j-archive').replaceChildren(el('p','日記を取得できません: '+error.message));return}
 rows=data||[];draw();
}
function draw(){
 const out=$('j-archive');out.replaceChildren();
 const q=$('j-search').value.toLowerCase();
 const visible=rows.filter(x=>fields.some(k=>String(x[k]||'').toLowerCase().includes(q)));
 if(!visible.length){out.append(el('p','表示できる日記はありません。'));return}
 for(const e of visible){
  const mine=e.owner_id===user?.id;
  const card=el('article');card.className='panel';card.append(el('small',e.entry_date+'　'+e.mood+(mine?(e.published?' ・ 公開':' ・ 非公開'):'')),el('h2',e.title||'無題の日記'),el('p',e.body));
  for(const [label,k] of [['よかったこと・感謝','good'],['学び・反省','learn'],['明日の目標','tomorrow']])if(e[k])card.append(el('h3',label),el('p',e[k]));
  if(mine){const actions=el('div');actions.className='actions';
   if(member?.status==='approved')actions.append(button('編集',()=>{if(busy)return;editing=e.id;fields.forEach(k=>$('j-'+k).value=e[k]||'');$('j-visibility').value=e.published?'public':'private';$('j-form-title').textContent='日記を編集';$('j-entry').scrollIntoView({behavior:'smooth'})}));
   actions.append(button('削除',async()=>{if(busy||!confirm('この日記を削除しますか？'))return;busySet(true);try{const r=await client.from('journal_entries').delete().eq('id',e.id).eq('owner_id',user.id).select('id');if(r.error)throw r.error;if(!r.data.length)throw Error('削除権限がありません。');if(editing===e.id)reset();say('削除しました。');await choose(selected,false)}catch(err){say(err.message)}finally{busySet(false)}}));
   card.append(actions);
  }out.append(card)
 }
}
async function adminList(gen=syncGen){
 const {data,error}=await client.from('journal_members').select('user_id,display_name,email,status,requested_at').order('requested_at',{ascending:false});
 if(gen!==syncGen||!admin)return;
 const box=$('j-members');box.replaceChildren();
 if(error){box.append(el('p',error.message));return}
 for(const m of data||[]){const card=el('article');card.className='panel';card.append(el('strong',m.display_name),el('p',m.email+' ・ '+statusName(m.status)));
  if(m.user_id!==user.id){const actions=el('div');actions.className='actions';
   for(const [name,status] of [['承認','approved'],['拒否','rejected'],['承認取り消し','revoked']]){
    if(m.status===status)continue;
    actions.append(button(name,async()=>{if(!confirm(m.display_name+'：'+name+'しますか？'))return;try{const r=await client.rpc('journal_review',{p_user:m.user_id,p_status:status});if(r.error)throw r.error;say(name+'しました。');await sync()}catch(e){say(e.message)}}));
   }card.append(actions)
  }box.append(card)
 }
}
function handler(id,fn){$(id).addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit],button:not([type])');if(b)b.disabled=true;try{await fn()}catch(err){say(err.message||String(err))}finally{if(b)b.disabled=false}})}
handler('j-login',async()=>{const r=await client.auth.signInWithPassword({email:$('j-email').value,password:$('j-password').value});if(r.error)throw r.error;$('j-login').reset();say('ログインしました。');await sync()});
$('j-show-signup').onclick=()=>{$('j-signup').hidden=!$('j-signup').hidden};
handler('j-signup',async()=>{const name=$('j-signup-name').value.trim(),email=$('j-signup-email').value,password=$('j-signup-password').value;if(!name)throw Error('表示名を入力してください。');
 const r=await client.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;$('j-signup').reset();$('j-signup').hidden=true;
 if(r.data.session){say('登録しました。参加申請を送信してください。');await sync()}else say('確認メールを送信しました。メールを確認し、サイトでログインして参加申請を送信してください。');
});
handler('j-request',async()=>{const r=await client.rpc('journal_request',{p_name:$('j-request-name').value.trim()});if(r.error)throw r.error;say('参加申請を送信しました。管理者の承認をお待ちください。');await sync()});
handler('j-rename',async()=>{const r=await client.rpc('journal_rename',{p_name:$('j-new-name').value.trim()});if(r.error)throw r.error;say('部屋の名前を変更しました。');await sync()});
$('j-refresh').onclick=()=>sync().then(()=>say('最新の状態を取得しました。')).catch(e=>say(e.message));
$('j-logout').onclick=async()=>{if(busy)return;try{const r=await client.auth.signOut();if(r.error)throw r.error;clear();user=null;say('ログアウトしました。');await sync()}catch(e){say(e.message)}};
$('j-search').oninput=draw;$('j-cancel').onclick=reset;
handler('j-entry',async()=>{if(busy||!user||member?.status!=='approved'||selected?.user_id!==user.id)return;
 const data={owner_id:user.id,published:$('j-visibility').value==='public'};fields.forEach(k=>data[k]=$('j-'+k).value);if(!data.body.trim())throw Error('日記本文を入力してください。');
 if(data.published&&!confirm('この日記の全項目（気分・振り返り・目標を含む）を誰でも閲覧できるようにしますか？'))return;
 busySet(true);try{
 const r=editing?await client.from('journal_entries').update(data).eq('id',editing).eq('owner_id',user.id).select('id'):await client.from('journal_entries').insert(data).select('id');
 if(r.error)throw r.error;if(!r.data?.length)throw Error('保存権限がありません。');reset();say(data.published?'公開日記として保存しました。':'非公開で保存しました。');await choose(selected,false);
 }finally{busySet(false)}
});
$('j-import').onclick=async()=>{if(!admin||member?.status!=='approved'||busy)return;const old=getLocal();if(!old.length)return;
 if(!confirm('この端末に保存されている旧日記 '+old.length+' 件を、現在ログイン中の管理者の部屋に非公開でコピーしますか？ 自分の日記であることを確認してください。'))return;
 const valid=old.filter(e=>e&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id)&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&String(e.body||'').trim());
 if(!valid.length){say('移行可能な日記がありません。');return}
 const limit=(v,n)=>String(v||'').slice(0,n);const payload=valid.map(e=>({id:e.id,owner_id:user.id,entry_date:e.date,mood:limit(e.mood,40),title:limit(e.title,200),body:limit(e.body,30000),good:limit(e.good,10000),learn:limit(e.learn,10000),tomorrow:limit(e.tomorrow,10000),published:false}));
 busySet(true);try{for(let i=0;i<payload.length;i+=25){const r=await client.from('journal_entries').upsert(payload.slice(i,i+25),{onConflict:'id',ignoreDuplicates:true});if(r.error)throw r.error}say('旧日記の移行が完了しました（重複は除外）。元の端末内データは削除していません。');await sync()}catch(e){say('移行できなかった日記があります: '+e.message+'。再実行できます。')}finally{busySet(false)}
};
$('j-export').onclick=async()=>{if(!user)return;try{const {data,error}=await client.from('journal_entries').select('*').eq('owner_id',user.id).order('entry_date',{ascending:false});if(error)throw error;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='my-life-journal-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){say(e.message)}};
async function init(){reset();try{client=await window.MY_LIFE_CLIENT_PROMISE;await sync();
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==user?.id)){syncGen++;clear();user=null;setTimeout(()=>sync().catch(e=>say(e.message)),0)}});
 }catch(e){say('接続できません: '+e.message)}}
init();
})();
