import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.13.0/dist/maplibre-gl.mjs';
import { parseStatusFeed, resolveStatusFeedUrl } from './status-feed.js';

const app = document.querySelector('#app');
const lang = app.dataset.language === 'ja' ? 'ja' : 'en';
const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
const t = {
  ja:{title:'動物ライブカメラ地図',sub:'Animal Live Map',search:'動物・施設・場所を検索',live:'LIVEのみ',all:'すべて',wild:'野生',zoo:'動物園',aquarium:'水族館',nest:'巣・営巣',feeder:'餌場',reset:'リセット',cameras:'カメラ一覧',map:'地図',sat:'衛星写真',official:'公式サイト',youtube:'YouTubeで見る',share:'共有',basic:'基本情報',status:'状態',local:'現地の時刻',timezone:'タイムゾーン',related:'このカメラで見られる動物',unknown:'確認中',liveNow:'LIVE配信中',scheduledState:'配信予定',offline:'オフライン',checked:'最終確認',scheduled:'時間帯配信',continuous:'継続配信',seasonal:'季節配信',mapTab:'地図',listTab:'一覧',animalsTab:'動物',settingsTab:'設定',results:'検索結果',cancel:'キャンセル',language:'言語',theme:'テーマ',light:'ライト',dark:'ダーク',system:'システム',approx:'保護のため地図は代表位置です。',locationHidden:'保護のためこの地点の位置を地図には表示していません。',no:'条件に一致するカメラがありません',camUnit:'台のカメラ',animalFilter:'動物',regionFilter:'地域',localTimeFilter:'現地時間',day:'昼',night:'夜',back:'戻る',close:'閉じる',playbackUnavailable:'この映像は現在サイト内で再生できません。YouTubeで確認してください。'},
  en:{title:'Animal Live Map',sub:'動物ライブカメラ地図',search:'Search animals, facilities, and places',live:'LIVE only',all:'All',wild:'Wild',zoo:'Zoo',aquarium:'Aquarium',nest:'Nest',feeder:'Feeder',reset:'Reset',cameras:'Cameras',map:'Map',sat:'Satellite',official:'Official site',youtube:'Watch on YouTube',share:'Share',basic:'Basic information',status:'Status',local:'Local time',timezone:'Timezone',related:'Animal on this camera',unknown:'Pending',liveNow:'LIVE now',scheduledState:'Scheduled',offline:'Offline',checked:'Last checked',scheduled:'Scheduled hours',continuous:'Continuous',seasonal:'Seasonal',mapTab:'Map',listTab:'List',animalsTab:'Animals',settingsTab:'Settings',results:'Search results',cancel:'Cancel',language:'Language',theme:'Theme',light:'Light',dark:'Dark',system:'System',approx:'The map uses a representative location for protection.',locationHidden:'This location is not shown on the map for protection.',no:'No cameras match these filters',camUnit:'cameras',animalFilter:'Animal',regionFilter:'Region',localTimeFilter:'Local time',day:'Day',night:'Night',back:'Back',close:'Close',playbackUnavailable:"This stream can't currently be played here. Check it on YouTube."}
}[lang];

const state={data:null,query:'',type:'all',focus:'all',animal:'all',region:'all',localPeriod:'all',liveOnly:false,runtimeAvailable:false,selectedCamera:null,selectedLocation:null,mapMode:'map',theme:localStorage.getItem('alm-theme')||'system',maps:{desktop:null,mobile:null},overlay:null};
const countryNames=new Intl.DisplayNames([locale],{type:'region'});
const typeEmoji={wild:'🌲',zoo:'🏛️',aquarium:'🐟'};
const typeText={wild:t.wild,zoo:t.zoo,aquarium:t.aquarium};
const optionalStatusFeed = resolveStatusFeedUrl(app.dataset.liveStatusEndpoint || '', location.href);
const staticCameraValues = new Map();
const mapStyle='https://tiles.openfreemap.org/styles/liberty';
const satStyle={version:8,sources:{sat:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Tiles © Esri'}},layers:[{id:'sat',type:'raster',source:'sat'}]};
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locName=l=>lang==='ja'?(l.nameJa||l.nameNative||l.nameEn):(l.nameEn||l.nameNative||l.nameJa);
const camName=c=>lang==='ja'?(c.nameJa||c.nameNative||c.nameEn):(c.nameEn||c.nameNative||c.nameJa);
const animalName=c=>lang==='ja'?(c.animalJa||c.animalEn):(c.animalEn||c.animalJa);
const regionName=l=>lang==='ja'?(l.regionJa||l.regionNative||l.regionEn):(l.regionEn||l.regionNative||l.regionJa);
const cityName=l=>lang==='ja'?(l.cityJa||l.cityNative||l.cityEn):(l.cityEn||l.cityNative||l.cityJa);
const countryName=l=>{try{return countryNames.of(l.countryCode)||l.countryCode}catch{return l.countryCode}};
const thumb=c=>`https://i.ytimg.com/vi/${encodeURIComponent(c.videoId)}/hqdefault.jpg`;
const locationFor=c=>state.data.locations.find(l=>l.id===c.locationId);
const schedule=c=>t[c.scheduleType]||c.scheduleType;
const localTime=l=>{try{return new Intl.DateTimeFormat(locale,{timeZone:l.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())}catch{return '—'}};
const localPeriod=l=>{try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:l.timezone,hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const h=Number(parts.find(p=>p.type==='hour')?.value);return Number.isFinite(h)&&h>=6&&h<18?'day':'night'}catch{return 'unknown'}};
const safeOfficialUrl=c=>{try{const u=new URL(c.officialUrl);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password?u.href:null}catch{return null}};
const statusLabel=c=>c.streamStatus==='live'?t.liveNow:c.streamStatus==='scheduled'?t.scheduledState:c.streamStatus==='offline'?t.offline:t.unknown;
const statusBadgeClass=c=>c.streamStatus==='live'?'live':c.streamStatus==='scheduled'?'scheduled':c.streamStatus==='offline'?'offline':'';
const relativeChecked=c=>{if(!c.statusCheckedAt)return '—';const ms=Date.now()-new Date(c.statusCheckedAt).getTime();if(!Number.isFinite(ms)||ms<0)return '—';const min=Math.floor(ms/60000);if(lang==='ja'){if(min<1)return 'たった今';if(min<60)return `${min}分前`;const h=Math.floor(min/60);return h<24?`${h}時間前`:`${Math.floor(h/24)}日前`}if(min<1)return 'just now';if(min<60)return `${min} min ago`;const h=Math.floor(min/60);return h<24?`${h} hr ago`:`${Math.floor(h/24)} d ago`};
let youtubeApiPromise=null;
function loadYouTubePlayerApi(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(youtubeApiPromise)return youtubeApiPromise;
  youtubeApiPromise=new Promise((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{if(typeof previous==='function')previous();resolve(window.YT)};
    const script=document.createElement('script');
    script.src='https://www.youtube.com/iframe_api';
    script.async=true;
    script.onerror=()=>reject(new Error('YouTube player API failed to load'));
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}
const playerMarkup=(c,id)=>c.embeddable===false
  ?`<div class="player-fallback"><p>${esc(t.playbackUnavailable)}</p><a class="action youtube" href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}" target="_blank" rel="noopener">▶ ${esc(t.youtube)}</a></div>`
  :`<iframe id="${esc(id)}" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(c.videoId)}?playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${esc(camName(c))}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
function showPlayerFallback(id,c){
  const iframe=document.getElementById(id);
  const box=iframe?.parentElement;
  if(!box)return;
  box.innerHTML=`<div class="player-fallback"><p>${esc(t.playbackUnavailable)}</p><a class="action youtube" href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}" target="_blank" rel="noopener">▶ ${esc(t.youtube)}</a></div>`;
}
async function watchPlayer(id,c){
  if(c.embeddable===false)return;
  if(!document.getElementById(id))return;
  try{
    const YT=await loadYouTubePlayerApi();
    if(!document.getElementById(id))return;
    new YT.Player(id,{events:{onError:()=>showPlayerFallback(id,c)}});
  }catch{}
}

const previewMarkup=c=>`<button type="button" class="video-preview" data-play-camera="${esc(c.id)}" aria-label="${esc(lang==='ja'?'動画を再生':'Play video')}" style="--preview-url:url('${thumb(c)}')"><span class="video-preview-play">▶</span><span class="video-preview-label">${esc(lang==='ja'?'サイト内で再生':'Play here')}</span></button>`;
function openPlayer(c){
  const layer=document.getElementById('playerLayer');
  if(!layer)return;
  const same=(!layer.hidden && layer.dataset.videoId===c.videoId && layer.dataset.cameraId===c.id);
  layer.querySelector('#playerTitle').textContent=camName(c);
  layer.querySelector('#playerYoutube').href=`https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}`;
  const official=safeOfficialUrl(c),officialLink=layer.querySelector('#playerOfficial');
  officialLink.hidden=!official;
  if(official)officialLink.href=official;
  layer.querySelector('#playerMetaTitle').textContent=camName(c);
  if(!same){
    layer.querySelector('#playerBody').innerHTML=playerMarkup(c,'floating-youtube-player');
    layer.dataset.cameraId=c.id;
    layer.dataset.videoId=c.videoId;
    watchPlayer('floating-youtube-player',c);
  }
  layer.hidden=false;
  layer.querySelector('#playerClose').focus({preventScroll:true});
}
function closePlayer(){
  const layer=document.getElementById('playerLayer');
  if(!layer||layer.hidden)return;
  layer.hidden=true;
  layer.querySelector('#playerBody').replaceChildren(); // Removes iframe and stops playback.
  layer.dataset.cameraId='';layer.dataset.videoId='';
}
function syncOpenPlayer(){
  const layer=document.getElementById('playerLayer');
  if(!layer||layer.hidden)return;
  const c=state.data.cameras.find(x=>x.id===state.selectedCamera);
  if(c)openPlayer(c);
}
function enablePlayerDrag(){
  const layer=document.getElementById('playerLayer');
  const head=layer.querySelector('#playerDragHandle');
  let drag=null;
  head.addEventListener('pointerdown',e=>{
    if(matchMedia('(max-width:900px)').matches||e.target.closest('button, a'))return;
    const rect=layer.getBoundingClientRect();
    drag={dx:e.clientX-rect.left,dy:e.clientY-rect.top};
    layer.style.transform='none';layer.style.left=`${rect.left}px`;layer.style.top=`${rect.top}px`;
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove',e=>{
    if(!drag)return;
    layer.style.left=`${Math.min(Math.max(0,innerWidth-layer.offsetWidth),Math.max(0,e.clientX-drag.dx))}px`;
    layer.style.top=`${Math.min(Math.max(0,innerHeight-layer.offsetHeight),Math.max(0,e.clientY-drag.dy))}px`;
  });
  const stop=()=>{drag=null};
  head.addEventListener('pointerup',stop);head.addEventListener('pointercancel',stop);
}

function restoreStaticCameraState(){
  for(const c of state.data.cameras){
    const base=staticCameraValues.get(c.id);
    if(!base)continue;
    c.videoId=base.videoId;
    c.embeddable=base.embeddable;
    c.streamStatus='unknown';
    c.statusCheckedAt=null;
    c.scheduledStartAt=null;
    c.actualStartAt=null;
    c.actualEndAt=null;
  }
}
async function loadRuntimeStatus(){
  if(!optionalStatusFeed){state.runtimeAvailable=false;return false;}
  let updates=null;
  try{
    const response=await fetch(optionalStatusFeed,{cache:'no-store'});
    if(response.ok){
      updates=parseStatusFeed(await response.json(),state.data.cameras);
    }
  }catch{}
  restoreStaticCameraState();
  if(!updates){state.runtimeAvailable=false;return false;}
  for(const c of state.data.cameras){
    const update=updates.get(c.id);
    if(!update)continue;
    c.videoId=update.videoId;
    c.embeddable=update.embeddable;
    c.streamStatus=update.status;
    c.statusCheckedAt=update.checkedAt;
    c.scheduledStartAt=update.scheduledStartAt;
    c.actualStartAt=update.actualStartAt;
    c.actualEndAt=update.actualEndAt;
  }
  state.runtimeAvailable=true;
  return true;
}
async function runtimeProbe(){
  await loadRuntimeStatus();
  applyRuntimeAvailabilityUi();
  refresh();
  updateOpenMobileStatus();
  syncOpenPlayer();
  syncUrl();
  if(optionalStatusFeed){setTimeout(runtimeProbe,state.runtimeAvailable?300000:1800000);}
}

function updateOpenMobileStatus(){
  const panel=document.querySelector('#mobileDetail');
  if(!panel||!panel.classList.contains('open'))return;
  const c=state.data.cameras.find(x=>x.id===state.selectedCamera);
  if(!c)return;
  const preview=panel.querySelector('.mobile-player'),body=panel.querySelector('.mobile-detail-body');
  if(!preview||!body)return;
  if(panel.dataset.videoId!==c.videoId){preview.innerHTML=previewMarkup(c);panel.dataset.videoId=c.videoId;}
  body.innerHTML=infoDetail(c,locationFor(c),true);
  body.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',share));
  syncOpenPlayer();
}

function applyTheme(){const dark=state.theme==='dark'||(state.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark)}
function chip(kind,value,icon,label,extra=''){return `<button class="chip ${extra}" data-filter-kind="${kind}" data-filter-value="${value}" type="button" aria-pressed="false">${icon} ${esc(label)}</button>`}
function animalOptions(){const m=new Map();for(const c of state.data?.cameras||[]){const key=(c.animalEn||c.animalJa||'').trim().toLocaleLowerCase();if(!key)continue;if(!m.has(key))m.set(key,animalName(c))}return [...m.entries()].sort((a,b)=>a[1].localeCompare(b[1],locale))}
function regionOptions(){const m=new Map();for(const l of state.data?.locations||[]){if(!l.countryCode)continue;if(!m.has(l.countryCode))m.set(l.countryCode,countryName(l))}return [...m.entries()].sort((a,b)=>a[1].localeCompare(b[1],locale))}
function selectFacet(kind,label,icon,options,value){return `<label class="select-chip">${icon}<select data-select-kind="${kind}" aria-label="${esc(label)}"><option value="all">${esc(label)}</option>${options.map(([v,n])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(n)}</option>`).join('')}</select></label>`}
function filterMarkup(){return [chip('live','live','🔴',t.live,'live'),chip('type','all','◉',t.all),chip('type','wild','🌲',t.wild),chip('type','zoo','🏛️',t.zoo),chip('type','aquarium','🐟',t.aquarium),chip('focus','nest','🪺',t.nest),chip('focus','feeder','🌿',t.feeder),selectFacet('animal',t.animalFilter,'🐾',animalOptions(),state.animal),selectFacet('region',t.regionFilter,'🌐',regionOptions(),state.region),selectFacet('localPeriod',t.localTimeFilter,'◷',[['day',t.day],['night',t.night]],state.localPeriod)].join('')}

function renderShell(){
  app.innerHTML=`
  <header class="topbar"><a class="brand" href="./"><img src="../assets/paw.svg" alt=""><span><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></span></a><label class="search">⌕<input id="searchDesktop" aria-label="${esc(t.search)}" placeholder="${esc(t.search)}" type="search"></label><div class="actions"><button id="langDesktop" class="btn" aria-label="${esc(t.language)}">🌐 ${lang==='ja'?'日本語':'English'}</button><button id="themeDesktop" class="btn" aria-label="${esc(t.theme)}">◐</button><button id="menuDesktop" class="btn" aria-label="${esc(t.settingsTab)}" aria-expanded="false">☰</button><div id="desktopMenu" class="desktop-menu" hidden><section><b>${esc(t.language)}</b><div><button data-desktop-lang="ja" class="${lang==='ja'?'active':''}">日本語</button><button data-desktop-lang="en" class="${lang==='en'?'active':''}">English</button></div></section><section><b>${esc(t.theme)}</b><div><button data-desktop-theme="light" class="${state.theme==='light'?'active':''}">${esc(t.light)}</button><button data-desktop-theme="dark" class="${state.theme==='dark'?'active':''}">${esc(t.dark)}</button><button data-desktop-theme="system" class="${state.theme==='system'?'active':''}">${esc(t.system)}</button></div></section></div></div></header>
  <nav id="filtersDesktop" class="filterbar">${filterMarkup()}<button data-reset-filters class="chip">↻ ${esc(t.reset)}</button></nav>
  <main class="layout"><aside class="sidebar"><div class="section-head"><div><strong>${esc(t.cameras)}</strong><span id="desktopCount" class="count" aria-live="polite"></span></div></div><div id="desktopList" class="camera-list"></div></aside><section class="map-wrap"><div id="map"></div><div class="map-switch"><button data-map-mode="map" class="active" aria-pressed="true">${esc(t.map)}</button><button data-map-mode="satellite" aria-pressed="false">${esc(t.sat)}</button></div></section><aside class="detail"><div id="desktopDetail" class="detail-scroll"></div></aside></main>
  <section class="mobile"><header class="mobile-head"><a class="brand" href="./"><img src="../assets/paw.svg" alt=""><b>${esc(t.title)}</b></a><div class="mobile-actions"><button id="openSearch" class="round" aria-label="${esc(t.search)}">⌕</button><button id="openMenu" class="round" aria-label="${esc(t.settingsTab)}">☰</button></div></header><nav id="filtersMobile" class="mobile-filters">${filterMarkup()}<button data-reset-filters class="chip">↻ ${esc(t.reset)}</button></nav><div class="mobile-main"><div id="mobileMap"></div><section id="sheet" class="sheet"></section><section id="overlay" class="overlay"></section><section id="mobileDetail" class="mobile-detail"></section><nav class="tabs"><button class="tab active" data-tab="map" aria-current="page"><b>🌐</b>${esc(t.mapTab)}</button><button class="tab" data-tab="list"><b>☷</b>${esc(t.listTab)}</button><button class="tab" data-tab="animals"><b>🐾</b>${esc(t.animalsTab)}</button><button class="tab" data-tab="settings"><b>⚙</b>${esc(t.settingsTab)}</button></nav></div></section>
  <section class="player-layer" id="playerLayer" role="dialog" aria-label="${esc(lang==='ja'?'動画プレイヤー':'Video player')}" hidden>
    <div class="player-head" id="playerDragHandle"><strong class="player-title" id="playerTitle"></strong><button class="player-close" id="playerClose" type="button">${esc(t.close)} ×</button></div>
    <div class="player-body" id="playerBody"></div>
    <div class="player-meta"><b id="playerMetaTitle"></b><div class="player-links"><a id="playerOfficial" href="#" target="_blank" rel="noopener noreferrer" hidden>${esc(t.official)}</a><a id="playerYoutube" href="#" target="_blank" rel="noopener noreferrer">${esc(t.youtube)}</a></div></div>
  </section>`;
}
function matches(c,{ignoreAnimal=false}={}){const l=locationFor(c);if(state.type!=='all'&&l.environmentType!==state.type)return false;if(state.focus!=='all'&&c.focus!==state.focus)return false;if(!ignoreAnimal&&state.animal!=='all'&&(c.animalEn||c.animalJa||'').trim().toLocaleLowerCase()!==state.animal)return false;if(state.region!=='all'&&l.countryCode!==state.region)return false;if(state.localPeriod!=='all'&&localPeriod(l)!==state.localPeriod)return false;if(state.liveOnly&&c.streamStatus!=='live')return false;if(!state.query)return true;const q=state.query.toLocaleLowerCase();return[c.nameNative,c.nameJa,c.nameEn,c.animalJa,c.animalEn,l.nameNative,l.nameJa,l.nameEn,l.regionNative,l.regionJa,l.regionEn,l.cityNative,l.cityJa,l.cityEn,countryName(l)].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)}
const filtered=(opts)=>state.data.cameras.filter(c=>matches(c,opts));
function readUrlState(){const p=new URL(location.href).searchParams;state.query=p.get('q')||'';state.type=p.get('type')||'all';state.focus=p.get('focus')||'all';state.animal=p.get('animal')||'all';state.region=p.get('region')||'all';state.localPeriod=p.get('local')||'all';state.liveOnly=p.get('live')==='1'}
function normalizeFacetState(){const types=new Set(['all',...state.data.locations.map(l=>l.environmentType)]),focuses=new Set(['all',...state.data.cameras.map(c=>c.focus)]),animals=new Set(['all',...animalOptions().map(([v])=>v)]),regions=new Set(['all',...regionOptions().map(([v])=>v)]),localPeriods=new Set(['all','day','night']);if(!types.has(state.type))state.type='all';if(!focuses.has(state.focus))state.focus='all';if(!animals.has(state.animal))state.animal='all';if(!regions.has(state.region))state.region='all';if(!localPeriods.has(state.localPeriod))state.localPeriod='all'}
function syncUrl(){const u=new URL(location.href);const p=u.searchParams;for(const k of ['camera','q','type','focus','animal','region','local','live'])p.delete(k);if(state.query)p.set('q',state.query);if(state.type!=='all')p.set('type',state.type);if(state.focus!=='all')p.set('focus',state.focus);if(state.animal!=='all')p.set('animal',state.animal);if(state.region!=='all')p.set('region',state.region);if(state.localPeriod!=='all')p.set('local',state.localPeriod);if(state.liveOnly&&state.runtimeAvailable)p.set('live','1');if(state.selectedCamera)p.set('camera',state.selectedCamera);history.replaceState({},'',u)}
function applyRuntimeAvailabilityUi(){
  if(!state.runtimeAvailable)state.liveOnly=false;
  document.querySelectorAll('[data-filter-kind="live"]').forEach(b=>{b.hidden=!state.runtimeAvailable});
  syncFilters();
}
function syncFilters(){document.querySelectorAll('[data-filter-kind]').forEach(b=>{const k=b.dataset.filterKind,v=b.dataset.filterValue,active=k==='live'?state.liveOnly:k==='type'?state.type===v:state.focus===v;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false')});document.querySelectorAll('[data-select-kind]').forEach(s=>{s.value=state[s.dataset.selectKind]||'all';s.closest('.select-chip')?.classList.toggle('active',s.value!=='all')})}
function bindFilters(){document.querySelectorAll('[data-filter-kind]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.filterKind,v=b.dataset.filterValue;if(k==='live')state.liveOnly=!state.liveOnly;if(k==='type')state.type=v;if(k==='focus')state.focus=state.focus===v?'all':v;syncFilters();refresh();syncUrl()}));document.querySelectorAll('[data-select-kind]').forEach(s=>s.addEventListener('change',()=>{state[s.dataset.selectKind]=s.value;syncFilters();refresh();syncUrl()}));document.querySelectorAll('[data-reset-filters]').forEach(b=>b.addEventListener('click',()=>{state.query='';state.type='all';state.focus='all';state.animal='all';state.region='all';state.localPeriod='all';state.liveOnly=false;document.querySelector('#searchDesktop').value='';const mobileSearch=document.querySelector('#mobileSearch');if(mobileSearch)mobileSearch.value='';document.querySelectorAll('[data-select-kind]').forEach(s=>{s.value='all'});syncFilters();refresh();syncUrl()}))}
function row(c){const l=locationFor(c),badge=state.runtimeAvailable?`<span class="badge ${statusBadgeClass(c)}">${esc(c.streamStatus==='live'?'LIVE':statusLabel(c))}</span>`:'';return `<button class="camera-row ${c.id===state.selectedCamera?'selected':''}" data-camera="${esc(c.id)}" aria-current="${c.id===state.selectedCamera?'true':'false'}"><span class="thumb-wrap"><img src="${thumb(c)}" alt="" loading="lazy">${badge}</span><span><span class="row-title">${esc(camName(c))}</span><span class="row-sub">${esc(locName(l))}</span><span class="row-meta">${esc(countryName(l))} · ${esc(regionName(l))}</span><span class="tags"><span class="tag blue">${typeEmoji[l.environmentType]||'•'} ${esc(typeText[l.environmentType]||l.environmentType)}</span><span class="tag">🐾 ${esc(animalName(c))}</span></span></span></button>`}
function renderList(){const cams=filtered(),el=document.querySelector('#desktopList');document.querySelector('#desktopCount').textContent=cams.length;el.innerHTML=cams.length?cams.map(row).join(''):`<div class="empty">${esc(t.no)}</div>`;el.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>selectCamera(b.dataset.camera,true)))}
function infoDetail(c,l,mobile=false){const approx=l.precision==='hidden'?`<p class="description">${esc(t.locationHidden)}</p>`:l.precision==='region'?`<p class="description">${esc(t.approx)}</p>`:'';const statusRows=state.runtimeAvailable?`<div class="info-row"><span>●</span><b>${esc(t.status)}</b><span>${esc(statusLabel(c))}</span></div><div class="info-row"><span>◷</span><b>${esc(t.checked)}</b><span>${esc(relativeChecked(c))}</span></div>`:'';const official=safeOfficialUrl(c),officialAction=official?`<a class="action" href="${esc(official)}" target="_blank" rel="noopener noreferrer">↗ ${esc(t.official)}</a>`:'';const actions=mobile?`<a class="primary-youtube" href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}" target="_blank" rel="noopener">▶ ${esc(t.youtube)}</a><div class="secondary">${officialAction}<button class="action" data-share>⌯ ${esc(t.share)}</button></div>`:`<div class="detail-actions">${officialAction}<a class="action youtube" href="https://www.youtube.com/watch?v=${encodeURIComponent(c.videoId)}" target="_blank" rel="noopener">▶ ${esc(t.youtube)}</a><button class="action" data-share aria-label="${esc(t.share)}">⌯</button></div>`;return `<div class="detail-title">${esc(camName(c))}</div><div class="detail-en">${esc(lang==='ja'?c.nameEn:c.nameJa)}</div><div class="facility">${esc(locName(l))}</div><div class="place">📍 ${esc(countryName(l))} · ${esc(regionName(l))} ${esc(cityName(l))}</div><div class="tags"><span class="tag blue">${typeEmoji[l.environmentType]||'•'} ${esc(typeText[l.environmentType]||l.environmentType)}</span><span class="tag">🐾 ${esc(animalName(c))}</span><span class="tag">${esc(schedule(c))}</span></div>${approx}${actions}<section class="block"><h3>${esc(t.basic)}</h3><div class="info">${statusRows}<div class="info-row"><span>☀</span><b>${esc(t.local)}</b><span>${esc(localTime(l))}</span></div><div class="info-row"><span>◴</span><b>${esc(t.timezone)}</b><span>${esc(l.timezone)}</span></div></div></section><section class="block"><h3>${esc(t.related)}</h3><div class="tags"><span class="tag">🐾 ${esc(animalName(c))}</span></div></section>`}
function renderDetail(){
  const box=document.querySelector('#desktopDetail'),c=state.data.cameras.find(x=>x.id===state.selectedCamera);
  if(!c){box.innerHTML=`<div class="empty">${esc(t.no)}</div>`;box.dataset.cameraId='';return;}
  const l=locationFor(c);
  box.innerHTML=`<div class="player">${previewMarkup(c)}</div><div class="detail-body">${infoDetail(c,l,false)}</div>`;
  box.dataset.cameraId=c.id;
  box.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',share));
}

function selectCamera(id,move=false){const c=state.data.cameras.find(x=>x.id===id);if(!c)return;state.selectedCamera=c.id;state.selectedLocation=c.locationId;renderList();renderDetail();updateMaps();syncOpenPlayer();syncUrl();if(move){const l=locationFor(c);if(l.precision!=='hidden'&&Number.isFinite(l.lat)&&Number.isFinite(l.lng)){state.maps.desktop?.easeTo({center:[l.lng,l.lat],zoom:Math.max(4,state.maps.desktop.getZoom()),duration:500})}}}
// HTML markers are independent of the vector style and survive map/satellite switches.
const pinSets=new WeakMap();
function visibleLocations(){
  const groups=new Map();
  for(const c of filtered()){
    const l=locationFor(c);
    if(!l||l.precision==='hidden'||!Number.isFinite(l.lat)||!Number.isFinite(l.lng))continue;
    if(!groups.has(l.id))groups.set(l.id,{location:l,count:0});
    groups.get(l.id).count++;
  }
  return groups;
}
function syncMapMarkers(map){
  if(!map)return;
  let markers=pinSets.get(map);
  if(!markers){markers=new Map();pinSets.set(map,markers)}
  const visible=visibleLocations();
  for(const [id,marker] of markers){
    if(!visible.has(id)){marker.remove();markers.delete(id)}
  }
  for(const [id,{location:l,count}] of visible){
    let marker=markers.get(id);
    if(!marker){
      const el=document.createElement('button');
      el.type='button';el.className='location-pin';
      el.dataset.locationId=id;
      el.setAttribute('aria-label',locName(l));
      el.addEventListener('click',e=>{e.stopPropagation();selectLocation(id,map.getContainer().id==='mobileMap')});
      marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([l.lng,l.lat]).addTo(map);
      markers.set(id,marker);
    }
    const el=marker.getElement();
    el.classList.toggle('selected',state.selectedLocation===id);
    el.classList.toggle('wild',l.environmentType==='wild');
    el.classList.toggle('zoo',l.environmentType==='zoo');
    el.classList.toggle('aquarium',l.environmentType==='aquarium');
    el.setAttribute('aria-label',`${locName(l)} (${count} ${t.camUnit})`);
    el.innerHTML=`<span class="pin-glyph">${{wild:'🌲',zoo:'🏛️',aquarium:'🐟'}[l.environmentType]||'🐾'}</span>${count>1?`<span class="pin-count">${count}</span>`:''}`;
  }
}
function ensureMap(kind){
  if(state.maps[kind]){state.maps[kind].resize();syncMapMarkers(state.maps[kind]);return}
  const id=kind==='desktop'?'map':'mobileMap',node=document.getElementById(id);
  if(!node||node.clientWidth===0)return;
  const map=new maplibregl.Map({container:id,style:state.mapMode==='map'?mapStyle:satStyle,center:[20,22],zoom:1.15,minZoom:1,maxZoom:12,attributionControl:true});
  state.maps[kind]=map;
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-left');
  map.addControl(new maplibregl.ScaleControl({maxWidth:110,unit:'metric'}),'bottom-left');
  syncMapMarkers(map); // Do not wait for asynchronous basemap/style loading.
  map.on('load',()=>{map.resize();syncMapMarkers(map)});
  map.on('style.load',()=>syncMapMarkers(map));
}
function updateMaps(){Object.values(state.maps).forEach(syncMapMarkers)}
function setMapMode(mode){
  state.mapMode=mode;
  document.querySelectorAll('[data-map-mode]').forEach(b=>{const active=b.dataset.mapMode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false')});
  Object.values(state.maps).forEach(m=>{if(!m)return;m.setStyle(mode==='map'?mapStyle:satStyle);syncMapMarkers(m)});
}

function selectLocation(id,mobile){state.selectedLocation=id;const cams=filtered().filter(c=>c.locationId===id);if(cams[0])state.selectedCamera=cams[0].id;updateMaps();if(mobile)renderSheet(id);else{renderList();renderDetail()}}
function renderSheet(id){const l=state.data.locations.find(x=>x.id===id),cams=filtered().filter(c=>c.locationId===id),s=document.querySelector('#sheet');if(!l||!cams.length){s.classList.remove('open');return}s.innerHTML=`<div class="grab"></div><div class="sheet-head"><div><h2>${esc(locName(l))}</h2><p>${esc(countryName(l))} · ${esc(regionName(l))}　${cams.length} ${esc(t.camUnit)}</p></div><button class="btn" data-close-sheet aria-label="${esc(t.close)}">×</button></div><div class="sheet-list">${cams.map(c=>`<button class="sheet-row" data-sheet-camera="${esc(c.id)}"><img src="${thumb(c)}" alt="" loading="lazy"><span><strong>${esc(camName(c))}</strong><span>🐾 ${esc(animalName(c))}</span></span><b>›</b></button>`).join('')}</div>`;s.classList.add('open');s.querySelector('[data-close-sheet]').addEventListener('click',()=>s.classList.remove('open'));s.querySelectorAll('[data-sheet-camera]').forEach(b=>b.addEventListener('click',()=>openMobileDetail(b.dataset.sheetCamera)))}
function openMobileDetail(id){selectCamera(id,false);const c=state.data.cameras.find(x=>x.id===id),l=locationFor(c),d=document.querySelector('#mobileDetail');d.innerHTML=`<div class="mobile-detail-head"><button class="round" data-back aria-label="${esc(t.back)}">‹</button><h2>${esc(t.title)}</h2><button class="round" data-share aria-label="${esc(t.share)}">⌯</button></div><div class="mobile-player">${previewMarkup(c)}</div><div class="mobile-detail-body">${infoDetail(c,l,true)}</div>`;d.classList.add('open');d.dataset.videoId=c.videoId;document.querySelector('#sheet').classList.remove('open');d.querySelector('[data-back]').addEventListener('click',()=>{d.classList.remove('open');d.innerHTML='';renderSheet(l.id)});d.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',share))}
function openSearch(focus=false){state.overlay='search';const o=document.querySelector('#overlay');o.innerHTML=`<div class="overlay-head"><label class="search">⌕<input id="mobileSearch" aria-label="${esc(t.search)}" value="${esc(state.query)}" placeholder="${esc(t.search)}"></label><button data-close>${esc(t.cancel)}</button></div><div id="results" class="results"></div>`;o.classList.add('open');renderResults();const i=o.querySelector('#mobileSearch');i.addEventListener('input',()=>{state.query=i.value.trim();document.querySelector('#searchDesktop').value=state.query;refresh(false);renderResults();syncUrl()});o.querySelector('[data-close]').addEventListener('click',closeOverlay);if(focus)setTimeout(()=>i.focus(),30)}
function renderResults(){const box=document.querySelector('#results');if(!box)return;const cams=filtered();box.innerHTML=`<div class="section-head"><strong>${esc(t.results)}</strong><span class="count" aria-live="polite">${cams.length}</span></div>${cams.length?cams.map(c=>{const l=locationFor(c),badge=state.runtimeAvailable?`<span class="badge ${statusBadgeClass(c)}">${esc(c.streamStatus==='live'?'LIVE':statusLabel(c))}</span>`:'';return `<button class="result" data-result="${esc(c.id)}"><span class="result-thumb"><img src="${thumb(c)}" alt="" loading="lazy">${badge}</span><span><h3>${esc(camName(c))}</h3><p>${esc(locName(l))}</p><p>${esc(countryName(l))} · ${esc(regionName(l))}</p><span class="tags"><span class="tag blue">${typeEmoji[l.environmentType]||'•'} ${esc(typeText[l.environmentType]||l.environmentType)}</span><span class="tag">🐾 ${esc(animalName(c))}</span></span></span><b>›</b></button>`}).join(''):`<div class="empty">${esc(t.no)}</div>`}`;box.querySelectorAll('[data-result]').forEach(b=>b.addEventListener('click',()=>{closeOverlay();openMobileDetail(b.dataset.result)}))}
function openAnimals(){state.overlay='animals';const o=document.querySelector('#overlay'),m=new Map();filtered({ignoreAnimal:true}).forEach(c=>m.set(animalName(c),(m.get(animalName(c))||0)+1));o.innerHTML=`<div class="overlay-head"><b>${esc(t.animalsTab)}</b><button data-close>${esc(t.cancel)}</button></div><div class="animal-grid">${[...m.entries()].sort((a,b)=>b[1]-a[1]).map(([n,c])=>`<button class="animal-card" data-animal="${esc(n)}"><b>🐾 ${esc(n)}</b><span>${c} ${esc(t.camUnit)}</span></button>`).join('')}</div>`;o.classList.add('open');o.querySelector('[data-close]').addEventListener('click',closeOverlay);o.querySelectorAll('[data-animal]').forEach(b=>b.addEventListener('click',()=>{const found=state.data.cameras.find(c=>animalName(c)===b.dataset.animal);state.animal=(found?.animalEn||found?.animalJa||'').trim().toLocaleLowerCase()||'all';closeOverlay();document.querySelectorAll('[data-select-kind="animal"]').forEach(s=>{s.value=state.animal});refresh();syncUrl()}))}
function openSettings(){state.overlay='settings';const o=document.querySelector('#overlay');o.innerHTML=`<div class="overlay-head"><b>${esc(t.settingsTab)}</b><button data-close>${esc(t.cancel)}</button></div><div class="settings"><section><b>${esc(t.language)}</b><p><button data-lang="ja" class="${lang==='ja'?'active':''}">日本語</button> <button data-lang="en" class="${lang==='en'?'active':''}">English</button></p></section><section><b>${esc(t.theme)}</b><p><button data-theme="light" class="${state.theme==='light'?'active':''}">${esc(t.light)}</button> <button data-theme="dark" class="${state.theme==='dark'?'active':''}">${esc(t.dark)}</button> <button data-theme="system" class="${state.theme==='system'?'active':''}">${esc(t.system)}</button></p></section></div>`;o.classList.add('open');o.querySelector('[data-close]').addEventListener('click',closeOverlay);o.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>switchLang(b.dataset.lang)));o.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{setTheme(b.dataset.theme);openSettings()}))}
function closeDesktopMenu(){const m=document.querySelector('#desktopMenu'),b=document.querySelector('#menuDesktop');if(!m||!b)return;m.hidden=true;b.setAttribute('aria-expanded','false')}
function toggleDesktopMenu(){const m=document.querySelector('#desktopMenu'),b=document.querySelector('#menuDesktop');if(!m||!b)return;const next=m.hidden;m.hidden=!next;b.setAttribute('aria-expanded',next?'true':'false')}
function setTheme(next){state.theme=next;localStorage.setItem('alm-theme',state.theme);applyTheme();document.querySelectorAll('[data-desktop-theme]').forEach(b=>b.classList.toggle('active',b.dataset.desktopTheme===state.theme))}
function closeOverlay(){document.querySelector('#overlay').classList.remove('open');state.overlay=null;document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab==='map';b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')})}
function switchLang(next){if(next===lang)return;localStorage.setItem('alm-language',next);syncUrl();location.href=`../${next}/${location.search}`}
function share(){const c=state.selectedCamera;if(!c)return;const u=new URL(location.href);u.searchParams.set('camera',c);const d={title:camName(state.data.cameras.find(x=>x.id===c)),url:u.toString()};if(navigator.share)navigator.share(d).catch(()=>{});else navigator.clipboard?.writeText(u.toString())}
function refresh(updateMobile=true){const cams=filtered();if(!cams.some(c=>c.id===state.selectedCamera)){state.selectedCamera=cams[0]?.id||null;state.selectedLocation=cams[0]?.locationId||null}renderList();renderDetail();updateMaps();if(updateMobile&&state.overlay==='search')renderResults()}
function bind(){bindFilters();syncFilters();document.querySelector('#searchDesktop').addEventListener('input',e=>{state.query=e.target.value.trim();refresh();syncUrl()});document.querySelector('#langDesktop').addEventListener('click',()=>switchLang(lang==='ja'?'en':'ja'));document.querySelector('#themeDesktop').addEventListener('click',()=>{setTheme(state.theme==='system'?'light':state.theme==='light'?'dark':'system')});document.querySelector('#menuDesktop').addEventListener('click',e=>{e.stopPropagation();toggleDesktopMenu()});document.querySelectorAll('[data-desktop-lang]').forEach(b=>b.addEventListener('click',()=>switchLang(b.dataset.desktopLang)));document.querySelectorAll('[data-desktop-theme]').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.desktopTheme)));document.addEventListener('click',e=>{if(!e.target.closest('.actions'))closeDesktopMenu()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDesktopMenu()});document.addEventListener('click',e=>{const button=e.target.closest('[data-play-camera]');if(!button)return;const c=state.data?.cameras.find(x=>x.id===button.dataset.playCamera);if(c)openPlayer(c)});document.querySelector('#playerClose').addEventListener('click',closePlayer);document.addEventListener('keydown',e=>{if(e.key==='Escape')closePlayer()});enablePlayerDrag();document.querySelectorAll('[data-map-mode]').forEach(b=>b.addEventListener('click',()=>setMapMode(b.dataset.mapMode)));document.querySelector('#openSearch').addEventListener('click',()=>openSearch(true));document.querySelector('#openMenu').addEventListener('click',openSettings);document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);if(x===b)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});const mobileDetail=document.querySelector('#mobileDetail');mobileDetail.classList.remove('open');mobileDetail.innerHTML='';document.querySelector('#sheet').classList.remove('open');if(b.dataset.tab==='map')closeOverlay();if(b.dataset.tab==='list')openSearch(false);if(b.dataset.tab==='animals')openAnimals();if(b.dataset.tab==='settings')openSettings()}));addEventListener('resize',()=>{if(innerWidth<=900)ensureMap('mobile');else ensureMap('desktop')})}
async function boot(){applyTheme();const r=await fetch('../data/public-v0.json',{cache:'no-store'});if(!r.ok)throw new Error('data load failed');state.data=await r.json();for(const c of state.data.cameras)staticCameraValues.set(c.id,{videoId:c.videoId,embeddable:c.embeddable});readUrlState();normalizeFacetState();renderShell();bind();applyRuntimeAvailabilityUi();document.querySelector('#searchDesktop').value=state.query;const req=new URL(location.href).searchParams.get('camera'),c=state.data.cameras.find(x=>x.id===req)||state.data.cameras[0];state.selectedCamera=c?.id||null;state.selectedLocation=c?.locationId||null;refresh();syncUrl();if(innerWidth<=900)ensureMap('mobile');else ensureMap('desktop');if(optionalStatusFeed){void runtimeProbe();}}
boot().catch(e=>{console.error(e);app.innerHTML=`<div class="empty">Animal Live Map<br>${esc(e.message)}</div>`});