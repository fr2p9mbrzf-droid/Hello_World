(() => {
'use strict';
const $=id=>document.getElementById(id),form=$('bu-form'),list=$('bu-list');
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const categories={expense:['食費','外食','日用品','住居費','水道・光熱費','通信費','交通費','車','医療・健康','美容・衣服','趣味・娯楽','交際費','教育・学習','旅行','保険・税金','その他'],income:['給与','賞与','副業','臨時収入','その他']};
const fmt=n=>Number(n).toLocaleString('ja-JP')+'円';
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const active=()=>location.hash==='#budget';
const say=t=>$('bu-status').textContent=t;
let client,user=null,approved=false,editing=null,rows=[],gen=0,busy=false;
function options(value=''){
 const select=$('bu-category'),kind=$('bu-kind').value;
 select.replaceChildren();
 const empty=el('option','カテゴリを選択');empty.value='';select.append(empty);
 const values=[...categories[kind]];if(value&&!values.includes(value))values.push(value);
 for(const name of values){const o=el('option',name);o.value=name;select.append(o)}
 select.value=value;
}
function reset(){editing=null;form.reset();$('bu-date').value=today();$('bu-kind').value='expense';options();$('bu-form-title').textContent='新しい記録';}
function clear(){gen++;user=null;approved=false;rows=[];reset();form.hidden=true;$('bu-data').hidden=true;list.replaceChildren();$('bu-categories').replaceChildren();$('bu-account').textContent='';for(const id of ['bu-income','bu-expense','bu-balance'])$(id).textContent='—';}
function setBusy(v){busy=v;form.querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=v);for(const id of ['bu-month','bu-prev','bu-next','bu-refresh','bu-export','bu-filter'])$(id).disabled=v;}
function draw(){
 const income=rows.filter(r=>r.kind==='income').reduce((a,r)=>a+r.amount_yen,0),expense=rows.filter(r=>r.kind==='expense').reduce((a,r)=>a+r.amount_yen,0);
 $('bu-income').textContent=fmt(income);$('bu-expense').textContent=fmt(expense);$('bu-balance').textContent=fmt(income-expense);$('bu-balance').classList.toggle('bu-negative',income-expense<0);
 const sums=new Map();for(const r of rows)if(r.kind==='expense')sums.set(r.category,(sums.get(r.category)||0)+r.amount_yen);
 const cat=$('bu-categories');cat.replaceChildren();
 for(const [name,n] of [...sums].sort((a,b)=>b[1]-a[1])){const row=el('div');row.className='bu-cat';const top=el('div');top.className='bu-cat-head';top.append(el('span',name),el('strong',fmt(n)+' · '+Math.round(n/expense*100)+'%'));const bar=el('div');bar.className='bu-bar';const fill=el('div');fill.style.width=n/expense*100+'%';bar.append(fill);row.append(top,bar);cat.append(row)}
 if(!expense)cat.append(el('p','この月の支出はありません。'));
 const mode=$('bu-filter').value;const data=rows.filter(r=>mode==='all'||r.kind===mode);list.replaceChildren();
 if(!data.length){list.append(el('p','この月の記録はありません。'));return}
 let last='';
 for(const r of data){
  if(last!==r.record_date){last=r.record_date;list.append(el('h3',last))}
  const card=el('article');card.className='panel bu-row';
  const top=el('div');top.className='bu-row-head';const desc=el('div');desc.append(el('strong',r.category),el('small',r.kind==='income'?'収入':'支出'));
  const amount=el('strong',(r.kind==='income'?'+':'−')+fmt(r.amount_yen));amount.className=r.kind==='income'?'bu-positive':'bu-negative';top.append(desc,amount);card.append(top);
  if(r.note)card.append(el('p',r.note));
  const actions=el('div');actions.className='actions';
  if(approved){const b=el('button','編集');b.className='secondary';b.onclick=()=>{if(busy)return;editing=r.id;$('bu-date').value=r.record_date;$('bu-kind').value=r.kind;options(r.category);$('bu-amount').value=r.amount_yen;$('bu-note').value=r.note;$('bu-form-title').textContent='記録を編集';form.scrollIntoView({behavior:'smooth'})};actions.append(b)}
  const del=el('button','削除');del.className='secondary';del.onclick=async()=>{if(busy||!user||!confirm('この記録を削除しますか？'))return;const uid=user.id;setBusy(true);try{const res=await client.from('budget_records').delete().eq('id',r.id).eq('owner_id',uid).select('id');if(res.error)throw res.error;if(!res.data?.length)throw Error('削除できませんでした。');if(user?.id!==uid||!active())return;if(editing===r.id)reset();await load();say('削除しました。')}catch(e){if(active()&&user?.id===uid)say(e.message)}finally{setBusy(false)}};actions.append(del);card.append(actions);list.append(card)
 }
}
async function load(){
 if(!user||!active())return;const uid=user.id,run=++gen,month=$('bu-month').value;
 if(!/^\d{4}-\d{2}$/.test(month)){say('対象月を選択してください。');return}
 const [y,m]=month.split('-').map(Number),next=m===12?(y+1)+'-01-01':y+'-'+String(m+1).padStart(2,'0')+'-01';
 let data=[],offset=0;
 while(true){
  const res=await client.from('budget_records').select('id,record_date,kind,amount_yen,category,note,created_at').eq('owner_id',uid).gte('record_date',month+'-01').lt('record_date',next).order('record_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
  if(run!==gen||user?.id!==uid||!active())return;if(res.error)throw res.error;data.push(...res.data);if(res.data.length<500)break;offset+=500;
 }
 rows=data;draw();
}
async function sync(){
 if(!active())return;const run=++gen;
 try{
  client=await window.MY_LIFE_CLIENT_PROMISE;if(run!==gen||!active())return;
  const r=await client.auth.getUser();if(run!==gen||!active())return;const u=r.data?.user||null;
  if(u?.id!==user?.id){clear();user=u}
  if(!u){clear();$('bu-account').textContent='ログインして家計簿を使う';say('JOURNALからログインしてください。');return}
  const current=++gen;const a=await client.rpc('journal_is_approved',{p_user:u.id});if(current!==gen||!active()||user?.id!==u.id)return;
  if(a.error)throw a.error;approved=a.data===true;form.hidden=!approved;$('bu-data').hidden=false;
  $('bu-account').textContent=approved?'自分専用の家計簿':'記録の追加にはメンバー承認が必要です。';
  await load();if(active()&&user?.id===u.id)say('記録は非公開です。');
 }catch(e){if(active())say('家計簿を読み込めません: '+e.message+'（統合SQLの設定をご確認ください）')}
}
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!approved||!user)return;
 const uid=user.id,amount=Number($('bu-amount').value),kind=$('bu-kind').value,category=$('bu-category').value,date=$('bu-date').value;
 if(!date||!category||!Number.isInteger(amount)||amount<1||amount>1000000000){say('日付・カテゴリ・金額を確認してください。');return}
 const data={owner_id:uid,record_date:date,kind,category,amount_yen:amount,note:$('bu-note').value};
 setBusy(true);try{const res=editing?await client.from('budget_records').update(data).eq('id',editing).eq('owner_id',uid).select('id'):await client.from('budget_records').insert(data).select('id');
 if(res.error)throw res.error;if(!res.data?.length)throw Error('保存権限がありません。');if(user?.id!==uid||!active())return;$('bu-month').value=date.slice(0,7);reset();await load();say('記録を保存しました。');
 }catch(e){if(active()&&user?.id===uid)say('保存できません: '+e.message)}finally{setBusy(false)}
};
function changeMonth(delta){const [y,m]=($('bu-month').value||today().slice(0,7)).split('-').map(Number),d=new Date(y,m-1+delta,1);$('bu-month').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');refreshRows()}
function refreshRows(){rows=[];draw();load().catch(e=>{if(active())say(e.message)})}
$('bu-kind').onchange=()=>options();$('bu-cancel').onclick=reset;$('bu-refresh').onclick=sync;$('bu-prev').onclick=()=>changeMonth(-1);$('bu-next').onclick=()=>changeMonth(1);$('bu-month').onchange=refreshRows;$('bu-filter').onchange=draw;
$('bu-export').onclick=()=>{if(!user)return;const url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='my-life-budget-'+$('bu-month').value+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('bu-month').value=today().slice(0,7);reset();
window.addEventListener('hashchange',()=>{if(active())sync();else clear()});
window.MY_LIFE_CLIENT_PROMISE.then(c=>{client=c;c.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==user?.id)){clear();if(active())setTimeout(sync,0)}});if(active())sync()}).catch(e=>{if(active())say(e.message)});
})();