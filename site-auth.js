(() => {
 const c=window.MY_LIFE_VIDEO_CONFIG||{};
 window.MY_LIFE_CLIENT_PROMISE=(async()=>{
  if(!c.url||!c.publishableKey)throw new Error('クラウド接続が未設定です。');
  const url=new URL(c.url);
  if(url.protocol!=='https:')throw new Error('HTTPSのURLが必要です。');
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return createClient(url.origin,c.publishableKey);
 })();
})();
