/* HomeView screens: shared helpers. Load after /frame/hv/config.js (window.HV_CONFIG, written by the server
   from config.json) and /frame/shared/cond.js (HVJson). ES5 on purpose (old WebView). Exposes window.HV:

   HV.now()            Date for "now" corrected by the server clock (frames drift)
   HV.local(d)        {y,mo,d,h,mi,s,dow} in the home time zone (config.json "timezone"), never the device zone
   HV.cfg             window.HV_CONFIG (home_name, timezone, place, temp_unit, calendars, timers, sonos, spotify)
   HV.calColor(key)   a calendar's color from config.json;  HV.calName(key) its name;  HV.isHoliday(key)
   HV.hm(d)            "6:05"   HV.ampm(d) "PM"
   HV.dayWord(d,short) "Today" / "Tomorrow" / "Thursday" / "Wed, Oct 21" (short: "Thu" / "Wed 21")
   HV.state            the last /api/hv/state ({timers, command, now})
   HV.on(fn)           called with HV.state after every poll
   HV.post(path, obj)  JSON POST, resolves to the reply (rejects with a readable message)
   HV.toast(text)
   HV.chrome(opts)     adds the top-right camera chip (if set up) + clock + Standby chip and the running-timer pills

   Voice/remote commands: a command newer than the one this frame last acted on, and under 30 s
   old, navigates to its screen once. The last seen seq is kept in localStorage per frame. */
(function(){
  var HV=window.HV={state:{timers:[],command:null,now:Date.now()/1000}};
  var CFG=HV.cfg=window.HV_CONFIG||{};
  var CALS={};(CFG.calendars||[]).forEach(function(c){CALS[c.key]=c;});
  HV.calColor=function(k){return (CALS[k]&&CALS[k].color)||'#ff9f0a';};
  HV.calName=function(k){return (CALS[k]&&CALS[k].name)||'Calendar';};
  HV.isHoliday=function(k){return !!(CALS[k]&&CALS[k].holidays);};   // holiday calendars show as day tags, not as events
  var skew=0, subs=[], DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  HV.DAYS=DAYS; HV.MONTHS=MONTHS;
  HV.now=function(){return new Date(Date.now()+skew);};
  var fmt=null;
  try{fmt=new Intl.DateTimeFormat('en-US',{timeZone:CFG.timezone||'America/New_York',hour12:false,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',weekday:'short'});}catch(e){}
  var WD={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  HV.local=function(d){
    d=d||HV.now();
    if(!fmt)return {y:d.getFullYear(),mo:d.getMonth()+1,d:d.getDate(),h:d.getHours(),mi:d.getMinutes(),s:d.getSeconds(),dow:d.getDay()};
    var o={};fmt.formatToParts(d).forEach(function(p){o[p.type]=p.value;});
    return {y:+o.year,mo:+o.month,d:+o.day,h:(+o.hour)%24,mi:+o.minute,s:+o.second,dow:WD[o.weekday]};
  };
  function pad(n){return n<10?'0'+n:''+n;}
  HV.pad=pad;
  HV.hm=function(d){var t=HV.local(d);return ((t.h%12)||12)+':'+pad(t.mi);};
  HV.ampm=function(d){return HV.local(d).h<12?'AM':'PM';};
  HV.mmss=function(sec){sec=Math.max(0,Math.ceil(sec));var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
    return h?h+':'+pad(m)+':'+pad(s):m+':'+pad(s);};
  /* the day of a Date, as every screen words it: 'Today', 'Tomorrow', 'Thursday' up to 6 days ahead, then
     'Wed, Oct 21' (a bare weekday a week out reads as this week's). short: 'Thu' and 'Wed 21'. */
  HV.dayWord=function(d,short){
    var t=HV.local(d),n=HV.local(),k=Math.round((Date.UTC(t.y,t.mo-1,t.d)-Date.UTC(n.y,n.mo-1,n.d))/864e5),w=DAYS[t.dow];
    if(k===0)return 'Today';if(k===1)return 'Tomorrow';
    if(k>1&&k<7)return short?w.slice(0,3):w;
    return short?w.slice(0,3)+' '+t.d:w.slice(0,3)+', '+MONTHS[t.mo-1].slice(0,3)+' '+t.d;
  };
  HV.esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};

  /* Look: 'glass' (HomeView wallpaper + glass tiles) or 'apple' (light grouped cards). ?look= wins and is
     remembered on this frame; default stays 'apple' until a look is chosen. The wallpaper follows home time. */
  HV.look=(function(){
    var q=(location.search.match(/[?&]look=(glass|apple)/)||[])[1],v=q;
    try{if(q)localStorage.setItem('hv-look',q);else v=localStorage.getItem('hv-look');}catch(e){}
    return v==='glass'?'glass':'apple';
  })();
  /* Background for the glass look, per frame (localStorage 'hv-wall'):
       {t:'auto'}              wallpaper by home time of day (default)
       {t:'color', c:'#e0791c'} a HomePod-style soft gradient built from one color
       {t:'image', id:'x.jpg'}  a wallpaper from the server's wallpapers folder (config.json wallpapers_dir)
     HV.wall() reads it, HV.setWall(obj) saves it and repaints. */
  function hex2hsl(h){h=h.replace('#','');var r=parseInt(h.substr(0,2),16)/255,g=parseInt(h.substr(2,2),16)/255,b=parseInt(h.substr(4,2),16)/255;
    var mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn,s2=0,hh=0;
    if(d){s2=l>.5?d/(2-mx-mn):d/(mx+mn);hh=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;hh*=60;}
    return [Math.round(hh),Math.round(s2*100),Math.round(l*100)];}
  function hsl(h,s2,l){return 'hsl('+h+','+Math.max(0,Math.min(100,s2))+'%,'+Math.max(4,Math.min(92,l))+'%)';}
  HV.gradientFor=function(c){var x=hex2hsl(c),h=x[0],s2=x[1],l=x[2];
    return 'linear-gradient(160deg,'+hsl(h-6,s2+4,l+14)+' 0%,'+hsl(h,s2,l)+' 48%,'+hsl(h+8,s2+6,l-22)+' 100%)';};
  HV.wall=function(){try{var w=JSON.parse(localStorage.getItem('hv-wall')||'null');if(w&&w.t)return w;}catch(e){}return {t:'auto'};};
  function paintWall(){
    var b=document.body;if(!b||HV.look!=='glass'||b.getAttribute('data-wall')==='off')return;   // timer, night, standby stay dark
    b.className=b.className.replace(/\bwall-\w+/g,'').trim();
    var w=HV.wall(),h=HV.local().h;
    b.classList.remove('wall-light');
    if(w.t==='color'&&/^#[0-9a-fA-F]{6}$/.test(w.c||'')){b.style.background=HV.gradientFor(w.c);b.classList.add('wall-custom');
      if(hex2hsl(w.c)[2]>=58)b.classList.add('wall-light');return;}
    if(w.t==='image'&&w.id){var url='/frame/hv/wallpapers/'+encodeURIComponent(w.id);
      b.style.background='linear-gradient(180deg,rgba(0,0,0,.10),rgba(0,0,0,.26)),url("'+url+'") center/cover no-repeat #222';
      b.classList.add('wall-custom');lightness(url,function(l){if(l>0.62)b.classList.add('wall-light');});return;}
    b.style.background='';b.classList.add('wall-'+(h<5?'night':h<10?'morning':h<17?'day':h<21?'evening':'night'));
  }
  /* average luminance (0-1) of a wallpaper from an 8x8 sample, cached per URL; light ones get darker glass */
  function lightness(url,cb){
    var k='hv-wl:'+url,v=null;try{v=localStorage.getItem(k);}catch(e){}
    if(v!==null){cb(+v);return;}
    var im=new Image();im.onload=function(){try{var c=document.createElement('canvas');c.width=c.height=8;var x=c.getContext('2d');x.drawImage(im,0,0,8,8);
      var d=x.getImageData(0,0,8,8).data,t=0;for(var i=0;i<d.length;i+=4)t+=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;var l=t/64;
      try{localStorage.setItem(k,String(l.toFixed(3)));}catch(e){}cb(l);}catch(e){}};im.src=url;
  }
  HV.setWall=function(w){try{localStorage.setItem('hv-wall',JSON.stringify(w));}catch(e){}paintWall();};
  if(HV.look==='glass'){
    document.documentElement.classList.add('look-glass');
    // accent text readable over the wallpaper (glass-contrast.css)
    var gl=document.createElement('link');gl.rel='stylesheet';gl.href='/frame/hv/glass-contrast.css?v=1';(document.head||document.documentElement).appendChild(gl);
    if(document.body)paintWall();else document.addEventListener('DOMContentLoaded',paintWall);
    setInterval(paintWall,300000);
  }
  /* Standby faces this frame shows (localStorage 'hv-faces'); Settings > Standby faces edits it. */
  HV.FACES=[['photos','Photos','Your photos, with the date and time',1],['info','Info','Date, clock, today\'s agenda, weather',1],
    ['today','Today','Big date, weather, next events, dinner',1],['week','This week','Seven days: events, dinner, weather',1],
    ['weather','Weather','Now, the next 7 days and hours',1],['tomorrow','Tomorrow','Tomorrow: weather, backpack, school week',1],['board','Today board','Clock, rain chart, today, get ready, home',1],['up','Coming up','The next two weeks of calendars',1],
    ['analog','Analog','Clock with date, weather, next event, dinner',1],['numerals','Numerals','Giant 12 3 6 9, color by day',1],
    ['minimal','Minimal','Soft rose clock',1],['night','Night clock','Dim red clock and what\'s next; shows on its own',1],['month','Month','Calendar grid with the big date',0],
    ['alert','Severe weather','Only while a Severe or Extreme weather alert is active',1]];
  HV.facesOn=function(){var on={};HV.FACES.forEach(function(f){on[f[0]]=!!f[3];});
    try{var v=JSON.parse(localStorage.getItem('hv-faces')||'null');if(v)for(var k in v)if(k in on)on[k]=!!v[k];}catch(e){}return on;};
  HV.setFace=function(k,v){var on=HV.facesOn();on[k]=!!v;try{localStorage.setItem('hv-faces',JSON.stringify(on));}catch(e){}return on;};
  HV.on=function(fn){subs.push(fn);try{fn(HV.state);}catch(e){}};
  HV.post=function(path,obj){
    return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj||{}),cache:'no-store'})
      .then(function(r){return r.json().catch(function(){return {ok:false,error:'HTTP '+r.status};});})
      .then(function(d){if(d&&d.ok===false)throw new Error(d.error||'That did not work');return d;});
  };
  var toastEl=null,toastT=null;
  HV.toast=function(text){
    if(!toastEl){toastEl=document.createElement('div');toastEl.className='hv-toast';document.body.appendChild(toastEl);}
    toastEl.textContent=text;toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){toastEl.classList.remove('on');},3500);
  };

  /* screens a command can open */
  HV.SCREENS={standby:'/frame/hv/standby/',timer:'/frame/hv/timer/',dinner:'/frame/hv/dinner/',
    shopping:'/frame/hv/shopping/',today:'/frame/hv/today/',calendar:'/frame/hv/calendar/',weather:'/frame/hv/weather/',launcher:'/frame/hv/',
    meals:'/frame/hv/meals/',music:'/frame/hv/music/',photos:'/frame/hv/photos/',night:'/frame/hv/night/',camera:'/frame/hv/camera/',ha:'/frame/hv/ha/'};
  var SEEN='hv-cmd-seen';
  function seen(){try{return +localStorage.getItem(SEEN)||0;}catch(e){return 0;}}
  function setSeen(n){try{localStorage.setItem(SEEN,String(n));}catch(e){}}
  function act(cmd){
    if(!cmd||cmd.seq<=seen())return;
    setSeen(cmd.seq);
    if(HV.state.now-cmd.at>30)return;                       // stale: a page load must not replay an old command
    var url=HV.SCREENS[cmd.screen];if(!url)return;
    if(location.pathname===url.split('?')[0]&&!/\?/.test(url))return;
    location.href=url;
  }
  var first=true;
  function poll(){
    HVJson('/api/hv/state').then(function(d){
      if(d&&d.ok){
        skew=d.now*1000-Date.now();HV.state=d;
        if(first){first=false;if(d.command&&!seen())setSeen(d.command.seq);} // a frame's first ever load: don't act
        act(d.command);
        subs.forEach(function(fn){try{fn(d);}catch(e){}});
      }
    },function(){}).then(function(){setTimeout(poll,3000);});
  }
  poll();

  /* Idle return (Settings > When untouched): localStorage 'hv-idle'
     {mode: off|photos|dim, minutes: 1|3|5|10}. After that many minutes with no touch, go to Standby,
     or to the night clock while the Standby schedule has it (faces/sched.js; 23:00-05:00 when that isn't loaded).
     Pages opt out with <body data-idle="off"> (Standby, Night, Timer, Cook). Typing or an open sheet holds it. */
  HV.nightNow=function(){var t=HV.local();
    if(window.HVSched)return HVSched.isNight(HVSched.load(HV.facesOn()),t.dow,t.h*60+t.mi);
    return t.h>=23||t.h<5;};
  HV.idleTarget=function(){
    if(HV.nightNow())return '/frame/hv/night/';
    return '/frame/hv/standby/';
  };
  (function(){
    var cfg={mode:'photos',minutes:3};
    try{var v=JSON.parse(localStorage.getItem('hv-idle')||'null');if(v){if(['off','photos','dim'].indexOf(v.mode)>=0)cfg.mode=v.mode;if([1,3,5,10].indexOf(+v.minutes)>=0)cfg.minutes=+v.minutes;}}catch(e){}
    var q=(location.search.match(/[?&]idle=(\d+)/)||[])[1];if(q)cfg.minutes=+q/60;   // ?idle=SECONDS, for tests
    var stamp=Date.now();
    function touch(){stamp=Date.now();}
    ['pointerdown','keydown','wheel','touchstart'].forEach(function(n){document.addEventListener(n,touch,{capture:true,passive:true});});
    document.addEventListener('visibilitychange',touch);
    function held(){var b=document.body,e=document.activeElement;if(!b||b.getAttribute('data-idle')==='off')return true;
      if(e&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName))return true;
      return !!document.querySelector('.hv-sheet.on,.sheet.on,.dn-sheet.on,.dn-cook.on,.ml-dt.on');}
    HV.idleCfg=cfg;
    setInterval(function(){if(cfg.mode==='off'||held())return;if(Date.now()-stamp>=cfg.minutes*60000){stamp=Date.now();location.href=HV.idleTarget();}},5000);
  })();

  /* top-left Back chip for screens below the Home launcher */
  HV.back=function(label,url){
    var b=document.createElement('button');b.className='hv-chip light hv-back';
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'+HV.esc(label||'Home');
    b.onclick=function(){location.href=url||'/frame/hv/';};document.body.appendChild(b);return b;
  };

  /* Weather alert chip (Home Assistant NWS Alerts sensor, config.json home_assistant.alerts_entity): shown left of the
     other chips only while an alert is active; red for Severe/Extreme, orange otherwise. Tap: the full text in a sheet. */
  function alertChip(bar,opts){
    var chip=document.createElement('button');chip.className='hv-chip hv-alert';chip.style.display='none';
    bar.insertBefore(chip,bar.firstChild);
    var list=[],sheet=null,shade=null;
    function sev(a){return /Extreme|Severe/.test(a.severity)?'red':'orange';}
    function when(iso){if(!iso)return '';var d=new Date(iso);if(isNaN(d))return '';return HV.dayWord(d)+' '+HV.hm(d)+' '+HV.ampm(d);}
    function para(t){   /* NWS text: "* WHAT...Minor flooding." blocks; single newlines are line wraps */
      return HV.esc(t).split(/\n\s*\n/).map(function(p){
        p=p.replace(/\n/g,' ').replace(/^\* ?([A-Z][A-Z ]+)\.\.\./,function(m,k){return '<b>'+k.charAt(0)+k.slice(1).toLowerCase()+':</b> ';});
        return '<p>'+p+'</p>';}).join('');
    }
    function close(){if(sheet){sheet.classList.remove('on');shade.classList.remove('on');}}
    function open(){
      if(!sheet){shade=document.createElement('div');shade.className='hv-alert-shade';shade.onclick=close;document.body.appendChild(shade);
        sheet=document.createElement('div');sheet.className='hv-sheet hv-alert-sheet';document.body.appendChild(sheet);
        sheet.onclick=function(e){if(e.target.closest('.hv-alert-close'))close();};}
      var h='';
      list.forEach(function(a){
        var until=when(a.ends||a.expires);
        h+='<section><div class="hv-alert-tag '+sev(a)+'">'+HV.esc(a.severity||'Alert')+'</div><h2>'+HV.esc(a.event)+'</h2>'+
          '<div class="hv-alert-meta">'+(until?'Until '+HV.esc(until):'')+(a.areas?(until?' \u00b7 ':'')+HV.esc(a.areas):'')+'</div>'+
          (a.headline?'<p class="hv-alert-head">'+HV.esc(a.headline.charAt(0)+a.headline.slice(1).toLowerCase())+'</p>':'')+
          para(a.description||'')+(a.instruction?'<p class="hv-alert-do">'+HV.esc(a.instruction)+'</p>':'')+'</section>';
      });
      sheet.innerHTML=h+'<button class="hv-alert-close">Close</button>';sheet.scrollTop=0;
      sheet.classList.add('on');shade.classList.add('on');
    }
    chip.onclick=open;
    function draw(){
      if(!list.length){chip.style.display='none';close();return;}
      var a=list[0];chip.className='hv-chip hv-alert '+sev(a);chip.style.display='';
      chip.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/></svg><span>'+HV.esc(a.event)+'</span>'+(list.length>1?'<em>+'+(list.length-1)+'</em>':'');
    }
    function load(){HVJson('/api/ha/alerts').then(function(d){list=(d&&d.alerts)||[];draw();},function(){}).then(function(){setTimeout(load,60000);});}
    load();
  }

  /* Rain soon chip, left of the camera button: weather.nowcast from /api/frame (rain in the next two hours, or
     raining now). Pages that have the forecast call HV.rainChip(weather.nowcast) on every refresh; null hides it.
     Tap: the Weather screen. */
  var rainEl=null;
  HV.rainChip=function(n){
    var c=document.querySelector('.hv-chrome');if(!c)return;
    function t12(s){var h=+s.slice(11,13),m=+s.slice(14,16);return (h%12||12)+':'+pad(m)+' '+(h<12?'AM':'PM');}
    var txt=null;
    if(n&&n.state==='start'&&n.at)txt=n.mins<=5?'Rain starting now':'Rain around '+t12(n.at)+' <em>in '+n.mins+' min</em>';
    else if(n&&n.state==='stop'&&n.at)txt='Raining <em>until about '+t12(n.at)+'</em>';
    else if(n&&n.state==='rain')txt='Raining now';
    if(!txt){if(rainEl)rainEl.style.display='none';return;}
    if(!rainEl){rainEl=document.createElement('a');rainEl.className='hv-chip hv-rain';rainEl.href=HV.SCREENS.weather||'/frame/hv/weather/';
      if(/\/weather\//.test(location.pathname))rainEl.onclick=function(e){e.preventDefault();};
      var cam=c.querySelector('.hv-cam'),clk=c.querySelector('.hv-chip.tnum');c.insertBefore(rainEl,cam||clk||null);}
    rainEl.style.display='';
    rainEl.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 0 4 0"/></svg><span>'+txt+'</span>';
  };

  /* top-right chrome + timer pills */
  HV.chrome=function(opts){
    opts=opts||{};
    var c=document.createElement('div');c.className='hv-chrome';
    var clock=document.createElement('div');clock.className='hv-chip tnum'+(opts.light?' light':'');
    /* camera chip, left of the clock, when config.json has a camera (opts.camera:false hides it) */
    if(CFG.camera&&opts.camera!==false&&opts.clock!==false){
      var cam=document.createElement('button');cam.className='hv-chip hv-cam'+(opts.light?' light':'');cam.setAttribute('aria-label',CFG.camera_name||'Camera');
      cam.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13.5" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3z"/></svg>';
      cam.onclick=function(){location.href=HV.SCREENS.camera;};c.appendChild(cam);
    }
    if(opts.clock!==false)c.appendChild(clock);
    if(CFG.ha_alerts&&opts.alerts!==false&&opts.clock!==false)alertChip(c,opts);
    if(opts.standby!==false){
      var b=document.createElement('button');b.className='hv-chip'+(opts.light?' light':'');b.setAttribute('aria-label','Standby');
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15l3-3 2 2 3-4 2 3"/></svg>';
      b.onclick=function(){location.href=HV.SCREENS.standby;};c.appendChild(b);
    }
    document.body.appendChild(c);
    function tickClock(){clock.textContent=HV.hm()+' '+HV.ampm();}
    tickClock();setInterval(tickClock,5000);
    if(opts.timers===false)return;
    var t=document.createElement('div');t.className='hv-timers';document.body.appendChild(t);
    function drawTimers(){
      var now=HV.now().getTime()/1000,h='';
      (HV.state.timers||[]).forEach(function(x){var left=x.ends-now;
        h+='<button class="hv-tpill tnum'+(left<=0?' done':'')+'" data-id="'+x.id+'"><i></i>'+HV.esc(x.label)+' · '+(left<=0?'Done':HV.mmss(left))+'</button>';});
      t.innerHTML=h;
    }
    t.onclick=function(){location.href=HV.SCREENS.timer;};
    HV.on(drawTimers);setInterval(drawTimers,1000);
  };
})();
