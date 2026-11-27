(() => {
const $=id=>document.getElementById(id);
const say=(msg)=>{$('vlog-status').textContent=msg};
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
const config=window.MY_LIFE_VIDEO_CONFIG||{};
let client, owner=false, user=null, busy=false, generation=0;
const grid=$('videos'), form=$('video-upload'), login=$('video-login'), logout=$('video-logout');
const clean=()=>{grid.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load()});grid.replaceChildren()};
const setBusy=value=>{busy=value;form.querySelectorAll('input,textarea,button').forEach(e=>e.disabled=value);logout.disabled=value;grid.querySelectorAll('button[data-write]').forEach(e=>e.disabled=value)};
async function refresh(){
 const current=++generation;clean();
 const {data,error}=await client.from('vlog_videos').select('id,path,title,description,published,created_at').order('created_at',{ascending:false});
 if(current!==generation)return;
 if(error){say('投稿一覧を取得できません: '+error.message);return}
 if(!data.length){grid.append(node('p','まだ動画・写真がありません。'));return}
 for(const item of data){
  const card=node('article');card.className='panel';
  const isImage=/\.(jpe?g|png|webp|gif)$/i.test(item.path);
  card.append(node('small',new Date(item.created_at).toLocaleDateString('ja-JP')+(isImage?' ・ 写真':' ・ 動画')+(owner?(item.published?' ・ 公開中':' ・ 非公開'):'')),node('h2',item.title),node('p',item.description));
  const play=node('button',isImage?'写真を表示':'▶ 動画を再生');play.type='button';
  play.onclick=async()=>{play.disabled=true;try{
   const {data,error}=await client.storage.from('vlog-videos').createSignedUrl(item.path,3600);if(error)throw error;
   if(current!==generation)return;
   if(isImage){
    const img=node('img');img.alt=item.title;img.loading='lazy';img.decoding='async';img.className='vlog-photo';img.referrerPolicy='no-referrer';img.src=data.signedUrl;
    img.onerror=()=>{if(current===generation){say('写真を表示できません。');img.replaceWith(play);play.disabled=false}};
    play.replaceWith(img);
   }else{
    const v=node('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.style.width='100%';v.src=data.signedUrl;play.replaceWith(v);
   }
  }catch(e){say('表示リンクの取得に失敗: '+e.message);play.disabled=false}};
  card.append(play);
  if(isImage)play.click();
  if(owner){const actions=node('div');actions.className='actions';actions.style.marginTop='12px';
   const toggle=node('button',item.published?'非公開にする':'公開する');toggle.className='secondary';toggle.dataset.write='true';
   toggle.onclick=async()=>{if(busy)return;if(!item.published&&!confirm('この投稿をインターネット上の誰でも閲覧できる状態にしますか？'))return;setBusy(true);try{const {error}=await client.from('vlog_videos').update({published:!item.published}).eq('id',item.id);if(error)throw error;say(item.published?'非公開に変更しました。発行済みの表示リンクは最大1時間有効です。':'公開しました。');await refresh()}catch(e){say(e.message)}finally{setBusy(false)}};
   const del=node('button','削除');del.className='secondary';del.dataset.write='true';
   del.onclick=async()=>{if(busy||!confirm('この投稿のファイルをクラウドから完全に削除しますか？'))return;setBusy(true);try{const {error}=await client.from('vlog_videos').update({published:false}).eq('id',item.id);if(error)throw error;const removed=await client.storage.from('vlog-videos').remove([item.path]);if(removed.error)throw removed.error;const result=await client.from('vlog_videos').delete().eq('id',item.id);if(result.error)throw result.error;say('投稿を削除しました。');await refresh()}catch(e){say('削除できませんでした: '+e.message);await refresh()}finally{setBusy(false)}};
   actions.append(toggle,del);card.append(actions);
  }
  grid.append(card);
 }
}
async function sync(){
 const result=await client.auth.getUser();
 user=result.data?.user||null;owner=false;
 if(user){const check=await client.rpc('is_vlog_owner');owner=check.data===true&&!check.error}
 login.hidden=owner;logout.hidden=!user;form.hidden=!owner;
 if(user&&!owner)say('このアカウントには投稿権限がありません。');
 await refresh();
}
async function init(){
 if(!config.url||!config.publishableKey){$('vlog-setup-notice').hidden=false;grid.append(node('p','クラウド接続後、ここに動画・写真が表示されます。'));return}
 try{
 const url=new URL(config.url);if(url.protocol!=='https:')throw new Error('HTTPSのプロジェクトURLが必要です。');
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
 client=createClient(url.origin,config.publishableKey);login.hidden=false;
 await sync();
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){owner=false;user=null;form.hidden=true;login.hidden=false;logout.hidden=true;generation++;clean();setTimeout(()=>refresh().catch(e=>say(e.message)),0)}});
 }catch(e){say('クラウド接続に失敗: '+e.message)}
}
login.onsubmit=async e=>{e.preventDefault();const b=login.querySelector('button');b.disabled=true;say('ログイン中…');try{const {error}=await client.auth.signInWithPassword({email:$('vlog-email').value,password:$('vlog-password').value});if(error)throw error;login.reset();say('ログインしました。');await sync()}catch(e){say('ログインできません: '+e.message)}finally{b.disabled=false}};
logout.onclick=async()=>{if(busy)return;try{const {error}=await client.auth.signOut();if(error)throw error;say('ログアウトしました。');await sync()}catch(e){say(e.message)}};
form.onsubmit=async e=>{e.preventDefault();if(!owner||!user||busy)return;const f=$('vlog-file').files[0];const title=$('vlog-title').value.trim();const description=$('vlog-description').value.trim();
 if(!f||!title){say('動画または画像ファイルとタイトルを入力してください。');return}
 const ext={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[f.type];
 if(!ext||f.size>50000000||f.size===0){say('MP4 / WebM / MOV / JPEG / PNG / WebP / GIF の50MB以下のファイルを選択してください。');return}
 const path=user.id+'/'+crypto.randomUUID()+'.'+ext;setBusy(true);say('アップロード中…画面を閉じないでください。');let uploaded=false;
 try{
  const up=await client.storage.from('vlog-videos').upload(path,f,{contentType:f.type,upsert:false});if(up.error)throw up.error;uploaded=true;
  const inserted=await client.from('vlog_videos').insert({owner_id:user.id,path,title,description,published:false});if(inserted.error)throw inserted.error;uploaded=false;
  form.reset();say('アップロード完了。非公開で保存しました。');await refresh();
 }catch(e){let extra='';if(uploaded){try{const cleanup=await client.storage.from('vlog-videos').remove([path]);if(cleanup.error)extra=' 残ったファイルはStorageから確認してください。'}catch(_){extra=' 残ったファイルはStorageから確認してください。'}}say('アップロードできません: '+e.message+extra)}finally{setBusy(false)}
};
init();
})();