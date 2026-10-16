/* HomeView Music. ES5 on purpose (old WebView): var/function only, no arrows, templates, let/const, ?. or ??.

   Now Playing (Apple HomeView's look) for the selected Sonos room, with Sonos depth underneath:
   Rooms (own volume, Group sheet, Speaker settings sheet), Up next (the Sonos queue), Favorites (+ a QR to
   send a Spotify link from a phone), and a Spotify browse tab whose plays go through Sonos.

   Reads : GET /api/frame/music                 every 5 s (server caches 12 s); position is interpolated locally
           GET /api/frame/music/queue/<room>?start=  when Up next is open (every 15 s)
           GET /api/frame/music/settings/<room>  when a Speaker settings sheet opens
           GET /api/frame/favorites/<room>       once per room
           GET /api/frame/spotify/*              status, recent, playlists, albums, top?kind=artists, search, album/playlist/artist
           GET /api/frame/spotify/devices        when the Play on sheet opens (Spotify Connect speakers, receivers)
           GET /api/frame/spotify/player         every 5 s while a Connect device's Now Playing is shown, else every 30 s
   Writes: POST /api/frame/music {room, action, ...}: play pause next previous | volume (group) | room_volume | seek |
           play_mode {shuffle|repeat} | crossfade | group {members} | queue_play/queue_remove {index} | queue_clear |
           sleep {minutes|null} | eq {setting,value} | favorite {favorite} | spotify {link}
           POST /api/frame/spotify/play {device, uri}                         Spotify item on a Connect device
           POST /api/frame/spotify/control {action: pause|resume|next|previous|volume, device, value}   a Connect device's playback
   "Play on" target (localStorage hv-play-on = {kind:'sonos'|'connect', id, name}): Sonos rooms play through the music
   action, everything else through Spotify Connect. Default is the selected Sonos room.
   A server that refuses a POST (403) gets a toast saying nothing was changed.

   ?demo=1 is PREVIEW-ONLY: sample rooms/queue/settings for screenshots, nothing is sent. ?room=<name>, ?tab=,
   ?mode=spotify only pick what is shown first (also handy for screenshots).
   ?demo=connect is PREVIEW-ONLY too: a sample Spotify song "playing" on a Connect speaker so that Now Playing face
   can be screenshotted; its controls send nothing. */
(function(){
  var DEMO=/[?&]demo=(1|podcast)/.test(location.search);  // PREVIEW-ONLY sample state (see demo* below)
  var DEMO_POD=/[?&]demo=podcast/.test(location.search);   // PREVIEW-ONLY: the Den plays a podcast episode
  var DEMO_CON=/[?&]demo=connect/.test(location.search);   // PREVIEW-ONLY: a sample song playing on a Connect speaker
  function qp(k){var m=location.search.match(new RegExp('[?&]'+k+'=([^&]*)'));return m?decodeURIComponent(m[1]):null;}
  var esc=HV.esc;
  var S={rooms:[],sel:null,loaded:false,zonesOnly:false,mode:qp('mode')==='spotify'?'sp':'np',tab:qp('tab')||'rooms',
    ctl:qp('ctl')==='1',favs:{},favErr:{},favBusy:{},queue:null,queueFor:null,queueAt:0,vol:null,rvol:{},sheet:null,sound:null,soundPend:{},
    sp:{status:null,home:{},q:'',results:null,busy:false,err:''},detail:null,clearArm:0,
    po:readPo(),dev:{list:null,err:''},pl:null,plSig:'',evol:null};
  var wantRoom=qp('room');
  function readPo(){try{var o=JSON.parse(localStorage.getItem('hv-play-on')||'null');
    if(o&&(o.kind==='sonos'||o.kind==='connect')&&o.id&&o.name)return {kind:o.kind,id:String(o.id),name:String(o.name)};}catch(e){}return null;}
  function savePo(o){S.po=o;try{localStorage.setItem('hv-play-on',JSON.stringify(o));}catch(e){}}
  function $(i){return document.getElementById(i);}

  /* ---------- icons ---------- */
  var NOTE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>';
  var TV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/></svg>';
  var PLAY='<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  var PAUSE='<svg viewBox="0 0 24 24"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>';
  var NEXT='<svg viewBox="0 0 24 24"><path d="M3 6.2v11.6a.8.8 0 0 0 1.2.7L13 13v4.8a.8.8 0 0 0 1.2.7l8.6-5.8a.8.8 0 0 0 0-1.4L14.2 5.5A.8.8 0 0 0 13 6.2V11L4.2 5.5A.8.8 0 0 0 3 6.2z"/></svg>';
  var PREV='<svg viewBox="0 0 24 24"><path d="M21 6.2v11.6a.8.8 0 0 1-1.2.7L11 13v4.8a.8.8 0 0 1-1.2.7L1.2 12.7a.8.8 0 0 1 0-1.4l8.6-5.8A.8.8 0 0 1 11 6.2V11l8.8-5.5a.8.8 0 0 1 1.2.7z"/></svg>';
  var SHUF='<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>';
  var REP='<svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  var SPK_LO='<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var SPK_HI='<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  var GEAR='<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
  var X='<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var CHECK='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var GROUP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="8" height="13" rx="2"/><rect x="14" y="4" width="8" height="16" rx="2"/></svg>';
  var BACK15='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 3.5v4.5h4.5"/></svg>';
  var FWD30='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M21 3.5v4.5h-4.5"/></svg>';
  var LIST='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h9M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
  var STAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  var SEARCH='<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var CHEV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10l4 4 4-4"/></svg>';
  var SPOT='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.2-.4 7.3.8M8.6 15.4c2-.5 4-.3 5.6.6"/></svg>';

  function isPreview(e){return /Preview is read-only|HTTP 403/.test(e&&e.message||'');}
  function fail(e){HV.toast(isPreview(e)?'Preview: nothing was changed':(e&&e.message)||'That did not work');}
  function byId(id){for(var i=0;i<S.rooms.length;i++)if(S.rooms[i].id===id)return S.rooms[i];return null;}
  function cur(){return byId(S.sel)||S.rooms[0]||null;}
  function can(r,a){return !S.zonesOnly&&r&&r.ok&&(r.actions||[]).indexOf(a)>=0;}
  function stateWord(r){if(!r.ok)return 'No response';return {PLAYING:'Playing',PAUSED_PLAYBACK:'Paused',STOPPED:'Paused',TRANSITIONING:'Starting'}[r.state]||'Ready';}
  function idle(r){return r&&r.ok&&!r.title&&!r.tv;}
  function bg(url){return url?' style="background-image:url(\''+esc(String(url).replace(/['"\\()]/g,function(c){return encodeURIComponent(c);}))+'\')"':'';}
  function mmss(s){return HV.mmss(Math.max(0,Math.floor(s||0)));}
  /* ---------- Play on: where Spotify items go ---------- */
  function isGroup(d){return d.type==='CastAudio'&&/group|everywhere/i.test(d.name||'')||/^everywhere$/i.test(d.name||'');}
  function devRank(d){return isGroup(d)?0:d.type==='Speaker'?1:2;}
  function devSub(d){return d.active?'Playing now':isGroup(d)?'Speaker group':d.type==='AVR'?'Receiver':(d.type||'Speaker');}
  function isSonosName(n){n=String(n||'').toLowerCase();for(var i=0;i<S.rooms.length;i++)if(S.rooms[i].name.toLowerCase()===n)return true;return false;}
  /* the chosen target. Nothing is chosen until the person picks one: the old fallback (the room on screen)
     was often a TV soundbar, so Spotify picks took over the TV sound. */
  function target(){
    var po=S.po,r;
    if(po&&po.kind==='connect')return po;
    if(po&&po.kind==='sonos'&&(r=byId(po.id)))return {kind:'sonos',id:r.id,name:r.name};
    return null;
  }
  function chipHTML(wide){
    var t=target();
    return '<button class="po-chip'+(wide?' wide':'')+'" data-playon="1" aria-label="Play on '+esc(t?t.name:'')+'. Change.">'+SPK_HI+
      '<span><small>Play on</small><b>'+esc(t?t.name:'Choose a speaker')+'</b></span>'+CHEV+'</button>';
  }
  function names(ids){return ids.map(function(i){var r=byId(i);return r?r.name:'';}).filter(Boolean);}

  /* ---------- Now Playing ---------- */
  function livePos(r){
    if(r.position==null)return null;
    var p=r.position;
    if(r.state==='PLAYING'&&r.at)p+=Math.max(0,HV.now().getTime()/1000-r.at);
    return r.duration?Math.min(p,r.duration):p;
  }
  /* shared control pieces (full-bleed face, podcast face) */
  function scrubHTML(r){
    var seek=can(r,'SeekTime')&&r.duration;
    return '<div class="np-scrub'+(seek?'':' off')+'"'+(r.duration?'':' style="visibility:hidden"')+'><div class="bar" id="scrub"><i id="sc-f"></i><b id="sc-k"></b></div>'+
      '<div class="times tnum"><span id="sc-e">0:00</span><span id="sc-r">-0:00</span></div></div>';
  }
  function ppHTML(r){var playing=r.state==='PLAYING';
    return '<button class="pp" data-a="'+(playing?'pause':'play')+'" aria-label="'+(playing?'Pause':'Play')+'"'+(can(r,playing?'Pause':'Play')?'':' disabled')+'>'+(playing?PAUSE:PLAY)+'</button>';}
  function trHTML(r){
    var rep=r.repeat||'off',canMode=!S.zonesOnly&&r.ok&&r.queue;
    return '<div class="np-tr">'+
      '<button class="md'+(r.shuffle?' on':'')+'" data-pm="shuffle" aria-label="Shuffle"'+(canMode?'':' disabled')+'>'+SHUF+'</button>'+
      '<button data-a="previous" aria-label="Previous"'+(can(r,'Previous')?'':' disabled')+'>'+PREV+'</button>'+ppHTML(r)+
      '<button data-a="next" aria-label="Next"'+(can(r,'Next')?'':' disabled')+'>'+NEXT+'</button>'+
      '<button class="md'+(rep!=='off'?' on':'')+'" data-pm="repeat" aria-label="Repeat '+rep+'"'+(canMode?'':' disabled')+'>'+REP+(rep==='one'?'<em>1</em>':'')+'</button></div>';
  }
  function others(r){return names((r.group_ids||[]).filter(function(i){return i!==r.id;}));}
  function volHTML(r){
    var gv=S.vol&&S.vol.room===r.id?S.vol.v:(r.group_volume!=null?r.group_volume:r.volume),off=gv==null||S.zonesOnly||!r.ok;
    return '<div class="np-vol"><button data-vol="-5" aria-label="Quieter"'+(off?' disabled':'')+'>'+SPK_LO+'</button>'+
      '<div class="bar"><i style="width:'+(gv||0)+'%"></i></div><button data-vol="5" aria-label="Louder"'+(off?' disabled':'')+'>'+SPK_HI+'</button>'+
      '<output class="tnum">'+(gv==null?'--':gv+'%')+(others(r).length?'<small>Group</small>':'')+'</output></div>';
  }
  function pillsHTML(r){
    if(S.zonesOnly||!r.ok)return '';
    return '<div class="fb-pills"><button class="fb-pill" data-panel="rooms">'+GROUP+'Rooms</button><button class="fb-pill" data-panel="queue">'+LIST+'Up next</button>'+
      '<button class="fb-pill" data-panel="favs">'+STAR+'Favorites</button><button class="fb-pill" data-gear="'+esc(r.id)+'">'+GEAR+'Sound</button></div>';
  }
  function roomLine(r){
    var o=others(r);
    return esc(r.name)+(o.length?' + '+esc(o.join(' + ')):'')+' · '+esc(r.source||'Sonos')+' · '+esc(stateWord(r))+
      (r.sleep?' · Sleep in '+Math.max(1,Math.round(r.sleep/60))+' min':'')+(r.battery?' · Battery '+r.battery.level+'%':'');
  }

  /* Now Playing, Apple HomeView style: the art full-bleed with only title and artist bottom-left. A tap brings up
     scrub, transport, volume and the Sonos pills over a darker bottom gradient; they hide again after 8 s. */
  function fbHTML(r){
    var art=r.art||'';
    return '<section class="fb'+(S.ctl?' on':'')+(r.tv?' tv':'')+'" id="fb"><div class="fb-art'+(art?'':' none')+'"'+bg(art)+'>'+(art?'':(r.tv?TV:NOTE))+'</div>'+
      '<div class="fb-shade"></div><div class="fb-shade2"></div>'+
      '<div class="fb-title"><div class="fb-room">'+roomLine(r)+'</div><div class="fb-song">'+esc(r.ok?r.title:'No response')+'</div>'+
        '<div class="fb-artist">'+esc(r.artist||(r.tv?'From the TV':r.ok?'':'The speaker did not answer'))+'</div>'+
        (S.zonesOnly?'<div class="note">Track details are unavailable right now. Controls are off.</div>':'')+'</div>'+
      '<div class="fb-ctl">'+(r.tv?'':scrubHTML(r)+trHTML(r))+'<div class="fb-row">'+volHTML(r)+pillsHTML(r)+'</div></div></section>';
  }
  /* Podcast episode: artwork, episode and show, scrub, skip back 15 / forward 30. Sonos has no playback-speed
     control over UPnP, so there is no speed button. Sonos does not report an episode's date either. */
  function podHTML(r){
    var art=r.art||'',sk=can(r,'SeekTime')&&r.duration;
    return '<section class="pod" id="fb">'+(art?'<div class="np-bg"'+bg(art)+'></div>':'')+'<div class="np-scrim"></div>'+
      '<div class="pod-in"><div class="pod-art'+(art?'':' none')+'"'+bg(art)+'>'+(art?'':NOTE)+'</div><div class="pod-r">'+
      '<div class="fb-room">Podcast · '+roomLine(r)+'</div><div class="pod-show">'+esc(r.album||r.artist||'')+'</div>'+
      '<div class="pod-ep">'+esc(r.title)+'</div>'+scrubHTML(r)+
      '<div class="np-tr pod-tr"><button class="sk" data-skip="-15" aria-label="Back 15 seconds"'+(sk?'':' disabled')+'>'+BACK15+'<em>15</em></button>'+ppHTML(r)+
      '<button class="sk" data-skip="30" aria-label="Forward 30 seconds"'+(sk?'':' disabled')+'>'+FWD30+'<em>30</em></button></div>'+
      volHTML(r)+pillsHTML(r)+'</div></div></section>';
  }
  function setCtl(on){
    S.ctl=on;var f=$('fb');if(f&&f.className.indexOf('fb')===0)f.classList.toggle('on',on);
    document.body.classList.toggle('fb-idle',fullBleed()&&!on);poke();
  }
  var hideT=null;
  function poke(){clearTimeout(hideT);if(S.ctl&&fullBleed())hideT=setTimeout(function(){if(S.sheet){poke();return;}setCtl(false);},8000);}
  function fullBleed(){var r=cur();return S.mode==='np'&&S.loaded&&(connShown()||(!!r&&!idle(r)&&r.kind!=='podcast'));}
  function queueShown(){return S.tab==='queue'&&((S.sheet&&S.sheet.kind==='panel')||(S.mode==='np'&&idle(cur())));}
  function tick(){
    if(S.mode==='np'&&connShown()){tickConn();return;}
    var r=cur();if(!r||S.mode!=='np'||idle(r))return;
    var f=$('sc-f');if(!f||!r.duration)return;
    var p=livePos(r)||0,pct=Math.max(0,Math.min(100,p*100/r.duration));
    f.style.width=pct+'%';$('sc-k').style.left=pct+'%';
    $('sc-e').textContent=mmss(p);$('sc-r').textContent='-'+mmss(r.duration-p);
  }

  /* ---------- Spotify playing on a Connect device (Sonos can't see it) ---------- */
  function connDev(){var P=S.pl;return P&&P.item&&P.device&&P.device.name&&!isSonosName(P.device.name)?P.device:null;}
  function connShown(){
    var d=connDev(),t=S.po,r=cur();
    if(!d)return false;
    if(DEMO_CON)return true;
    var onTarget=!!(t&&t.kind==='connect'&&t.name===d.name);
    if(!S.pl.playing&&!onTarget)return false;
    if(r&&r.state==='PLAYING'&&!idle(r)&&!(t&&t.kind==='connect'))return false;   // both playing: the Play on target decides
    return true;
  }
  function epos(){var P=S.pl,it=P.item||{},p=(P.progress_ms||0)/1000;
    if(P.playing&&P.at)p+=Math.max(0,(Date.now()-P.at)/1000);
    return it.duration_ms?Math.min(p,it.duration_ms/1000):p;}
  function tickConn(){
    var P=S.pl,f=$('sc-f');if(!P||!f||!P.item||!P.item.duration_ms)return;
    var dur=P.item.duration_ms/1000,p=epos(),pct=Math.max(0,Math.min(100,p*100/dur));
    f.style.width=pct+'%';$('sc-k').style.left=pct+'%';$('sc-e').textContent=mmss(p);$('sc-r').textContent='-'+mmss(dur-p);
  }
  function connHTML(){
    var P=S.pl,it=P.item,dv=P.device,art=it.image||'',playing=!!P.playing,dur=it.duration_ms;
    var v=S.evol?S.evol.v:dv.volume,off=v==null;
    return '<section class="fb conn'+(S.ctl?' on':'')+'" id="fb"><div class="fb-art'+(art?'':' none')+'"'+bg(art)+'>'+(art?'':NOTE)+'</div>'+
      '<div class="fb-shade"></div><div class="fb-shade2"></div>'+(DEMO_CON?'<div class="demo-tag">Preview sample. Nothing is playing.</div>':'')+
      '<div class="fb-title"><div class="fb-room">On '+esc(dv.name)+' \u00b7 Spotify \u00b7 '+(playing?'Playing':'Paused')+'</div><div class="fb-song">'+esc(it.name||'')+'</div>'+
        '<div class="fb-artist">'+esc(it.subtitle||'')+'</div></div>'+
      '<div class="fb-ctl"><div class="np-scrub off"'+(dur?'':' style="visibility:hidden"')+'><div class="bar" id="scrub"><i id="sc-f"></i><b id="sc-k"></b></div>'+
        '<div class="times tnum"><span id="sc-e">0:00</span><span id="sc-r">-0:00</span></div></div>'+
      '<div class="np-tr"><button data-ea="previous" aria-label="Previous">'+PREV+'</button>'+
        '<button class="pp" data-ea="'+(playing?'pause':'resume')+'" aria-label="'+(playing?'Pause':'Play')+'">'+(playing?PAUSE:PLAY)+'</button>'+
        '<button data-ea="next" aria-label="Next">'+NEXT+'</button></div>'+
      '<div class="fb-row"><div class="np-vol"><button data-evol="-5" aria-label="Quieter"'+(off?' disabled':'')+'>'+SPK_LO+'</button>'+
        '<div class="bar"><i style="width:'+(v||0)+'%"></i></div><button data-evol="5" aria-label="Louder"'+(off?' disabled':'')+'>'+SPK_HI+'</button>'+
        '<output class="tnum">'+(v==null?'--':v+'%')+'</output></div>'+
      '<div class="fb-pills"><button class="fb-pill" data-playon="1">'+SPK_HI+'Play on</button></div></div></div></section>';
  }

  /* nothing playing: favorites first, big and inviting */
  function startHTML(r){
    var f=S.favs[r.id],tiles='';
    if(f&&f.length){
      tiles=f.slice(0,5).map(function(x){
        return '<button class="st-tile" data-fav="'+esc(x.id)+'">'+(x.art?'<div class="im"'+bg(x.art)+'></div>':'')+'<div class="sh"></div>'+
          '<span class="ic">'+PLAY+'</span><span class="tx"><b>'+esc(x.title)+'</b><small>'+esc(x.kind||'Sonos favorite')+'</small></span></button>';}).join('');
    }
    var sp=S.sp.home.recent&&S.sp.home.recent[0];
    tiles+='<button class="st-tile" data-mode="sp">'+(sp&&sp.image?'<div class="im"'+bg(sp.image)+'></div>':'')+'<div class="sh"></div>'+
      '<span class="ic">'+PLAY+'</span><span class="tx"><b>Browse Spotify</b><small>Search, your playlists and albums</small></span></button>';
    var lead=f?'Tap a favorite to start it here.':S.favErr[r.id]?esc(S.favErr[r.id]):'Loading your Sonos favorites';
    return '<section class="np start"><div><h2>Play in '+esc(r.name)+'</h2><div class="lead">'+lead+
      (r.battery?' · Battery '+r.battery.level+'%':'')+'</div></div><div class="st-grid">'+tiles+'</div></section>';
  }

  /* ---------- side panel ---------- */
  function tabsHTML(){
    var tabs=[['rooms','Rooms'],['queue','Up next'],['favs','Favorites']];
    return '<div class="tabs">'+tabs.map(function(t){return '<button data-tab="'+t[0]+'" class="'+(S.tab===t[0]?'on':'')+'">'+t[1]+'</button>';}).join('')+'</div>';
  }
  function paneHTML(r){return S.tab==='queue'?queueHTML(r):S.tab==='favs'?favsHTML(r):roomsHTML(r);}
  function sideHTML(r){return '<section class="hv-card side">'+tabsHTML()+'<div class="pane" id="pane">'+paneHTML(r)+'</div></section>';}
  /* the same Rooms / Up next / Favorites, as a sheet over the full-bleed face */
  function panelSheet(){var r=cur();return '<div class="sh-hd side">'+tabsHTML()+'<button class="hv-pill" data-close="1">Done</button></div><div class="pane" id="pane">'+(r?paneHTML(r):'')+'</div>';}
  function roomsHTML(sel){
    var h='<div class="hd"><span>'+S.rooms.length+' Sonos rooms</span>'+(S.zonesOnly?'':'<button class="hv-pill" data-group="1">'+GROUP+'Group</button>')+'</div>';
    S.rooms.forEach(function(r){
      var v=S.rvol[r.id]!=null?S.rvol[r.id]:r.volume,others=names((r.group_ids||[]).filter(function(i){return i!==r.id;}));
      var what=!r.ok?'No response':r.title?r.title+(r.artist?' · '+r.artist:''):r.tv?'TV audio':'Nothing playing';
      h+='<div class="rm'+(r.id===sel.id?' sel':'')+(r.state==='PLAYING'?' p':'')+'"><button class="tx" data-room="'+esc(r.id)+'"><i class="dot"></i><span><b>'+esc(r.name)+
        (r.battery?' <em class="bt">'+r.battery.level+'%</em>':'')+'</b>'+
        '<small>'+(others.length?'<em class="grp">With '+esc(others.join(', '))+'</em> · ':'')+esc(what)+'</small></span></button>'+
        (r.ok&&!S.zonesOnly?'<div class="rv"><button data-rv="'+esc(r.id)+'" data-d="-5" aria-label="'+esc(r.name)+' quieter">&minus;</button><div class="bar"><i style="width:'+(v||0)+'%"></i></div>'+
          '<output class="tnum">'+(v==null?'--':v)+'</output><button data-rv="'+esc(r.id)+'" data-d="5" aria-label="'+esc(r.name)+' louder">+</button>'+
          '<button class="gear" data-gear="'+esc(r.id)+'" aria-label="'+esc(r.name)+' speaker settings">'+GEAR+'</button></div>':'')+'</div>';
    });
    return h;
  }
  function queueHTML(r){
    var q=S.queueFor===r.id?S.queue:null;
    if(S.zonesOnly)return '<div class="msg">The queue needs the speakers to respond.</div>';
    if(!q)return '<div class="msg">Loading the queue</div>';
    if(q.error)return '<div class="msg">'+esc(q.error)+'</div>';
    if(!q.items.length)return '<div class="msg">The queue is empty. Start a favorite or something from Spotify.</div>';
    var armed=S.clearArm>Date.now();
    var h='<div class="hd"><span>'+(q.active?'Up next':'Queue (not playing)')+' · '+q.total+' songs</span><button class="hv-pill'+(armed?' orange':'')+'" data-qclear="1">'+(armed?'Tap to clear':'Clear')+'</button></div>';
    if(r.source==='Spotify Connect')h+='<div class="msg">Playing from the Spotify app, so this is the Sonos queue, not what Spotify plays next.</div>';
    q.items.forEach(function(x){
      var isCur=q.current===x.index;
      h+='<div class="qi'+(isCur?' cur':'')+'"><button class="pl" data-qplay="'+x.index+'"><i class="th"'+bg(x.art)+'></i><span><b>'+esc(x.title)+'</b><small>'+esc(isCur?'Now playing':x.artist)+'</small></span></button>'+
        (isCur?'':'<button class="x" data-qrm="'+x.index+'" aria-label="Remove '+esc(x.title)+'">'+X+'</button>')+'</div>';
    });
    if(q.total>q.start+q.items.length)h+='<div class="msg">'+(q.total-q.start-q.items.length)+' more in the Sonos app</div>';
    return h;
  }
  function favsHTML(r){
    var h='<div class="hd"><span>Sonos favorites</span></div>';
    if(S.zonesOnly)h+='<div class="msg">Favorites need the speakers to respond.</div>';
    else if(S.favs[r.id]){
      h+=S.favs[r.id].length?'<div class="fg">'+S.favs[r.id].map(function(f){
        return '<button class="fv" data-fav="'+esc(f.id)+'"><i class="th'+(f.art?' im':'')+'"'+bg(f.art)+'>'+PLAY+'</i><span><b>'+esc(f.title)+'</b><small>'+esc(f.kind||'')+'</small></span></button>';}).join('')+'</div>':
        '<div class="msg">No favorites yet. Save playlists to Sonos Favorites in the Sonos app.</div>';
    }else if(S.favErr[r.id])h+='<div class="msg">'+esc(S.favErr[r.id])+'</div>';
    else h+='<div class="msg">Loading favorites</div>';
    h+='<div class="phone"><img src="'+(DEMO?'/api/frame/send-qr.svg':'/api/frame/music-qr.svg')+'" alt="QR code"><div><b>Send from your phone</b>'+
      '<small>Scan, then paste a Spotify song, album, playlist or podcast link. It plays in the room you pick.</small></div></div>';
    return h;
  }

  /* ---------- Spotify ---------- */
  function tile(x){
    var ar=x.kind==='artist';
    return '<button class="tl'+(ar?' ar':'')+'" data-sp="'+esc(x.kind)+'" data-id="'+esc(x.id)+'" data-uri="'+esc(x.uri)+'"><i class="im'+(x.image?'':' none')+'"'+(x.image?' data-bg="'+esc(x.image)+'"':'')+'>'+(x.image?'':NOTE)+'</i>'+
      '<b>'+esc(x.name)+'</b><small>'+esc(x.subtitle||'')+'</small></button>';
  }
  function trackRow(x,n){
    return '<button class="trk" data-sp="'+esc(x.kind||'track')+'" data-id="'+esc(x.id)+'" data-uri="'+esc(x.uri)+'">'+(n?'<i class="n">'+n+'</i>':'<i class="th"'+bg(x.image)+'></i>')+
      '<span><b>'+esc(x.name)+'</b><small>'+esc(x.subtitle||'')+(x.album&&!n?' · '+esc(x.album):'')+'</small></span>'+(x.duration_ms?'<em class="tnum">'+mmss(x.duration_ms/1000)+'</em>':'')+'</button>';
  }
  function row(title,items){
    if(!items||!items.length)return '';
    return '<div class="sp-sec"><h3>'+esc(title)+'</h3><div class="sp-row">'+items.map(tile).join('')+'</div></div>';
  }
  /* covers load when their tile scrolls into view: the home rows hold ~80 covers and the 10" frame has 1 GB */
  var io=null;
  function showBg(el){var u=el.getAttribute('data-bg');el.removeAttribute('data-bg');
    el.style.backgroundImage='url(\''+String(u).replace(/['"\\()]/g,function(c){return encodeURIComponent(c);})+'\')';}
  function lazyArt(){
    var els=$('main').querySelectorAll('[data-bg]'),i;
    if(io)io.disconnect();
    if(!window.IntersectionObserver){for(i=0;i<els.length;i++)showBg(els[i]);return;}
    io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting&&x.target.getAttribute('data-bg')){showBg(x.target);io.unobserve(x.target);}});},{rootMargin:'20% 40% 20% 40%'});
    for(i=0;i<els.length;i++)io.observe(els[i]);
  }
  function dedupe(items){var seen={};return (items||[]).filter(function(x){if(!x||seen[x.uri])return false;seen[x.uri]=1;return true;});}
  function spHTML(){
    var st=S.sp.status,r=cur();
    if(!st)return '<section class="mu-sp"><div class="hv-empty">Loading Spotify</div></section>';
    if(!st.signed_in)return '<section class="mu-sp"><div class="hv-card sp-card"><div class="ic">'+SPOT+'</div><b>Spotify isn\u2019t signed in yet</b>'+
      '<p>Add your Spotify app keys to config.json and run scripts/spotify_auth.py on the server (see README). Sonos favorites and links sent from a phone still work.</p></div></section>';
    var h='<section class="mu-sp"><div class="sp-bar"><label class="sp-search">'+SEARCH+'<input id="sp-q" type="search" placeholder="Artists, songs, albums, podcasts" autocomplete="off" value="'+esc(S.sp.q)+'">'+
      (S.sp.q?'<button class="clr" data-spclear="1" aria-label="Clear search">&times;</button>':'')+'</label>'+
      (r?chipHTML(false):'')+'</div><div class="sp-scroll" id="sp-scroll">';
    if(S.sp.q&&S.sp.results){
      var R=S.sp.results,any=false;
      if(R.tracks&&R.tracks.length){any=true;h+='<div class="sp-sec"><h3>Songs</h3><div class="sp-tracks">'+R.tracks.slice(0,8).map(function(x){return trackRow(x);}).join('')+'</div></div>';}
      [['Artists','artists'],['Albums','albums'],['Playlists','playlists'],['Podcasts','shows'],['Episodes','episodes']].forEach(function(s){if(R[s[1]]&&R[s[1]].length){any=true;h+=row(s[0],R[s[1]]);}});
      if(!any)h+='<div class="hv-empty">No results for \u201c'+esc(S.sp.q)+'\u201d</div>';
    }else if(S.sp.q&&S.sp.busy)h+='<div class="hv-empty">Searching</div>';
    else{
      var H=S.sp.home;
      h+=row('Recently played',dedupe(H.recent).slice(0,16))+row('Your playlists',H.playlists)+row('Saved albums',H.albums)+row('Your top artists',H.top);
      if(!H.recent&&!H.playlists)h+='<div class="hv-empty">'+(S.sp.err?esc(S.sp.err):'Loading your library')+'</div>';
    }
    return h+'</div></section>';
  }

  /* ---------- sheets ---------- */
  function openSheet(kind,data){S.sheet={kind:kind,data:data||{}};drawSheet();}
  function closeSheet(){
    var b=S.sheet&&S.sheet.kind==='playon'&&S.sheet.data.back;
    if(b){S.sheet=b;drawSheet();return;}   // the Play on sheet opened over another sheet: go back to it
    S.sheet=null;S.detail=null;S.sound=null;drawSheet();
  }
  function openPlayOn(){
    var back=S.sheet&&S.sheet.kind!=='playon'?S.sheet:(S.sheet&&S.sheet.data.back)||null;
    S.sheet={kind:'playon',data:{back:back}};drawSheet();loadDevices();
  }
  function playOnRow(on,disabled,attrs,name,sub,grp){
    return '<button class="gr po-i'+(on?' on':'')+(disabled?' blocked':'')+'" '+(disabled?'disabled':attrs)+'><i class="ck">'+CHECK+'</i><span><b>'+esc(name)+'</b><small>'+esc(sub)+'</small></span>'+
      (grp?'<i class="gi" aria-label="Group">'+GROUP+'</i>':'')+'</button>';
  }
  function playOnSheet(){
    var t=target(),h='<div class="sh-hd"><h2>Play on</h2><button class="hv-pill primary" data-close="1">Done</button></div><div class="po-body">';
    h+='<h4 class="po-h">Sonos</h4>';
    if(!S.rooms.length)h+='<div class="sh-note">No Sonos rooms answered.</div>';
    else{h+='<div class="gl">';S.rooms.forEach(function(r){
      var what=!r.ok?'No response':r.tv?'TV on':r.title?r.title+(r.artist?' \u00b7 '+r.artist:''):'Nothing playing';
      h+=playOnRow(t&&t.kind==='sonos'&&t.id===r.id,!r.ok,'data-posonos="'+esc(r.id)+'"',r.name,what,false);});h+='</div>';}
    h+='<h4 class="po-h">Spotify Connect</h4>';
    var L=S.dev.list;
    if(!L)h+='<div class="sh-note">'+(S.dev.err?esc(S.dev.err):'Looking for speakers')+'</div>';
    else if(!L.length)h+='<div class="sh-note">No Spotify Connect devices answered. Play something on one once to wake it, then try again.</div>';
    else{
      var sorted=L.slice().sort(function(a,b){return devRank(a)-devRank(b)||String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());});
      h+='<div class="gl">'+sorted.map(function(d){
        return playOnRow(t&&t.kind==='connect'&&(t.id===d.id||t.name===d.name),false,'data-poconn="'+esc(d.id)+'"',d.name,devSub(d),isGroup(d));}).join('')+'</div>';
    }
    return h+'</div>';
  }
  function loadDevices(){
    var p=DEMO?Promise.resolve({devices:demoDevices()}):HVJson('/api/frame/spotify/devices');
    p.then(function(d){S.dev.list=d.devices||[];S.dev.err='';},function(e){S.dev.err=(e&&e.message)||'Spotify did not answer';})
     .then(function(){if(S.sheet&&S.sheet.kind==='playon')drawSheet();});
  }
  /* play a Spotify item on the chosen target */
  var playBusy=0;
  function playUri(uri,overTv){
    var t=target();
    if(!t){S.pend=uri;openPlayOn();HV.toast('Choose a speaker, then it starts');return;}
    if(Date.now()<playBusy)return;   // one start at a time: a second tap while Sonos is still loading used to queue twice
    if(DEMO){HV.toast('Demo: nothing sent');return;}
    var r=t.kind==='sonos'?byId(t.id):null;
    if(r&&r.tv&&!overTv){openSheet('tvask',{uri:uri,name:t.name});return;}
    playBusy=Date.now()+8000;HV.toast('Starting on '+t.name+'\u2026');
    var go;
    if(t.kind==='sonos'){var d={action:'spotify',link:uri,room:t.id};if(overTv)d.over_tv=true;go=HV.post('/api/frame/music',d).then(function(){setTimeout(load,1300);});}
    else{
      var id=t.id,L=S.dev.list;
      if(L)for(var i=0;i<L.length;i++)if(L[i].name===t.name){id=L[i].id;break;}   // ids can change; the name is what was chosen
      go=HV.post('/api/frame/spotify/play',{device:id,uri:uri}).then(function(){setTimeout(loadPlayer,2500);});
    }
    go.then(function(){playBusy=0;HV.toast('Playing on '+t.name);},function(e){playBusy=0;
      if(/playing the TV/.test(e&&e.message||''))openSheet('tvask',{uri:uri,name:t.name});else fail(e);});
  }
  function tvSheet(){
    var d=S.sheet.data;
    return '<div class="sh-hd"><h2>'+esc(d.name)+' is playing the TV</h2><button class="hv-pill" data-close="1">Cancel</button></div><div class="po-body">'+
      '<div class="sh-note">Starting music there cuts the TV sound.</div><div class="gl">'+
      '<button class="gr po-i" data-tvother="1"><span><b>Choose another speaker</b><small>Another room or a Spotify Connect speaker</small></span></button>'+
      '<button class="gr po-i" data-tvgo="1"><span><b>Play on '+esc(d.name)+' anyway</b><small>The TV goes quiet</small></span></button></div></div>';
  }
  function ctlConn(action,value,msg){
    var d=connDev();if(!d)return Promise.resolve(false);
    if(DEMO_CON){HV.toast('Demo: nothing sent');return Promise.resolve(false);}
    var data={action:action,device:d.id};if(value!=null)data.value=value;
    return HV.post('/api/frame/spotify/control',data).then(function(){if(msg)HV.toast(msg);setTimeout(loadPlayer,1200);return true;},function(e){fail(e);loadPlayer();return false;});
  }
  function drawSheet(){
    var el=$('sheet'),sc=$('scrim');
    if(!S.sheet){el.classList.remove('on');sc.classList.remove('on');return;}
    var k=S.sheet.kind;
    var pn=$('pane'),ps=pn&&el.contains(pn)?pn.scrollTop:0;
    el.innerHTML=k==='group'?groupSheet():k==='sound'?soundSheet():k==='detail'?detailSheet():k==='panel'?panelSheet():k==='playon'?playOnSheet():k==='tvask'?tvSheet():'';
    el.classList.toggle('playon',k==='playon');
    el.classList.toggle('panel',k==='panel');
    if(k==='panel'&&$('pane'))$('pane').scrollTop=ps;
    el.classList.add('on');sc.classList.add('on');
  }
  /* Group: choose the rooms that play with the selected one. The Arc on TV sound is refused by the server too. */
  function groupSheet(){
    var r=byId(S.sheet.data.room)||cur(),ch=S.sheet.data.checked,blocked=[];
    var h='<div class="sh-hd"><h2>Play with '+esc(r.name)+'</h2><button class="hv-pill" data-close="1">Cancel</button><button class="hv-pill primary" data-gdone="1">Done</button></div><div class="gl">';
    S.rooms.forEach(function(x){
      var self=x.id===r.id,inGroup=(r.group_ids||[]).indexOf(x.id)>=0,tvBlock=!self&&!inGroup&&x.tv&&x.caps&&x.caps.tv;
      if(tvBlock)blocked.push(x.name);
      var on=self||ch[x.id];
      h+='<button class="gr'+(on?' on':'')+(tvBlock||!x.ok?' blocked':'')+'" '+(self||tvBlock||!x.ok?'disabled':'data-gchk="'+esc(x.id)+'"')+'><i class="ck">'+CHECK+'</i><span><b>'+esc(x.name)+'</b><small>'+
        esc(self?'This room':tvBlock?'Playing TV sound':!x.ok?'No response':x.title?x.title:'Nothing playing')+'</small></span></button>';
    });
    h+='</div>';
    if(blocked.length)h+='<div class="sh-warn">'+esc(blocked.join(', '))+(blocked.length>1?' are':' is')+' playing TV sound, so '+(blocked.length>1?'they stay':'it stays')+' out of groups. Switch it to music first.</div>';
    else h+='<div class="sh-note">Grouped rooms play the same thing. The main volume moves them together; each room keeps its own volume on the Rooms tab.</div>';
    return h;
  }
  function stepRow(key,label,sub,v,lo,hi){
    return '<div class="sr"><div class="lb"><b>'+label+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div><div class="step"><button data-eq="'+key+'" data-d="-1"'+(v==null||v<=lo?' disabled':'')+' aria-label="'+label+' down">&minus;</button>'+
      '<output class="tnum">'+(v==null?'--':(v>0?'+':'')+v)+'</output><button data-eq="'+key+'" data-d="1"'+(v==null||v>=hi?' disabled':'')+' aria-label="'+label+' up">+</button></div></div>';
  }
  function toggleRow(key,label,sub,v){
    return '<div class="sr"><div class="lb"><b>'+label+'</b>'+(sub?'<small>'+sub+'</small>':'')+'</div><button class="tg'+(v?' on':'')+'" data-eqt="'+key+'" role="switch" aria-checked="'+(v?'true':'false')+'" aria-label="'+label+'"><i></i></button></div>';
  }
  function soundSheet(){
    var room=byId(S.sheet.data.room)||{},d=S.sound;
    var h='<div class="sh-hd"><h2>'+esc(room.name||'')+' sound</h2>';
    if(d&&d.battery){var b=d.battery;h+='<span class="bat"><i style="--lv:'+b.level+'%"></i>'+b.level+'%'+(b.charging?' · charging':'')+'</span>';}
    h+='<button class="hv-pill" data-close="1">Done</button></div>';
    if(!d)return h+'<div class="sh-note">Reading '+esc(room.name||'')+'\u2019s settings</div>';
    if(d.error)return h+'<div class="sh-note">'+esc(d.error)+'</div>';
    var v={},c=d.caps||{},k;for(k in d.values)v[k]=d.values[k];for(k in S.soundPend)v[k]=S.soundPend[k];
    h+='<div class="sn">'+stepRow('bass','Bass','',v.bass,-10,10)+toggleRow('loudness','Loudness','Fuller sound at low volume',v.loudness)+
      stepRow('treble','Treble','',v.treble,-10,10)+toggleRow('crossfade','Crossfade','Blend songs together · whole group',S.soundPend.crossfade!=null?S.soundPend.crossfade:d.crossfade);
    if(c.night)h+=toggleRow('night','Night sound','Quieter loud parts on TV',v.night);
    if(c.speech)h+=toggleRow('speech','Speech enhancement','Clearer voices on TV',v.speech);
    if(c.sub)h+=stepRow('sub_gain','Sub level','',v.sub_gain,-15,15);
    if(c.surround)h+=stepRow('surround_level','Surround level','TV',v.surround_level,-15,15);
    var left=d.sleep,opts=[[0,'Off'],[15,'15 min'],[30,'30 min'],[45,'45 min'],[60,'1 hour'],[90,'90 min']];
    h+='<div class="sr sl"><div class="lb"><b>Sleep timer</b><small>'+(left?'Stops in '+Math.max(1,Math.round(left/60))+' min':'Off')+'</small></div><div class="opts">'+
      opts.map(function(o){return '<button data-sleep="'+o[0]+'" class="'+((!left&&!o[0])?'on':'')+'">'+o[1]+'</button>';}).join('')+'</div></div></div>';
    return h;
  }
  function detailSheet(){
    var D=S.detail||{},x=D.doc;
    var h='<div class="sh-hd"><h2>'+esc(x?x.name:D.title||'')+'</h2><button class="hv-pill" data-close="1">Close</button></div>';
    if(D.error)return h+'<div class="sh-note">'+esc(D.error)+'</div>';
    if(!x)return h+'<div class="sh-note">Loading</div>';
    var tracks=D.kind==='artist'?(x.top_tracks||[]):(x.tracks||[]),play=null,label='';
    if(D.kind==='artist'){
      if(tracks.length){play=tracks[0].uri;label='Play top song';}
      else if(x.albums&&x.albums.length){play=x.albums[0].uri;label='Play \u201c'+x.albums[0].name+'\u201d';}
    }else{play=x.uri;label='Play';}
    h+='<div class="dt"><div class="dt-l'+(D.kind==='artist'?' ar':'')+'"><i class="im"'+bg(x.image)+'></i><b>'+esc(x.name)+'</b><small>'+esc(x.subtitle||'')+'</small>'+
      (play?'<button class="hv-pill primary" data-spplay="'+esc(play)+'">'+PLAY+'<span class="pl-l">'+esc(label)+'</span></button>'+chipHTML(true):'<div class="sh-note">Nothing here can play.</div>')+
      '</div><div class="dt-r">';
    if(tracks.length)h+=(D.kind==='artist'?'<h4>Top songs</h4>':'')+tracks.map(function(t,i){return trackRow(t,D.kind==='album'?i+1:0);}).join('');
    if(D.kind==='artist'&&x.albums&&x.albums.length)h+='<h4 style="margin-top:2vh">Albums</h4><div class="sp-row">'+x.albums.map(tile).join('')+'</div>';
    if(!tracks.length&&D.kind!=='artist')h+='<div class="sh-note">Spotify did not list the tracks. Play still works.</div>';
    return h+'</div></div>';
  }

  /* ---------- render ---------- */
  function render(){
    var main=$('main');
    [].forEach.call(document.querySelectorAll('#seg button'),function(b){b.classList.toggle('on',b.getAttribute('data-mode')===S.mode);});
    var keep=document.activeElement&&document.activeElement.id==='sp-q';
    var sc=$('pane'),scrollPane=sc&&!$('sheet').contains(sc)?sc.scrollTop:0,sp=$('sp-scroll'),scrollSp=sp?sp.scrollTop:0;
    document.body.classList.toggle('fb-idle',fullBleed()&&!S.ctl);
    var rr0=cur();document.body.classList.toggle('on-art',S.mode==='np'&&S.loaded&&(connShown()||(!!rr0&&!idle(rr0))));
    if(S.sheet&&S.sheet.kind==='panel')drawSheet();
    if(S.mode==='sp'){
      main.innerHTML=spHTML();lazyArt();
      if($('sp-scroll'))$('sp-scroll').scrollTop=scrollSp;
      if(keep&&$('sp-q')){var i=$('sp-q');i.focus();try{i.setSelectionRange(i.value.length,i.value.length);}catch(e){}}
      return;
    }
    if(!S.loaded){main.innerHTML='<div class="hv-empty">Loading Sonos</div>';return;}
    if(connShown()){document.body.classList.add('on-art');main.innerHTML=connHTML();tick();return;}
    if(!S.rooms.length){main.innerHTML='<div class="hv-card"><h3>Sonos</h3><div class="hv-empty">'+(HV.cfg.sonos?'Sonos is not responding. Your rooms appear here when the server can reach the speakers.':'Sonos is turned off. Set sonos.enabled to true in config.json to use your speakers.')+'</div></div>';return;}
    var r=cur();S.sel=r.id;
    main.innerHTML=idle(r)?'<div class="mu-np">'+startHTML(r)+sideHTML(r)+'</div>':r.kind==='podcast'?podHTML(r):fbHTML(r);
    if($('pane')&&!$('sheet').contains($('pane')))$('pane').scrollTop=scrollPane;
    tick();
    if(!S.zonesOnly&&!S.favs[r.id]&&!S.favBusy[r.id]&&!S.favErr[r.id])loadFavs(r.id);
    if(queueShown()&&(S.queueFor!==r.id||Date.now()-S.queueAt>15000))loadQueue(r);
  }

  /* ---------- data ---------- */
  var sig='';
  function setRooms(rs,zo){
    var n=JSON.stringify(rs.map(function(r){var o={},k;for(k in r)if(k!=='at'&&k!=='position')o[k]=r[k];return o;}))+zo;
    S.rooms=rs;S.zonesOnly=zo;
    if(!S.sel){
      var p=null;rs.forEach(function(r){if(wantRoom&&r.name.toLowerCase()===wantRoom.toLowerCase())p=r;});
      if(!p)rs.forEach(function(r){if(!p&&r.state==='PLAYING'&&!r.tv)p=r;});
      if(!p&&S.po&&S.po.kind==='sonos')rs.forEach(function(r){if(r.id===S.po.id)p=r;});
      if(!p)rs.forEach(function(r){if(!p&&r.ok&&r.title&&!r.tv)p=r;});
      if(!p)rs.forEach(function(r){if(!p&&r.ok&&!r.tv)p=r;});
      S.sel=(p||rs[0]||{}).id||null;
    }
    if(S.loaded&&n===sig){tick();return;}
    var first=!S.loaded;sig=n;S.loaded=true;if(S.mode==='np'||(first&&!S.sp.q))render();   // the Spotify tab shows the Play on chip, which needs the rooms
  }
  function fromZones(){return Promise.resolve([]);}
  function load(){
    if(DEMO){setRooms(demoRooms(),false);return Promise.resolve();}
    return HVJson('/api/frame/music').then(function(d){
      if(d&&d.rooms&&d.rooms.length){setRooms(d.rooms,false);return;}
      return fromZones().then(function(rs){setRooms(rs,true);});
    },function(){return fromZones().then(function(rs){setRooms(rs,true);});});
  }
  function loadFavs(id){
    S.favBusy[id]=true;
    var p=DEMO?Promise.resolve({favorites:demoFavs()}):HVJson('/api/frame/favorites/'+encodeURIComponent(id));
    p.then(function(d){S.favs[id]=d.favorites||[];},function(e){S.favErr[id]=(e&&e.message)||'Favorites did not load';})
     .then(function(){S.favBusy[id]=false;if(S.sel===id&&S.mode==='np')render();});
  }
  function loadQueue(r){
    var id=r.id;S.queueAt=Date.now();
    if(S.queueFor!==id)S.queue=null;
    S.queueFor=id;
    var start=Math.max(0,(r.track_no||1)-1);
    var p=DEMO?Promise.resolve(demoQueue()):HVJson('/api/frame/music/queue/'+encodeURIComponent(id)+'?start='+start);
    p.then(function(d){if(S.queueFor===id)S.queue=d;},function(e){if(S.queueFor===id)S.queue={error:(e&&e.message)||'The queue did not load'};})
     .then(function(){if(queueShown()&&S.sel===id)render();});
  }
  function loadSound(id){
    S.sound=null;S.soundPend={};
    var p=DEMO?Promise.resolve(demoSound(id)):HVJson('/api/frame/music/settings/'+encodeURIComponent(id));
    p.then(function(d){S.sound=d;},function(e){S.sound={error:(e&&e.message)||'The speaker did not answer'};})
     .then(function(){if(S.sheet&&S.sheet.kind==='sound'&&S.sheet.data.room===id)drawSheet();});
  }
  function loadPlayer(){
    if(DEMO_CON){S.pl=demoPlayer();return afterPlayer();}
    var st=S.sp.status;if(DEMO||!st||!st.signed_in)return Promise.resolve();
    return HVJson('/api/frame/spotify/player').then(function(d){
      var P=d&&d.player;S.pl=P&&P.playing!==undefined&&P.item?P:null;if(S.pl)S.pl.at=Date.now();
      afterPlayer();
    },function(){});
  }
  function afterPlayer(){
    var P=S.pl,dv=connDev(),n=JSON.stringify([!!P,P&&P.playing,P&&P.item&&P.item.uri,dv&&dv.id,dv&&dv.name,S.evol?null:dv&&dv.volume,connShown()]);
    if(n!==S.plSig){S.plSig=n;if(S.mode==='np'&&!S.sheet)render();}
    else tick();
    return Promise.resolve();
  }
  function pollPlayer(){loadPlayer();setTimeout(pollPlayer,connShown()&&!document.hidden?5000:30000);}
  function sp(path){return HVJson('/api/frame/spotify/'+path);}
  function loadSpotify(){
    return sp('status').then(function(st){
      S.sp.status=st;if(!st.signed_in){if(S.mode==='sp')render();return;}
      loadPlayer();
      var H=S.sp.home,n=0;
      function got(k){return function(d){H[k]=d.items||[];};}
      function done(){n++;if(S.mode==='sp'&&!S.sp.q)render();else if(S.mode==='np'&&idle(cur()))render();}
      function bad(e){S.sp.err=(e&&e.message)||'Spotify did not answer';}
      [['recent','recent'],['playlists','playlists'],['albums','albums'],['top','top?kind=artists']].forEach(function(x){sp(x[1]).then(got(x[0]),bad).then(done);});
    },function(){S.sp.status={signed_in:false};if(S.mode==='sp')render();});
  }
  var searchT=null,searchSeq=0;
  function search(q){
    S.sp.q=q;clearTimeout(searchT);
    if(!q){S.sp.results=null;render();return;}
    searchT=setTimeout(function(){
      var seq=++searchSeq;S.sp.busy=true;
      sp('search?q='+encodeURIComponent(q)).then(function(d){if(seq===searchSeq)S.sp.results=d.results||{};},function(e){if(seq===searchSeq)S.sp.results={};HV.toast((e&&e.message)||'Search did not work');})
        .then(function(){if(seq===searchSeq){S.sp.busy=false;render();}});
    },550);
  }
  function openDetail(kind,id,title){
    S.detail={kind:kind,id:id,title:title,doc:null};openSheet('detail');
    sp(kind+'?id='+encodeURIComponent(id)).then(function(d){if(S.detail&&S.detail.id===id){S.detail.doc=d[kind];drawSheet();}},
      function(e){if(S.detail&&S.detail.id===id){S.detail.error=(e&&e.message)||'Spotify did not answer';drawSheet();}});
  }

  function cmd(data,msg,room){
    if(DEMO){HV.toast('Demo: nothing sent');return Promise.resolve(false);}
    data.room=room||S.sel;
    return HV.post('/api/frame/music',data).then(function(){HV.toast(msg||'Sent to Sonos');setTimeout(load,1300);
      if(queueShown())setTimeout(function(){var r=cur();if(r)loadQueue(r);},1500);return true;},function(e){fail(e);return false;});
  }

  /* ---------- events ---------- */
  var volT=null,rvT={},eqT={};
  function attr(el,k){return el.getAttribute(k);}
  function startPending(){var u=S.pend;S.pend=null;if(u)playUri(u);}
  document.addEventListener('click',function(e){
    var t=e.target,el;poke();
    if((el=t.closest('[data-close]'))){S.pend=null;closeSheet();return;}   // Done/Cancel without choosing drops the waiting pick
    if((el=t.closest('[data-playon]'))){openPlayOn();return;}
    if((el=t.closest('[data-posonos]'))){var so=byId(attr(el,'data-posonos'));if(so){savePo({kind:'sonos',id:so.id,name:so.name});S.sel=so.id;}
      closeSheet();render();startPending();return;}
    if((el=t.closest('[data-poconn]'))){var cid=attr(el,'data-poconn'),cn=cid;(S.dev.list||[]).forEach(function(d){if(d.id===cid)cn=d.name;});
      savePo({kind:'connect',id:cid,name:cn});closeSheet();render();loadPlayer();startPending();return;}
    if((el=t.closest('[data-tvother]'))){S.pend=S.sheet.data.uri;S.sheet=null;openPlayOn();return;}
    if((el=t.closest('[data-tvgo]'))){var tu=S.sheet.data.uri;closeSheet();playUri(tu,true);return;}
    if((el=t.closest('[data-ea]'))){var ea=attr(el,'data-ea'),P1=S.pl;
      if(ea==='pause'||ea==='resume'){if(P1&&!DEMO_CON){P1.progress_ms=Math.round(epos()*1000);P1.at=Date.now();P1.playing=ea==='resume';render();}}
      ctlConn(ea,null,{pause:'Paused',resume:'Playing',next:'Skipping',previous:'Going back'}[ea]);return;}
    if((el=t.closest('[data-evol]'))){if(el.disabled||!connDev())return;var ed=connDev(),eb=S.evol?S.evol.v:ed.volume;
      S.evol={v:Math.max(0,Math.min(100,eb+(+attr(el,'data-evol'))))};render();
      clearTimeout(volT);volT=setTimeout(function(){var w=S.evol.v;ctlConn('volume',w,'Volume '+w+'%').then(function(){if(S.pl&&S.pl.device)S.pl.device.volume=w;S.evol=null;render();});},600);return;}
    if((el=t.closest('[data-panel]'))){S.tab=attr(el,'data-panel');openSheet('panel');render();return;}
    if((el=t.closest('[data-skip]'))){if(el.disabled)return;var rs=cur(),to2=Math.max(0,Math.min((rs.duration||1)-1,Math.round((livePos(rs)||0)+(+attr(el,'data-skip')))));
      cmd({action:'seek',position:to2},(+attr(el,'data-skip')<0?'Back ':'Forward ')+Math.abs(+attr(el,'data-skip'))+' s');return;}
    if((el=t.closest('[data-mode]'))){S.mode=attr(el,'data-mode');S.ctl=false;if(S.mode==='sp'&&!S.sp.status)loadSpotify();else if(S.mode==='np')loadPlayer();render();return;}
    if((el=t.closest('[data-tab]'))){S.tab=attr(el,'data-tab');render();return;}
    if((el=t.closest('[data-room]'))){S.sel=attr(el,'data-room');render();return;}
    if((el=t.closest('[data-a]'))){if(el.disabled)return;var a=attr(el,'data-a');cmd({action:a},{pause:'Paused',play:'Playing',next:'Skipping',previous:'Going back'}[a]);return;}
    if((el=t.closest('[data-pm]'))){if(el.disabled)return;var r=cur();
      if(attr(el,'data-pm')==='shuffle')cmd({action:'play_mode',shuffle:!r.shuffle},r.shuffle?'Shuffle off':'Shuffle on');
      else{var nx={off:'all',all:'one',one:'off'}[r.repeat||'off'];cmd({action:'play_mode',repeat:nx},{all:'Repeat all',one:'Repeat this song',off:'Repeat off'}[nx]);}return;}
    if((el=t.closest('#scrub'))){var rr=cur();if(!rr||!can(rr,'SeekTime')||!rr.duration)return;
      var box=el.getBoundingClientRect(),f=Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),to=Math.round(f*rr.duration);
      cmd({action:'seek',position:to},'Jumping to '+mmss(to));return;}
    if((el=t.closest('[data-vol]'))){if(el.disabled)return;var r2=cur(),base=S.vol&&S.vol.room===r2.id?S.vol.v:(r2.group_volume!=null?r2.group_volume:r2.volume);
      S.vol={room:r2.id,v:Math.max(0,Math.min(100,base+(+attr(el,'data-vol'))))};render();
      clearTimeout(volT);volT=setTimeout(function(){var w=S.vol;cmd({action:'volume',value:w.v},'Volume '+w.v+'%',w.room).then(function(){S.vol=null;render();});},600);return;}
    if((el=t.closest('[data-rv]'))){var id=attr(el,'data-rv'),rm=byId(id);if(!rm)return;
      var b2=S.rvol[id]!=null?S.rvol[id]:rm.volume;S.rvol[id]=Math.max(0,Math.min(100,b2+(+attr(el,'data-d'))));render();
      clearTimeout(rvT[id]);rvT[id]=setTimeout(function(){var w=S.rvol[id];cmd({action:'room_volume',value:w},rm.name+' '+w+'%',id).then(function(){delete S.rvol[id];render();});},600);return;}
    if((el=t.closest('[data-gear]'))){var gid=attr(el,'data-gear');openSheet('sound',{room:gid});loadSound(gid);return;}
    if((el=t.closest('[data-group]'))){var g=cur(),ch={};(g.group_ids||[]).forEach(function(i){ch[i]=true;});openSheet('group',{room:g.id,checked:ch});return;}
    if((el=t.closest('[data-gchk]'))){var c=S.sheet.data.checked,k=attr(el,'data-gchk');c[k]=!c[k];drawSheet();return;}
    if((el=t.closest('[data-gdone]'))){var d=S.sheet.data,m=[];for(var kk in d.checked)if(d.checked[kk])m.push(kk);
      var room=d.room;closeSheet();cmd({action:'group',members:m},m.length>1?'Grouping rooms':'Ungrouping',room);return;}
    if((el=t.closest('[data-fav]'))){cmd({action:'favorite',favorite:attr(el,'data-fav')},'Starting '+(el.querySelector('b')||el).textContent);return;}
    if((el=t.closest('[data-qplay]'))){cmd({action:'queue_play',index:+attr(el,'data-qplay')},'Playing');return;}
    if((el=t.closest('[data-qrm]'))){cmd({action:'queue_remove',index:+attr(el,'data-qrm')},'Removed');return;}
    if((el=t.closest('[data-qclear]'))){if(S.clearArm>Date.now()){S.clearArm=0;cmd({action:'queue_clear'},'Queue cleared');}
      else{S.clearArm=Date.now()+3000;setTimeout(render,3100);}render();return;}
    if((el=t.closest('[data-eq]'))){var key=attr(el,'data-eq'),dv=S.sound.values;var now=S.soundPend[key]!=null?S.soundPend[key]:dv[key];
      var lim=key==='bass'||key==='treble'?10:15;S.soundPend[key]=Math.max(-lim,Math.min(lim,now+(+attr(el,'data-d'))));drawSheet();
      var sr=S.sheet.data.room;clearTimeout(eqT[key]);eqT[key]=setTimeout(function(){cmd({action:'eq',setting:key,value:S.soundPend[key]},'Saved',sr);},600);return;}
    if((el=t.closest('[data-eqt]'))){var tk=attr(el,'data-eqt'),sv=S.sound;var cv=S.soundPend[tk]!=null?S.soundPend[tk]:(tk==='crossfade'?sv.crossfade:sv.values[tk]);
      S.soundPend[tk]=!cv;drawSheet();
      if(tk==='crossfade')cmd({action:'crossfade',on:!cv},'Crossfade '+(!cv?'on':'off'),S.sheet.data.room);
      else cmd({action:'eq',setting:tk,value:!cv},'Saved',S.sheet.data.room);return;}
    if((el=t.closest('[data-sleep]'))){var mn=+attr(el,'data-sleep');cmd({action:'sleep',minutes:mn||null},mn?'Sleep in '+mn+' min':'Sleep timer off',S.sheet.data.room)
      .then(function(ok){if(ok&&S.sheet)loadSound(S.sheet.data.room);});return;}
    if((el=t.closest('[data-spclear]'))){search('');return;}
    if((el=t.closest('[data-spplay]'))){playUri(attr(el,'data-spplay'));return;}
    if((el=t.closest('[data-sp]'))){var kind=attr(el,'data-sp'),pid=attr(el,'data-id'),uri=attr(el,'data-uri');
      if(kind==='album'||kind==='playlist'||kind==='artist'){openDetail(kind,pid,(el.querySelector('b')||el).textContent);return;}
      playUri(uri);return;}
    if(t.closest('#fb')&&fullBleed()&&!t.closest('.fb-ctl button,.fb-ctl .bar'))setCtl(!S.ctl);
  });
  document.addEventListener('input',function(e){if(e.target.id==='sp-q')search(e.target.value.replace(/^\s+/,''));});
  document.addEventListener('keydown',function(e){if(e.target.id==='sp-q'&&e.keyCode===13){e.target.blur();}});

  /* ---------- PREVIEW-ONLY demo state (?demo=1): sample data for screenshots; nothing is ever sent ---------- */
  function demoRooms(){
    var art='https://i.scdn.co/image/ab67616d0000b2739ccaa7931619cf504014a987';
    if(DEMO_POD)return [{id:'den',name:'Den',ok:true,state:'PLAYING',kind:'podcast',title:'Organize Your Life & Home: The Simple System That Gives You More Time',artist:'HOME Podcast',album:'HOME Podcast',
        volume:20,group_volume:20,source:'Spotify',queue:true,art:'https://i.scdn.co/image/ab67656300005f1ff288dbde4c90f4a92338d57e',group:['Den'],group_ids:['den'],coordinator:'den',
        position:1310,duration:3125,at:HV.now().getTime()/1000,shuffle:false,repeat:'off',tv:false,caps:{tv:true},actions:['Play','Pause','Next','SeekTime']},
      {id:'pat',name:'Patio',ok:true,state:'STOPPED',title:'',volume:30,group_ids:['pat'],caps:{battery:true},battery:{level:64,charging:false},actions:['Set']}];
    return [{id:'den',name:'Den',ok:true,state:'PLAYING',title:'Harvest Moon',artist:'Neil Young',album:'Harvest Moon',volume:18,group_volume:22,
        source:'Spotify',queue:true,art:art,group:['Patio','Den'],group_ids:['den','pat'],coordinator:'den',position:95,duration:303,track_no:4,
        at:HV.now().getTime()/1000,shuffle:true,repeat:'all',sleep:1500,tv:false,kind:'track',battery:null,caps:{tv:true,night:true,speech:true,sub:true,surround:true},
        actions:['Play','Pause','Next','Previous','SeekTime']},
      {id:'pat',name:'Patio',ok:true,state:'PLAYING',title:'Harvest Moon',artist:'Neil Young',album:'Harvest Moon',volume:30,group_volume:22,source:'Spotify',
        queue:true,art:art,group:['Patio','Den'],group_ids:['den','pat'],coordinator:'den',position:95,duration:303,at:HV.now().getTime()/1000,
        shuffle:true,repeat:'all',tv:false,battery:{level:64,charging:false},caps:{battery:true},actions:['Play','Pause','Next','Previous','SeekTime']},
      {id:'kit',name:'Kitchen',ok:true,state:'STOPPED',title:'',artist:'',album:'',volume:25,group_volume:25,source:'Sonos',group:['Kitchen'],group_ids:['kit'],
        coordinator:'kit',tv:false,caps:{},actions:['Set']}];
  }
  function demoDevices(){return [{id:'d1abcdefghijklmnop',name:'Office speaker',type:'Speaker',active:false,volume:40},{id:'d2abcdefghijklmnop',name:'Bedroom speaker',type:'Speaker',active:false,volume:60}];}
  function demoPlayer(){return {playing:true,progress_ms:95000,at:Date.now(),item:{name:'Harvest Moon',subtitle:'Neil Young',kind:'track',duration_ms:303000,uri:'spotify:track:demo',
    image:'https://i.scdn.co/image/ab67616d0000b2739ccaa7931619cf504014a987'},device:{id:'demo-office',name:'Office speaker',type:'Speaker',volume:40}};}
  function demoFavs(){return [{id:'d1',title:'Trending Now',kind:'From Sonos Radio',art:''},{id:'d2',title:'Sample Artist',kind:'Artist',art:''},
    {id:'d3',title:'Sample Song',kind:'By Sample Band',art:''},{id:'d4',title:'Discover Sonos Radio',kind:'From Sonos Radio',art:''},{id:'d5',title:'Favorites',kind:'From Sonos Radio',art:''}];}
  function demoQueue(){var t=['Harvest Moon','Old Man','Heart of Gold','Unknown Legend','From Hank to Hendrix','Out on the Weekend','Comes a Time','Long May You Run'];
    return {ok:true,start:3,total:24,current:3,active:true,items:t.map(function(x,i){return {index:3+i,title:x,artist:'Neil Young',art:''};})};}
  function demoSound(id){return id==='den'?{ok:true,caps:{night:true,speech:true,sub:true,surround:true},values:{bass:2,treble:2,loudness:true,night:false,speech:true,sub_gain:8,surround_level:7},crossfade:false,sleep:1500,battery:null}:
    {ok:true,caps:{},values:{bass:3,treble:1,loudness:true},crossfade:false,sleep:null,battery:id==='pat'?{level:64,charging:false}:null};}

  HV.chrome({light:true});HV.back('Home');
  render();load();loadSpotify();if(DEMO_CON)loadPlayer();
  setTimeout(pollPlayer,30000);
  if(qp('sheet')==='group')setTimeout(function(){var g=cur();if(g){var ch={};(g.group_ids||[]).forEach(function(i){ch[i]=true;});openSheet('group',{room:g.id,checked:ch});}},2500);
  if(qp('sheet')==='sound')setTimeout(function(){var g=cur();if(g){openSheet('sound',{room:g.id});loadSound(g.id);}},2500);
  setInterval(tick,1000);
  setInterval(function(){if(document.hidden||S.vol)return;for(var k in S.rvol)return;load();},5000);
  setInterval(function(){var r=cur();if(queueShown()&&r&&!document.hidden)loadQueue(r);},15000);
})();
