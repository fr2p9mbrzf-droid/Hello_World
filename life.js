(()=>{
'use strict';
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const names={todo:'TODO',goal:'目標',habit:'習慣',schedule:'予定',study:'学習',reading:'読書',weight:'体重',travel:'旅行',memo:'メモ',asset:'資産',fixed:'固定費'};
const units={study:'分',weight:'kg',asset:'円',fixed:'円',goal:'進捗数値'};
const day=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const fmt=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2});
let client,user=null,admin=false,approved=false,epoch=0,edit=null,items=[],checks=new Set(),busy=false;
const page=()=>location.hash.slice(1);
const here=()=>['admin','dashboard','life'].includes(page());
const say=t=>{$('life-status').textContent=t;$('ad-status').textContent=t;$('dash-status').textContent=t};
function btn(text,fn){const b=el('button',text);b.type='button';b.className='secondary';b.onclick=()=>action(fn);return b}
function clear(){epoch++;user=null;admin=false;approved=false;edit=null;items=[];checks.clear();$('admin-link').hidden=true;$('ad-body').hidden=true;$('ad-members').replaceChildren();$('ad-invites').replaceChildren();$('ad-code').textContent='';$('ad-email').value='';$('life-body').hidden=true;$('life-list').replaceChildren();$('dash-body').hidden=true;$('dash-stats').replaceChildren();$('dash-finance').textContent='';$('dash-budget-form').reset();$('dash-password-form').reset();$('dash-password-form').hidden=true;reset();}
function reset(){edit=null;$('life-form').reset();$('life-date').value=day();$('life-form-title').textContent='新しい記録';setKind();}
function setKind(){const k=$('life-kind').value;$('life-value-wrap').hidden=!units[k];$('life-target-wrap').hidden=k!=='goal';$('life-value-label').textContent=k==='goal'?'現在の進捗':('数値（'+(units[k]||'')+'）');}
function check(r){if(r.error)throw r.error;return r.data}
async function action(fn){if(busy)return;busy=true;try{await fn()}catch(e){say(e.message||String(e))}finally{busy=false}}
function form(id,fn){$(id).onsubmit=e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type="submit"]');if(b)b.disabled=true;action(fn).finally(()=>{if(b)b.disabled=false})}}
async function all(table,select,query){
 let out=[];
 for(let from=0;;from+=500){const result=check(await query(client.from(table).select(select)).range(from,from+499));out.push(...result);if(result.length<500)return out}
}
function same(uid,run){return user?.id===uid&&epoch===run}
async function auth(){
 const run=++epoch;
 try{client=await window.MY_LIFE_CLIENT_PROMISE;const r=await client.auth.getUser();if(run!==epoch)return;const u=r.data?.user||null;if(u?.id!==user?.id){clear();user=u}
 if(!u){clear();if(here())say('JOURNALからログインしてください。');return}
 const current=++epoch;const [a,m]=await Promise.all([client.rpc('is_vlog_owner'),client.rpc('journal_is_approved',{p_user:u.id})]);if(!same(u.id,current))return;
 admin=check(a)===true;approved=check(m)===true;$('admin-link').hidden=!admin;$('dash-password-form').hidden=false;
 if(page()==='admin'){if(!admin){$('ad-body').hidden=true;say('管理者専用です。');return}$('ad-body').hidden=false;await loadAdmin(u.id,current)}
 if(page()==='dashboard'){$('dash-body').hidden=false;$('dash-budget-form').hidden=!approved;await loadDash(u.id,current)}
 if(page()==='life'){$('life-body').hidden=false;$('life-form').hidden=!approved;await loadLife(u.id,current)}
 if(here()&&same(u.id,current))say(page()==='admin'?'管理者としてログイン中':approved?'本人専用の記録です。':'投稿にはメンバー承認が必要です。');
 }catch(e){if(here())say('読み込みエラー: '+e.message+'（v15のSQL設定を確認してください）')}
}
async function loadAdmin(uid,run){
 const [members,invites]=await Promise.all([all('journal_members','user_id,display_name,email,status',q=>q.order('requested_at',{ascending:false}).order('user_id')),all('life_invites','id,email,code,expires_at,used_at,revoked',q=>q.order('created_at',{ascending:false}).order('id'))]);if(!same(uid,run)||!admin||page()!=='admin')return;
 const mb=$('ad-members'),ib=$('ad-invites');mb.replaceChildren();ib.replaceChildren();
 for(const m of members){const card=el('article');card.className='panel';card.append(el('strong',m.display_name),el('p',m.email+' ・ '+({pending:'承認待ち',approved:'承認済み',rejected:'拒否',revoked:'取り消し'}[m.status]||m.status)));
 if(m.user_id!==uid){const row=el('div');row.className='actions';for(const [label,state] of [['承認','approved'],['拒否','rejected'],['承認取り消し','revoked']])if(state!==m.status)row.append(btn(label,async()=>{if(!confirm(m.display_name+'を'+label+'しますか？'))return;check(await client.rpc('journal_review',{p_user:m.user_id,p_status:state}));await auth()}));card.append(row)}mb.append(card)}
 for(const i of invites){const valid=!i.revoked&&!i.used_at&&Date.parse(i.expires_at)>Date.now();const card=el('article');card.className='panel';card.append(el('strong',i.email),el('p',i.used_at?'使用済み':i.revoked?'取り消し済み':valid?'有効期限 '+new Date(i.expires_at).toLocaleString('ja-JP'):'期限切れ'));if(valid){const code=el('p',i.code);code.className='life-code';card.append(code,btn('コードをコピー',async()=>{await navigator.clipboard.writeText(i.code);say('コピーしました。')}),btn('招待を取り消す',async()=>{if(!confirm('この招待を無効にしますか？'))return;check(await client.rpc('life_invite_revoke',{p_id:i.id}));await auth()}))}ib.append(card)}
 if(!invites.length)ib.append(el('p','招待はまだありません。'));
}
form('ad-form',async()=>{if(!admin||!user)return;const uid=user.id;const code=check(await client.rpc('life_invite_create',{p_email:$('ad-email').value.trim()}));if(user?.id!==uid||page()!=='admin')return;$('ad-code').textContent=code;$('ad-email').value='';await auth();say('招待を発行しました。対象の人にコードを渡してください。')});
$('ad-refresh').onclick=auth;
async function loadDash(uid,run){
 const d=new Date(),start=day(new Date(d.getFullYear(),d.getMonth(),1)),end=day(new Date(d.getFullYear(),d.getMonth()+1,1));
 const [stats,goal,assets]=await Promise.all([client.rpc('life_dashboard',{p_start:start,p_end:end}),client.from('life_budget_goals').select('expense_limit,savings_goal').eq('owner_id',uid).eq('month_start',start).maybeSingle(),client.from('life_items').select('record_date,value').eq('owner_id',uid).eq('kind','asset').order('record_date',{ascending:false}).order('created_at',{ascending:false}).limit(1)]);
 if(!same(uid,run)||page()!=='dashboard')return;
 const s=check(stats),g=check(goal),a=check(assets);const box=$('dash-stats');box.replaceChildren();
 for(const [label,value] of [['今月の収入',fmt(s.income)+'円'],['今月の支出',fmt(s.expense)+'円'],['今月の収支',fmt(s.income-s.expense)+'円'],['筋トレ日数',s.training_days+'日'],['日記を記録した日',s.journal_days+'日'],['学習時間',fmt(s.study_minutes/60)+'時間'],['最新の資産記録',a[0]?.value==null?'未登録':fmt(a[0].value)+'円']]){const card=el('div');card.className='panel';card.append(el('small',label),el('strong',value));box.append(card)}
 $('dash-month').textContent=start.slice(0,7);$('dash-limit').value=g?.expense_limit??'';$('dash-save-goal').value=g?.savings_goal??'';
 $('dash-finance').textContent=g?'支出予算の残り：'+fmt(g.expense_limit-s.expense)+'円 ／ 収支目標との差：'+fmt((s.income-s.expense)-g.savings_goal)+'円（貯金実績ではなく月間収支で比較）':'今月の予算・収支目標を設定できます。';
}
form('dash-budget-form',async()=>{if(!approved||!user)return;const uid=user.id,start=day().slice(0,7)+'-01';const limit=Number($('dash-limit').value),goal=Number($('dash-save-goal').value);if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(goal)||limit<0||goal<0||limit>1e11||goal>1e11)throw Error('金額を確認してください。');check(await client.from('life_budget_goals').upsert({owner_id:uid,month_start:start,expense_limit:limit,savings_goal:goal}));await auth();say('予算を保存しました。')});
form('dash-password-form',async()=>{if(!user)return;const p=$('dash-password').value;if(p.length<12)throw Error('12文字以上にしてください。');check(await client.auth.updateUser({password:p}));$('dash-password-form').reset();say('パスワードを変更しました。')});
$('dash-refresh').onclick=auth;
async function loadLife(uid,run){
 const [data,done]=await Promise.all([all('life_items','id,kind,title,record_date,value,target,note,done',q=>q.eq('owner_id',uid).order('record_date',{ascending:false}).order('id')),all('life_habit_checks','habit_id',q=>q.eq('owner_id',uid).eq('check_date',$('life-check-date').value).order('habit_id'))]);
 if(!same(uid,run)||page()!=='life')return;items=data;checks=new Set(done.map(x=>x.habit_id));drawLife();
}
function drawLife(){
 const out=$('life-list'),kind=$('life-filter').value;out.replaceChildren();
 for(const r of items.filter(x=>kind==='all'||x.kind===kind)){
 const card=el('article');card.className='panel life-item';card.append(el('small',names[r.kind]+' ・ '+r.record_date),el('h3',r.title));
 if(r.value!==null)card.append(el('p',fmt(r.value)+' '+(units[r.kind]||'')));
 if(r.kind==='goal'&&r.target!==null){const progress=Math.max(0,Math.min(100,Number(r.value||0)/Number(r.target)*100));const bar=el('progress');bar.max=100;bar.value=progress;card.append(bar,el('p',fmt(r.value||0)+' / '+fmt(r.target)+'（'+Math.round(progress)+'%）'))}
 if(r.note)card.append(el('p',r.note));const actions=el('div');actions.className='actions';
 if(approved){
 if(r.kind==='todo'||r.kind==='habit'){const done=r.kind==='habit'?checks.has(r.id):r.done;actions.append(btn(done?'✓ 完了（取り消す）':'完了にする',async()=>{const uid=user.id;if(r.kind==='habit'){const date=$('life-check-date').value;if(done)check(await client.from('life_habit_checks').delete().eq('owner_id',uid).eq('habit_id',r.id).eq('check_date',date));else check(await client.from('life_habit_checks').insert({owner_id:uid,habit_id:r.id,check_date:date}))}else check(await client.from('life_items').update({done:!done}).eq('owner_id',uid).eq('id',r.id));await auth()}))}
 actions.append(btn('編集',async()=>{edit=r.id;$('life-kind').value=r.kind;$('life-title').value=r.title;$('life-date').value=r.record_date;$('life-value').value=r.value??'';$('life-target').value=r.target??'';$('life-note').value=r.note;$('life-form-title').textContent='記録を編集';setKind();$('life-form').scrollIntoView({behavior:'smooth'})}));
 }
 actions.append(btn('削除',async()=>{if(!confirm('記録を削除しますか？ 習慣の場合はチェック履歴も削除されます。'))return;check(await client.from('life_items').delete().eq('owner_id',user.id).eq('id',r.id));if(edit===r.id)reset();await auth()}));card.append(actions);out.append(card)
 }
 if(!out.children.length)out.append(el('p','記録はまだありません。'));
}
form('life-form',async()=>{if(!approved||!user)return;const uid=user.id,k=$('life-kind').value,title=$('life-title').value.trim(),date=$('life-date').value;if(!title||!date)throw Error('タイトル・日付を入力してください。');const val=units[k]&&$('life-value').value!==''?Number($('life-value').value):null,target=k==='goal'&&$('life-target').value!==''?Number($('life-target').value):null;if(val!==null&&(!Number.isFinite(val)||val<0)||target!==null&&(!Number.isFinite(target)||target<=0))throw Error('数値を確認してください。');const data={owner_id:uid,kind:k,title,record_date:date,value:val,target,note:$('life-note').value};const r=edit?await client.from('life_items').update(data).eq('id',edit).eq('owner_id',uid).select('id'):await client.from('life_items').insert(data).select('id');if(!check(r)?.length)throw Error('保存できませんでした。');if(user?.id!==uid)return;reset();await auth();say('記録を保存しました。')});
$('life-kind').onchange=setKind;$('life-cancel').onclick=reset;$('life-filter').onchange=drawLife;$('life-check-date').onchange=auth;$('life-refresh').onclick=auth;
$('life-check-date').value=day();reset();
window.addEventListener('hashchange',()=>{if(here())auth();else{epoch++;$('ad-body').hidden=true;$('ad-members').replaceChildren();$('ad-invites').replaceChildren();$('ad-code').textContent='';$('dash-body').hidden=true;$('dash-stats').replaceChildren();$('life-body').hidden=true;$('life-list').replaceChildren();items=[];checks.clear();reset()}});
window.MY_LIFE_CLIENT_PROMISE.then(c=>{client=c;c.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==user?.id)){clear();setTimeout(auth,0)}});auth()}).catch(e=>say(e.message));
})();