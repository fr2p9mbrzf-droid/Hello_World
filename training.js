(() => {
'use strict';
const $=id=>document.getElementById(id), form=$('tr-form'), list=$('tr-list');
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const say=text=>$('tr-status').textContent=text;
let client,user=null,approved=false,editing=null,rows=[],generation=0,busy=false;
const active=()=>location.hash==='#training';
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const fmt=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2});
const fields=['workout_date','exercise','weight_kg','reps','sets','note'];
const catalog={"脚":["スクワット","ブルガリアンスクワット"],"腕":[],"肩":["サイドレイズ(ダンベル)","ショルダープレス(スミス)","ショルダープレス(マシン)","リアデルト"],"背中":["インクラインレバーロウ","懸垂","シーテッドロウ","デッドリフト","ラットプルダウン","ラットプルダウンEX","ロングプル"],"胸":["チェスト/ショルダープレス","チェストプレス","ディップス","ペックフライ","ベンチプレス"]};
const bodySelect=$('tr-bodypart'), exerciseSelect=$('tr-exercise');
let legacyExercise='';
function option(value,label=value){const o=el('option',label);o.value=value;return o}
function fillBody(){
 bodySelect.replaceChildren(option('','部位を選択'));
 for(const part of Object.keys(catalog))bodySelect.append(option(part,part==='腕'?'腕（準備中）':part));
 if(legacyExercise)bodySelect.append(option('legacy','過去の種目'));
}
function fillExercises(value=''){
 const part=bodySelect.value;
 const items=part==='legacy'?(legacyExercise?[legacyExercise]:[]):(catalog[part]||[]);
 exerciseSelect.replaceChildren(option('',part==='腕'?'腕の種目は準備中':part?'種目を選択':'先に部位を選択'));
 for(const name of items)exerciseSelect.append(option(name));
 if(items.includes(value))exerciseSelect.value=value;
 exerciseSelect.disabled=busy||items.length===0;
 $('tr-exercise-help').textContent=part==='腕'?'腕の種目は後から追加します。':part==='legacy'?'既存の種目名をそのまま保持しています。':'部位に対応する種目を選択してください。';
}
function restoreExercise(name){
 legacyExercise='';const part=Object.keys(catalog).find(key=>catalog[key].includes(name));
 if(!part&&name)legacyExercise=name;
 fillBody();bodySelect.value=part||(legacyExercise?'legacy':'');fillExercises(name);
}
bodySelect.onchange=()=>fillExercises();

function reset(){editing=null;form.reset();restoreExercise('');$('tr-workout_date').value=today();$('tr-form-title').textContent='トレーニングを記録';}
function clear(){generation++;user=null;approved=false;rows=[];editing=null;reset();form.hidden=true;$('tr-controls').hidden=true;$('tr-export').hidden=true;list.replaceChildren();$('tr-account').textContent='';$('tr-graph').replaceChildren();$('tr-days').textContent='—';$('tr-sets-total').textContent='—';$('tr-volume').textContent='—';}
function setBusy(value){busy=value;form.querySelectorAll('input,textarea,select,button').forEach(e=>e.disabled=value);if(!value)fillExercises(exerciseSelect.value);$('tr-refresh').disabled=value;$('tr-month').disabled=value;$('tr-filter').disabled=value;$('tr-export').disabled=value;}
function filtered(){const q=$('tr-filter').value.trim().toLowerCase();return rows.filter(x=>!q||x.exercise.toLowerCase().includes(q))}
function draw(){
 const data=filtered();list.replaceChildren();const days=new Set(data.map(r=>r.workout_date)).size;
 $('tr-days').textContent=fmt(days);$('tr-sets-total').textContent=fmt(data.reduce((a,r)=>a+r.sets,0));$('tr-volume').textContent=fmt(data.reduce((a,r)=>a+(r.weight_kg===null?0:Number(r.weight_kg)*r.reps*r.sets),0));
 const byExercise=new Map();
 for(const r of data){if(r.weight_kg===null)continue;const weight=Number(r.weight_kg);const best=byExercise.get(r.exercise);if(!best||weight>best.weight)byExercise.set(r.exercise,{weight,reps:r.reps,date:r.workout_date});}
 const graph=$('tr-graph');graph.replaceChildren();
 if(byExercise.size){for(const [name,best] of [...byExercise.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ja'))){const row=el('div');row.className='tr-best';row.append(el('strong',name),el('span',fmt(best.weight)+' kg × '+best.reps+'回'),el('small',best.date));graph.append(row)}}
 else graph.append(el('p','重量の記録はまだありません。'));
 if(!data.length){list.append(el('p','この期間の記録はありません。'));return}
 let last='';
 for(const r of data){
  if(r.workout_date!==last){last=r.workout_date;const h=el('h3',last);h.className='tr-day';list.append(h)}
  const card=el('article');card.className='panel tr-record';card.append(el('strong',r.exercise),el('p',(r.weight_kg===null?'自重':fmt(r.weight_kg)+' kg')+' × '+r.reps+'回 × '+r.sets+'セット'));
  if(r.note)card.append(el('p',r.note));
  const actions=el('div');actions.className='actions';
  if(approved){const edit=el('button','編集');edit.className='secondary';edit.onclick=()=>{if(busy)return;editing=r.id;for(const k of fields)if(k!=='exercise')$('tr-'+k).value=r[k]??'';restoreExercise(r.exercise);$('tr-form-title').textContent='記録を編集';form.scrollIntoView({behavior:'smooth'})};actions.append(edit)}
  const del=el('button','削除');del.className='secondary';del.onclick=async()=>{if(busy||!user||!confirm('このトレーニング記録を削除しますか？'))return;const uid=user.id;setBusy(true);try{const result=await client.from('training_records').delete().eq('id',r.id).eq('owner_id',uid).select('id');if(result.error)throw result.error;if(!result.data?.length)throw Error('削除できませんでした。');if(user?.id!==uid)return;if(editing===r.id)reset();await load();say('記録を削除しました。')}catch(e){say(e.message)}finally{setBusy(false)}};actions.append(del);card.append(actions);list.append(card)
 }
}
async function load(){
 if(!user||!active())return;const uid=user.id,gen=++generation,month=$('tr-month').value;
 const result=[];let offset=0;const page=500;
 while(true){let q=client.from('training_records').select('id,workout_date,exercise,weight_kg,reps,sets,note,created_at').eq('owner_id',uid).order('workout_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false});
  if(month){const [y,m]=month.split('-').map(Number);const next=m===12?(y+1)+'-01-01':y+'-'+String(m+1).padStart(2,'0')+'-01';q=q.gte('workout_date',month+'-01').lt('workout_date',next)}
  const r=await q.range(offset,offset+page-1);if(gen!==generation||user?.id!==uid)return;if(r.error)throw r.error;result.push(...r.data);if(r.data.length<page)break;offset+=page;
 }
 rows=result;draw();
}
async function sync(){
 if(!active())return;const gen=++generation;
 try{
  client=await window.MY_LIFE_CLIENT_PROMISE;
  if(gen!==generation||!active())return;
  const {data}=await client.auth.getUser();if(gen!==generation||!active())return;
  const u=data?.user||null;
  if(u?.id!==user?.id){clear();user=u}
  if(!u){clear();$('tr-account').textContent='ログインすると自分の記録を利用できます。';say('JOURNALからログインしてください。');return}
  const check=await client.rpc('journal_is_approved',{p_user:u.id});
  if(!active()||user?.id!==u.id)return;
  if(check.error)throw check.error;
  approved=check.data===true;form.hidden=!approved;$('tr-controls').hidden=false;$('tr-export').hidden=false;
  $('tr-account').textContent=approved?'自分専用のトレーニング記録':'投稿にはメンバー承認が必要です。既存の記録は閲覧・削除できます。';
  await load();if(active())say('記録は非公開です。');
 }catch(e){if(active())say('記録を読み込めません: '+e.message+'（追加SQLの設定をご確認ください）')}
}
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!user||!approved)return;const uid=user.id;
 const values={owner_id:uid};for(const k of fields)values[k]=$('tr-'+k).value;
 values.exercise=values.exercise.trim();values.weight_kg=values.weight_kg===''?null:Number(values.weight_kg);values.reps=Number(values.reps);values.sets=Number(values.sets);
 if(!values.exercise||!(bodySelect.value==='legacy'?editing&&values.exercise===legacyExercise:(catalog[bodySelect.value]||[]).includes(values.exercise))||!values.workout_date||!Number.isInteger(values.reps)||!Number.isInteger(values.sets)){say('種目・日付・回数・セット数を確認してください。');return}
 setBusy(true);try{const r=editing?await client.from('training_records').update(values).eq('id',editing).eq('owner_id',uid).select('id'):await client.from('training_records').insert(values).select('id');
 if(r.error)throw r.error;if(!r.data?.length)throw Error('保存権限がありません。');if(user?.id!==uid)return;$('tr-month').value=values.workout_date.slice(0,7);reset();await load();say('トレーニング記録を保存しました。');
 }catch(e){say('保存できません: '+e.message)}finally{setBusy(false)}
};
$('tr-cancel').onclick=reset;$('tr-refresh').onclick=()=>sync();$('tr-month').onchange=()=>load().catch(e=>say(e.message));$('tr-filter').oninput=draw;
$('tr-export').onclick=()=>{if(!user)return;const url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='training-'+($('tr-month').value||'all')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('tr-month').value=today().slice(0,7);reset();
window.addEventListener('hashchange',()=>{if(active())sync();else clear()});
window.MY_LIFE_CLIENT_PROMISE.then(c=>{client=c;c.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==user?.id)){clear();if(active())setTimeout(sync,0)}});if(active())sync()}).catch(e=>{if(active())say(e.message)});
})();
