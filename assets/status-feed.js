// Optional same-origin public LIVE-state feed.
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const STATES=new Set(['live','scheduled','offline','unknown']);
export function resolveStatusFeedUrl(value,pageUrl){
  if(!value || typeof value!=='string')return null;
  try{
    const url=new URL(value,pageUrl), page=new URL(pageUrl);
    if(url.origin!==page.origin || !['https:','http:'].includes(url.protocol))return null;
    if(url.username || url.password)return null;
    if(url.search || url.hash)return null;
    return url.href;
  }catch{return null;}
}
export function parseStatusFeed(document,cameras,now=Date.now()){
  if(!document || typeof document!=='object' || Array.isArray(document) || !Array.isArray(document.cameras))return null;
  const checked=Date.parse(document.checkedAt||'');
  if(!Number.isFinite(checked) || checked>now+5*60000 || now-checked>30*60000)return null;
  const byId=new Map(cameras.map(c=>[c.id,c]));
  const updates=new Map();
  for(const candidate of document.cameras){
    if(!candidate || typeof candidate!=='object')continue;
    const original=byId.get(candidate.cameraId);
    if(!original || updates.has(candidate.cameraId) || !STATES.has(candidate.status))continue;
    const id=candidate.currentVideoId||candidate.videoId||original.videoId;
    if(!VIDEO_ID.test(id))continue;
    const timestamp=Date.parse(candidate.checkedAt||document.checkedAt);
    if(!Number.isFinite(timestamp) || timestamp>now+5*60000 || now-timestamp>30*60000)continue;
    updates.set(candidate.cameraId,{
      videoId:id,status:candidate.status,
      embeddable:typeof candidate.embeddable==='boolean'?candidate.embeddable:original.embeddable,
      checkedAt:new Date(timestamp).toISOString(),
      scheduledStartAt:typeof candidate.scheduledStartAt==='string'?candidate.scheduledStartAt:null,
      actualStartAt:typeof candidate.actualStartAt==='string'?candidate.actualStartAt:null,
      actualEndAt:typeof candidate.actualEndAt==='string'?candidate.actualEndAt:null,
    });
  }
  return updates.size?updates:null;
}
