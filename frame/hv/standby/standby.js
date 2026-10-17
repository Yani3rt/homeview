/* HomeView Standby: one full-screen face at a time, crossfaded.

   Faces: photo (full-screen photo, date bottom-left, time bottom-right), analog (with four complications), week (seven days: events, dinner, weather),
   weather (now, 7 days, hours), today (date, weather, next events, dinner), np (Now Playing, only while a
   speaker plays), up (Coming up with today's weather and dinner).
   tomorrow (evenings: tomorrow's weather, backpack, calendar and the next school days), kitty (the same for the
   kids: tomorrow's calendar and backpack, colorful, with a cat; no weather), kittyam (Kitty today, mornings: the same
   for today, with the Rain chip's heads-up said by the cat).
   Order: the Standby schedule (Settings > Standby faces, faces/sched.js): the block for this day and home
   time lists the faces, rotated in order, the first one leading when the block begins. A Photos turn plays
   RUN photos in a row. Photos stay up for Settings > Photo interval (hv-idle slide, 15/30/60 s, default 30),
   other faces for Face interval (hv-idle face, 15/30/60/120 s, default 30). Settings > Appearance (hv-idle shade, 0/30/60) lays that much black over the stage. Severe weather
   (while a Severe/Extreme alert is active) and Now Playing (every other slide while music plays) still
   interrupt whatever is scheduled.

   ?face=<name> pins one face (preview and tests), ?photo=<id> pins the photo, ?at=sat-17:30 pretends it is
   that day and home time for the schedule (preview and tests). A tap goes to Home (?back=faces: back to the schedule page).
   Only two slides exist in the DOM at once (old fades out, new fades in) to keep the 1 GB frame's
   WebView small. */
window.HVStandby={
  shuffle:function(a,rnd){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(rnd()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;},
  /* st = {deck:[ids], last:id}. Random order, every photo once before any repeats, never the same photo
     twice in a row; photos removed from the library drop out of the deck. Returns the next id. */
  next:function(st,ids,rnd){
    var have={};ids.forEach(function(id){have[id]=1;});
    st.deck=(st.deck||[]).filter(function(id){return have[id];});
    if(!st.deck.length){st.deck=HVStandby.shuffle(ids,rnd);
      if(st.deck.length>1&&st.deck[st.deck.length-1]===st.last)st.deck.unshift(st.deck.pop());}
    st.last=st.deck.pop();return st.last;
  }
};
(function(){
  var Q=new URLSearchParams(location.search), PIN=Q.get('face'), PIN_PHOTO=Q.get('photo');
  var NIGHT='/frame/hv/night/'+(Q.get('back')==='faces'?'?back=faces':'');   // the Night clock is its own page
  if(PIN==='night'){location.replace(NIGHT);return;}
  var stage=document.getElementById('stage');
  var IDLE={slide:30,face:30,shade:0},RUN=3;   // Settings > When untouched (settings/settings.js)
  try{var iv=JSON.parse(localStorage.getItem('hv-idle')||'null')||{};
    if([15,30,60].indexOf(+iv.slide)>=0)IDLE.slide=+iv.slide;if([15,30,60,120].indexOf(+iv.face)>=0)IDLE.face=+iv.face;if([0,30,60].indexOf(+iv.shade)>=0)IDLE.shade=+iv.shade;}catch(e){}
  var data={frame:null,photos:[],music:null,plan:null,alerts:[]};
  var seenSevere={};   // severe alert ids already shown: a new one jumps the queue once
  var faceIx=0, slideN=0, cur=null, timer=null, order={deck:[],last:null};
  var W=Math.min(1920,Math.round(innerWidth*(devicePixelRatio||1)));

  function load(){
    return Promise.all([
      HVJson('/api/frame').then(function(d){data.frame=d;},function(){}),
      HVJson('/api/frame/photos').then(function(d){data.photos=(d.photos||[]).filter(function(p){return p.kind!=='video';});},function(){}),
      HV.cfg.sonos?HVJson('/api/frame/music').then(function(d){data.music=d;},function(){}):null,
      HVJson('/api/meals/plan').then(function(d){data.plan=d;},function(){}),
      HV.cfg.ha_alerts?HVJson('/api/ha/alerts').then(function(d){data.alerts=(d&&d.alerts)||[];},function(){}):null,
      HVJson('/api/meals/shopping').then(function(d){if(d&&d.ok!==false)data.shop=d;},function(){}),   // the today board
      HV.cfg.ha?HVJson('/api/ha/state').then(function(d){if(d&&d.ok!==false)data.ha=d;},function(){}):null,
      HVJson('/api/storms').then(function(d){if(d&&d.ok!==false)data.storms=d;},function(){})
    ]);
  }
  function playing(){
    var rooms=(data.music&&data.music.rooms)||[];
    for(var i=0;i<rooms.length;i++){var r=rooms[i];   // TV sound on the Arc and line-in are not "now playing"
      if(r.ok&&r.state==='PLAYING'&&r.title&&r.kind!=='tv'&&r.source!=='TV audio'&&r.source!=='Line-in')return r;}
    return null;
  }

  function severe(){return (data.alerts||[]).filter(function(a){return /Extreme|Severe/.test(a.severity);});}
  function newSevere(){var s=severe();for(var i=0;i<s.length;i++)if(!seenSevere[s[i].id||s[i].event])return true;return false;}

  /* ---------- schedule ---------- */
  /* ?at=sat-17:30 (or 6-17:30): the day and time the schedule looks at, instead of now */
  var AT=(function(v){var m=/^([a-z]{3}|[0-6])-(\d{1,2}):(\d\d)$/i.exec(v||'');if(!m)return null;
    var d=/^\d$/.test(m[1])?+m[1]:['sun','mon','tue','wed','thu','fri','sat'].indexOf(m[1].toLowerCase());
    return d<0?null:{dow:d,min:(+m[2])*60+(+m[3])};})(Q.get('at'));
  var blockKey=null, runLeft=0;
  function scheduled(){
    var t=HV.local(),on=HV.facesOn(),s=HVSched.load(on),now=AT||{dow:t.dow,min:t.h*60+t.mi},a=HVSched.at(s,now.dow,now.min);
    if(a.key!==blockKey){blockKey=a.key;faceIx=0;runLeft=0;}   // a new block begins with its first face
    if(a.block.faces.indexOf('night')>=0&&Q.get('thumb')!=='1'){location.replace(NIGHT);return 'photo';}   // a night block
    var faces=a.block.faces.filter(function(f){return f==='photos'||FACES[f];});
    if(!faces.length)return 'photo';
    if(runLeft>0){runLeft--;return 'photo';}   // the rest of a Photos turn
    var f=faces[(faceIx++)%faces.length];
    if(f==='photos'&&faces.length>1&&data.photos.length>1)runLeft=RUN-1;
    return f==='photos'?'photo':f;
  }
  function nextFace(){
    if(PIN)return PIN;
    var n=slideN++, np=playing();
    // Severe weather: only while a Severe/Extreme alert is active; a new one shows at once, then every other slide
    if(HV.facesOn().alert&&severe().length&&(newSevere()||n%2===0))return 'alert';
    if(np&&n%2===1)return 'np';
    return scheduled();
  }
  function nextPhoto(){
    var ps=data.photos;if(!ps.length)return null;
    if(PIN_PHOTO){for(var i=0;i<ps.length;i++)if(ps[i].id.indexOf(PIN_PHOTO)===0)return ps[i];}
    // each frame shuffles on its own, so two frames side by side don't mirror each other
    var byId={};ps.forEach(function(p){byId[p.id]=p;});
    return byId[HVStandby.next(order,ps.map(function(p){return p.id;}),Math.random)];
  }

  /* ---------- faces ---------- */
  function el(cls,html){var d=document.createElement('div');d.className='slide '+cls;if(html)d.innerHTML=html;return d;}
  function timeText(){return HV.hm();}
  function dateLine(){
    var t=HV.local(),wx=data.frame&&data.frame.weather,s=HV.DAYS[t.dow]+', '+HV.MONTHS[t.mo-1]+' '+t.d;
    if(wx&&wx.temp_f!=null)s+='<span class="dot">·</span>'+Math.round(wx.temp_f)+'° '+kind(wx.code,wx.is_day);
    return s;
  }
  function kind(code,isDay){
    if(code==null)return '';
    if(code===0)return 'Clear';if(code===1)return 'Mostly clear';if(code===2)return 'Partly cloudy';if(code===3)return 'Cloudy';
    if(code===45||code===48)return 'Fog';if(code>=51&&code<=57)return 'Drizzle';if(code>=61&&code<=67)return 'Rain';
    if(code>=71&&code<=77)return 'Snow';if(code>=80&&code<=82)return 'Showers';if(code===85||code===86)return 'Snow showers';
    if(code>=95)return 'Thunderstorms';return 'Forecast';
  }
  /* object-position that keeps the subject's focus point about 45% down the screen (cover crop) */
  function position(p,c){
    var sw=innerWidth,sh=innerHeight,iw=p.w||1600,ih=p.h||1200,s=Math.max(sw/iw,sh/ih);
    var rx=sw/(iw*s),ry=sh/(ih*s),fx=c&&c.box?(c.box[0]+c.box[2])/2:.5,fy=c?c.focus_y:.4;
    var px=rx<1?Math.max(0,Math.min(1,(fx-.5*rx)/(1-rx))):.5, py=ry<1?Math.max(0,Math.min(1,(fy-.45*ry)/(1-ry))):.5;
    return Math.round(px*100)+'% '+Math.round(py*100)+'%';
  }
  function photoFace(){
    var p=nextPhoto();if(!p)return analogFace();
    var pos=position(p,null), src=p.url+(p.url.indexOf('?')<0?'?':'&')+'w='+W;
    var d=el('photo');
    d.innerHTML='<img alt="" style="object-position:'+pos+'" src="'+src+'"><div class="shade-b"></div><div class="foot">'+dateLine()+'</div><div class="ctime">'+timeText()+'</div>';
    d.tick=function(){d.querySelector('.ctime').textContent=timeText();};
    return d;
  }
  /* ---------- shared bits for the information faces ---------- */
  function dayKeyOf(t){return t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d);}
  function addDays(n){return HV.local(new Date(HV.now().getTime()+n*864e5));}
  function dinnerOn(key){var m=data.plan&&data.plan.days&&data.plan.days[key];return m&&m.name?m.name:null;}
  function eventsOn(key){
    return ((data.frame&&data.frame.calendar_events)||[]).filter(function(e){
      var s=HV.local(new Date(e.start)),en=HV.local(new Date(new Date(e.end||e.start).getTime()-1));
      return dayKeyOf(s)<=key&&key<=dayKeyOf(en);
    }).sort(function(a,b){return (a.all_day?0:1)-(b.all_day?0:1)||new Date(a.start)-new Date(b.start);});
  }
  function upcoming(n){
    var now=HV.now(),end=now.getTime()+14*864e5;
    return ((data.frame&&data.frame.calendar_events)||[]).filter(function(e){var s=new Date(e.start).getTime(),en=new Date(e.end||e.start).getTime();return en>now.getTime()&&s<end;})
      .sort(function(a,b){return new Date(a.start)-new Date(b.start);}).slice(0,n);
  }
  function whenLabel(e){
    if(e.all_day)return 'All day';var s=new Date(e.start);return HV.hm(s)+' '+HV.ampm(s);
  }
  function dayLabel(t){
    var k=dayKeyOf(t);if(k===dayKeyOf(HV.local()))return 'Today';if(k===dayKeyOf(addDays(1)))return 'Tomorrow';
    return HV.DAYS[t.dow]+', '+HV.MONTHS[t.mo-1]+' '+t.d;
  }
  function dayWx(key){var ds=(data.frame&&data.frame.weather&&data.frame.weather.days)||[];for(var i=0;i<ds.length;i++)if(ds[i].date===key)return ds[i];return null;}
  var IC={warn:'<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
    sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon:'<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    cloud:'<path d="M7 18.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
    partly:'<path d="M8.5 3.5v1.6M3.5 8.5h1.6M5 5l1.1 1.1M12 5l-1.1 1.1"/><path d="M6.4 11.2a3.2 3.2 0 0 1 5.4-3.1"/><path d="M8.5 20h9a3.6 3.6 0 0 0 .3-7.2 5.2 5.2 0 0 0-10 1.4A2.9 2.9 0 0 0 8.5 20z"/>',
    rain:'<path d="M7 15h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 15z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
    snow:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14.5z"/><path d="M8 18.5h.01M12 20h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01"/>',
    storm:'<path d="M7 14.5h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14.5z"/><path d="M12.5 16l-2 3.5h3l-2 3"/>',
    fog:'<path d="M4 9h16M3 13h18M5 17h14"/>',
    fork:'<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-1.7 1.2-2.5 3.5-2.5 6.5V13H16v8"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sunset:'<path d="M3 17h18M7 21h10M12 4v6M8.5 7.5L12 4l3.5 3.5M5.6 13.4a6.5 6.5 0 0 1 12.8 0"/>',
    drop:'<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>'
  };
  function icon(name,cls){return '<svg class="ic '+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(IC[name]||IC.cloud)+'</svg>';}
  function wxIcon(code,isDay){
    if(code==null)return 'cloud';if(code<=1)return isDay===false||isDay===0?'moon':'sun';if(code===2)return 'partly';if(code===3)return 'cloud';
    if(code===45||code===48)return 'fog';if((code>=71&&code<=77)||code===85||code===86)return 'snow';if(code>=95)return 'storm';return 'rain';
  }
  function hilo(wx){return 'H '+Math.round(Math.max(wx.hi_f,wx.temp_f))+'°  L '+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°';}
  function hm24(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return ((h%12)||12)+':'+m+' '+(h<12?'AM':'PM');}
  function cmpl(ic,label,value){
    return '<div class="cmp">'+icon(ic)+'<div><span>'+HV.esc(label)+'</span><b>'+HV.esc(value)+'</b></div></div>';
  }

  /* ---------- analog: the clock plus four complications ---------- */
  function analogFace(){
    var d=el('f-analog'), h='<svg class="dial" viewBox="0 0 200 200" aria-label="Clock"><circle cx="100" cy="100" r="97" fill="#f8f5ef"/>';
    for(var i=0;i<60;i++){var a=i*Math.PI/30,L=i%5?5:11,w=i%5?1:2.6,r=93;
      h+='<line x1="'+(100+Math.sin(a)*(r-L)).toFixed(2)+'" y1="'+(100-Math.cos(a)*(r-L)).toFixed(2)+'" x2="'+(100+Math.sin(a)*r).toFixed(2)+'" y2="'+(100-Math.cos(a)*r).toFixed(2)+'" stroke="'+(i%5?'#b8b0a3':'#3a3a3c')+'" stroke-width="'+w+'" stroke-linecap="round"/>';}
    for(var q=1;q<=12;q++){var b=q*Math.PI/6;h+='<text x="'+(100+Math.sin(b)*70).toFixed(1)+'" y="'+(100-Math.cos(b)*70+7).toFixed(1)+'" text-anchor="middle" font-size="19" font-weight="600" fill="#3a3a3c" font-family="HV SF Rounded, sans-serif">'+q+'</text>';}
    h+='<line class="hh" x1="100" y1="104" x2="100" y2="54" stroke="#1d1d1f" stroke-width="6.5" stroke-linecap="round"/>'+
       '<line class="mh" x1="100" y1="106" x2="100" y2="26" stroke="#1d1d1f" stroke-width="4.5" stroke-linecap="round"/>'+
       '<line class="sh" x1="100" y1="116" x2="100" y2="20" stroke="#ff9f0a" stroke-width="1.6" stroke-linecap="round"/>'+
       '<circle cx="100" cy="100" r="3.6" fill="#ff9f0a"/></svg>';
    var t=HV.local(),wx=data.frame&&data.frame.weather,nx=upcoming(1)[0],din=dinnerOn(dayKeyOf(t));
    var left=cmpl('cal',HV.DAYS[t.dow],HV.MONTHS[t.mo-1]+' '+t.d)+
      (wx&&wx.temp_f!=null?cmpl(wxIcon(wx.code,wx.is_day),kind(wx.code,wx.is_day)+' · '+hilo(wx),Math.round(wx.temp_f)+'°'):'');
    var right=(nx?cmpl('cal',dayLabel(HV.local(new Date(nx.start)))+' · '+whenLabel(nx),nx.title):cmpl('cal','Calendar','Nothing in the next two weeks'))+
      cmpl('fork','Dinner tonight',din||'Not planned yet');
    d.innerHTML='<div class="side l">'+left+'</div>'+h+'<div class="side r">'+right+'</div>';
    d.tick=function(){var t2=HV.local(),hr=t2.h%12,mi=t2.mi,s=t2.s;
      d.querySelector('.hh').setAttribute('transform','rotate('+(hr*30+mi/2)+' 100 100)');
      d.querySelector('.mh').setAttribute('transform','rotate('+(mi*6+s/10)+' 100 100)');
      d.querySelector('.sh').setAttribute('transform','rotate('+(s*6)+' 100 100)');};
    d.tick();d.fast=true;return d;
  }

  /* ---------- week ahead (replaces the month face): what is actually happening each day ---------- */
  function weekFace(){
    var cols='',big=innerHeight>=900,maxEv=big?4:3;
    for(var i=0;i<7;i++){
      var t=addDays(i),key=dayKeyOf(t),ev=eventsOn(key),din=dinnerOn(key),w=dayWx(key);
      var evh='';ev.slice(0,maxEv).forEach(function(e){
        evh+='<div class="ev"><i style="background:'+HV.calColor(e.cal)+'"></i><div><b>'+HV.esc(e.title)+'</b><span>'+(e.all_day?'All day':HV.hm(new Date(e.start))+' '+HV.ampm(new Date(e.start)))+'</span></div></div>';});
      if(ev.length>maxEv)evh+='<div class="more">+'+(ev.length-maxEv)+' more</div>';
      if(!ev.length)evh='<div class="free">Free</div>';
      cols+='<div class="day'+(i===0?' today':'')+'"><div class="dh"><span>'+(i===0?'Today':HV.DAYS[t.dow].slice(0,3))+'</span><b>'+t.d+'</b></div>'+
        (w?'<div class="dw">'+icon(wxIcon(w.code,1))+'<span>'+Math.round(w.hi_f)+'° / '+Math.round(w.lo_f)+'°</span></div>':'')+
        '<div class="dn'+(din?'':' none')+'">'+icon('fork')+'<span>'+(din?HV.esc(din):'No dinner yet')+'</span></div>'+
        '<div class="evs">'+evh+'</div></div>';
    }
    // the summary row: what a person planning the week wants to know at a glance
    var planned=0,missing=[],wet=[],busiest=null,most=0,total=0;
    for(var j=0;j<7;j++){var tj=addDays(j),kj=dayKeyOf(tj),nm=j===0?'Today':HV.DAYS[tj.dow].slice(0,3),ne=eventsOn(kj).length,wj=dayWx(kj);
      if(dinnerOn(kj))planned++;else missing.push(nm);
      if(wj&&wj.precip_pct>=50)wet.push(nm+' '+wj.precip_pct+'%');
      total+=ne;if(ne>most){most=ne;busiest=nm;}}
    var sum='<div class="wsum">'+
      '<div class="hv-card">'+icon('fork','big')+'<div><b>'+planned+' of 7 dinners planned</b><span>'+(missing.length?'Open: '+missing.join(', '):'Every night is covered')+'</span></div></div>'+
      '<div class="hv-card">'+icon(wet.length?'rain':'sun','big')+'<div><b>'+(wet.length?'Rain likely '+wet.length+' day'+(wet.length>1?'s':''):'No rain expected')+'</b><span>'+(wet.length?wet.join(' · '):'Under 50% every day')+'</span></div></div>'+
      '<div class="hv-card">'+icon('cal','big')+'<div><b>'+total+' event'+(total===1?'':'s')+' this week</b><span>'+(busiest?'Busiest: '+busiest+' ('+most+')':'Nothing on the calendars')+'</span></div></div></div>';
    return el('f-week','<div class="wh"><h2>This week</h2><span>'+HV.MONTHS[HV.local().mo-1]+' '+HV.local().y+'</span></div><div class="cols">'+cols+'</div>'+sum);
  }

  /* ---------- weather: now on the left, the week on the right, hours along the bottom ---------- */
  function weatherFace(){
    var wx=data.frame&&data.frame.weather;if(!wx||wx.temp_f==null)return todayFace();
    var wet=wx.code>=51,cls=!wx.is_day?' night'+(wet?' rain':''):(wx.code>=95?' storm':wet?' rain':wx.code>=3?' cloud':'');
    var hrs='',hs=wx.hours24||wx.hourly||[];
    for(var i=1;i<hs.length&&i<=12;i+=2){var x=hs[i];hrs+='<div>'+hm24(x.t).replace(':00','')+icon(wxIcon(x.code,x.is_day))+'<b>'+Math.round(x.temp_f)+'°</b>'+(x.precip_pct>=30?'<em>'+x.precip_pct+'%</em>':'')+'</div>';}
    var ds=(wx.days||[]).slice(0,7),lo=99,hi=-99;ds.forEach(function(x){lo=Math.min(lo,x.lo_f);hi=Math.max(hi,x.hi_f);});
    var rows='';ds.forEach(function(x,j){var t=HV.local(new Date(x.date+'T12:00:00Z')),a=(x.lo_f-lo)/Math.max(1,hi-lo)*100,b=(x.hi_f-lo)/Math.max(1,hi-lo)*100;
      rows+='<div class="dr"><span class="dn">'+(j===0?'Today':HV.DAYS[t.dow].slice(0,3))+'</span>'+icon(wxIcon(x.code,1))+'<span class="pp">'+(x.precip_pct>=30?x.precip_pct+'%':'')+'</span><span class="lo">'+Math.round(x.lo_f)+'°</span><span class="bar"><i style="left:'+a.toFixed(0)+'%;width:'+Math.max(4,b-a).toFixed(0)+'%"></i></span><span class="hi">'+Math.round(x.hi_f)+'°</span></div>';});
    return el('f-wx'+cls,'<div class="now"><div class="place">'+HV.esc(HV.cfg.place||'Home')+'</div><div class="t">'+Math.round(wx.temp_f)+'°</div><div class="cond">'+kind(wx.code,wx.is_day)+'</div>'+
      '<div class="meta">'+hilo(wx)+'<br>Feels like '+Math.round(wx.feels_f!=null?wx.feels_f:wx.temp_f)+'° · Wind '+Math.round(wx.wind_mph||0)+' '+(HV.cfg.wind_unit==='kmh'?'km/h':HV.cfg.wind_unit||'mph')+
      (wx.sunset?'<br>Sunset '+hm24(wx.sunset):'')+'</div></div>'+
      (rows?'<div class="days"><h3>Next 7 days</h3>'+rows+'</div>':'')+(hrs?'<div class="hours">'+hrs+'</div>':''));
  }

  /* ---------- today (replaces the bare big date) ---------- */
  function todayFace(){
    var t=HV.local(),key=dayKeyOf(t),wx=data.frame&&data.frame.weather,din=dinnerOn(key),up=upcoming(3),timers=(HV.state.timers||[]).length;
    var ev='';up.forEach(function(e){var s=HV.local(new Date(e.start));
      ev+='<div class="hv-row"><i style="background:'+HV.calColor(e.cal)+'"></i><span class="t">'+HV.esc(e.title)+'</span><span class="v">'+(dayKeyOf(s)===key?'':HV.dayWord(new Date(e.start))+' ')+whenLabel(e)+'</span></div>';});
    var tomorrow=dayWx(dayKeyOf(addDays(1)));
    return el('f-today','<div class="l"><div class="d">'+HV.DAYS[t.dow].toUpperCase()+'</div><div class="n">'+t.d+'</div><div class="m">'+HV.MONTHS[t.mo-1]+' '+t.y+'</div></div>'+
      '<div class="r">'+
        (wx&&wx.temp_f!=null?'<div class="hv-card dark wx">'+icon(wxIcon(wx.code,wx.is_day),'big')+'<div><b>'+Math.round(wx.temp_f)+'° '+kind(wx.code,wx.is_day)+'</b><span>'+hilo(wx)+(wx.precip_pct>=30?' · '+wx.precip_pct+'% rain':'')+
          (tomorrow?' · Tomorrow '+Math.round(tomorrow.hi_f)+'°':'')+'</span></div></div>':'')+
        '<div class="hv-card dark"><h3>Coming up</h3>'+(ev||'<div class="hv-empty">Nothing on the calendars for two weeks</div>')+'</div>'+
        '<div class="hv-card dark din">'+icon('fork','big')+'<div><span>Dinner tonight</span><b>'+(din?HV.esc(din):'Not planned yet')+'</b></div>'+(timers?'<em>'+timers+' timer'+(timers>1?'s':'')+' running</em>':'')+'</div>'+
      '</div>');
  }

  /* ---------- coming up: the list, with today's weather and dinner beside it ---------- */
  function upFace(){
    var n=innerHeight>=900?6:5,items=upcoming(n),h='',lastDay='',wx=data.frame&&data.frame.weather,t=HV.local(),din=dinnerOn(dayKeyOf(t));
    items.forEach(function(e){var s=HV.local(new Date(e.start)),k=dayKeyOf(s);
      if(k!==lastDay){h+='<div class="day">'+dayLabel(s)+'</div>';lastDay=k;}
      h+='<div class="ev"><i style="background:'+HV.calColor(e.cal)+'"></i><span class="tt">'+HV.esc(e.title)+'</span><span class="when">'+whenLabel(e)+'</span></div>';});
    if(!h)h='<div class="empty">Nothing on the calendars for the next two weeks.</div>';
    var side='<div class="sum">'+
      (wx&&wx.temp_f!=null?'<div class="si">'+icon(wxIcon(wx.code,wx.is_day))+'<div><b>'+Math.round(wx.temp_f)+'° '+kind(wx.code,wx.is_day)+'</b><span>'+hilo(wx)+'</span></div></div>':'')+
      '<div class="si">'+icon('fork')+'<div><b>'+(din?HV.esc(din):'No dinner planned')+'</b><span>Dinner tonight</span></div></div>'+
      (wx&&wx.sunset?'<div class="si">'+icon('sunset')+'<div><b>'+hm24(wx.sunset)+'</b><span>Sunset</span></div></div>':'')+'</div>';
    return el('f-up','<div class="l"><h2>Coming up</h2><div class="sub">Next two weeks</div>'+side+'</div><div class="list">'+h+'</div>');
  }

  /* ---------- faces from Apple's HomeView face gallery ---------- */
  function hands(cx,cy,rh,rm,col,w1,w2,sec){
    return '<line class="hh" x1="'+cx+'" y1="'+cy+'" x2="'+cx+'" y2="'+(cy-rh)+'" stroke="'+col+'" stroke-width="'+w1+'" stroke-linecap="round"/>'+
      '<line class="mh" x1="'+cx+'" y1="'+cy+'" x2="'+cx+'" y2="'+(cy-rm)+'" stroke="'+col+'" stroke-width="'+w2+'" stroke-linecap="round"/>'+
      (sec?'<line class="sh" x1="'+cx+'" y1="'+(cy+rm*0.18)+'" x2="'+cx+'" y2="'+(cy-rm*1.02)+'" stroke="'+sec+'" stroke-width="'+Math.max(1,w2*0.32)+'" stroke-linecap="round"/>':'')+
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+(w1*0.75)+'" fill="'+(sec||col)+'"/>';
  }
  function tickHands(d,cx,cy){
    var t2=HV.local(),q=function(s){return d.querySelector(s);};
    if(q('.hh'))q('.hh').setAttribute('transform','rotate('+((t2.h%12)*30+t2.mi/2)+' '+cx+' '+cy+')');
    if(q('.mh'))q('.mh').setAttribute('transform','rotate('+(t2.mi*6+t2.s/10)+' '+cx+' '+cy+')');
    if(q('.sh'))q('.sh').setAttribute('transform','rotate('+(t2.s*6)+' '+cx+' '+cy+')');
  }
  /* Info: Apple's "Tue Oct 13" face. Date, clock, today's agenda, weather on one light screen. */
  function infoFace(){
    var t=HV.local(),key=dayKeyOf(t),wx=data.frame&&data.frame.weather,ev=eventsOn(key),now=HV.now();
    var allday=ev.filter(function(e){return e.all_day;}),timed=ev.filter(function(e){return !e.all_day&&new Date(e.end||e.start)>now;});
    var show=timed.slice(0,2),more=timed.length-show.length,ag='';
    if(allday.length)ag+='<div class="ia">'+icon('cal')+'<b>'+allday.length+' all-day</b></div>';
    show.forEach(function(e){var s=new Date(e.start),en=new Date(e.end||e.start);
      ag+='<div class="ie" style="border-color:'+HV.calColor(e.cal)+'"><b>'+HV.hm(s)+'–'+HV.hm(en)+' '+HV.ampm(en)+'</b><span>'+HV.esc(e.title)+'</span></div>';});
    if(more>0)ag+='<div class="im">'+more+' more event'+(more>1?'s':'')+'</div>';
    if(!timed.length){                       // nothing left today: the next three, with their days
      var nx=upcoming(3).filter(function(e){return dayKeyOf(HV.local(new Date(e.start)))!==key;});
      if(!allday.length)ag+='<div class="im">Nothing else today</div>';
      nx.forEach(function(e){var s2=new Date(e.start),dl=HV.dayWord(s2);
        ag+='<div class="ie" style="border-color:'+HV.calColor(e.cal)+'"><b>'+dl+(e.all_day?'':' · '+HV.hm(s2)+' '+HV.ampm(s2))+'</b><span>'+HV.esc(e.title)+'</span></div>';});
    }
    var clock='<svg class="ic-clock" viewBox="0 0 200 200">';
    for(var i=0;i<60;i++){var a=i*Math.PI/30,L=i%5?4:9;clock+='<line x1="'+(100+Math.sin(a)*(92-L)).toFixed(1)+'" y1="'+(100-Math.cos(a)*(92-L)).toFixed(1)+'" x2="'+(100+Math.sin(a)*92).toFixed(1)+'" y2="'+(100-Math.cos(a)*92).toFixed(1)+'" stroke="'+(i%5?'#7d8794':'#1d1d1f')+'" stroke-width="'+(i%5?1.2:2.4)+'" stroke-linecap="round"/>';}
    for(var q=1;q<=12;q++){var b=q*Math.PI/6;clock+='<text x="'+(100+Math.sin(b)*70).toFixed(1)+'" y="'+(100-Math.cos(b)*70+7).toFixed(1)+'" text-anchor="middle" font-size="20" font-weight="600" fill="#1d1d1f" font-family="HV SF Rounded, sans-serif">'+q+'</text>';}
    clock+=hands(100,100,48,74,'#1d1d1f',6,4,'#ff9f0a')+'</svg>';
    var d=el('f-info','<div class="il"><div class="idt">'+HV.DAYS[t.dow].slice(0,3)+' '+HV.MONTHS[t.mo-1].slice(0,3)+'</div><div class="inum">'+t.d+'</div><div class="iag">'+ag+'</div></div>'+
      '<div class="ir">'+clock+(wx&&wx.temp_f!=null?'<div class="iw"><div class="iloc">'+HV.esc(HV.cfg.place||'Home')+'</div><div class="it">'+Math.round(wx.temp_f)+'°</div><div class="ic2">'+icon(wxIcon(wx.code,wx.is_day))+'<span>'+kind(wx.code,wx.is_day)+'<br>H:'+Math.round(Math.max(wx.hi_f,wx.temp_f))+'° L:'+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°</span></div></div>':'')+'</div>');
    d.tick=function(){tickHands(d,100,100);};d.tick();d.fast=true;return d;
  }
  /* Numerals: giant 12 / 3 / 6 / 9 with white hands over them, on a color (Apple's green face). */
  function numeralsFace(){
    var t=HV.local(),pal=[['#3f9a5c','#0f2a17'],['#e86a3a','#3a1408'],['#4a6fd8','#0e1a44'],['#d9b23a','#3a2c06']],p=pal[t.dow%pal.length];
    var s='<svg class="nm" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">'+
      '<g font-family="HV SF Rounded, sans-serif" font-weight="500" fill="'+p[1]+'" text-anchor="middle">'+
      '<text x="100" y="62" font-size="58">12</text><text x="166" y="120" font-size="58">3</text><text x="100" y="180" font-size="58">6</text><text x="34" y="120" font-size="58">9</text></g>'+
      hands(100,100,46,76,'#fff',5,3.4,null)+'</svg>';
    var d=el('f-num',s+'<div class="nd">'+HV.DAYS[t.dow].slice(0,3).toUpperCase()+' '+t.d+'</div>');
    d.style.background=p[0];d.tick=function(){tickHands(d,100,100);};d.tick();d.fast=true;return d;
  }
  /* Month: the grid with a huge red date behind it (Apple's calendar face). */
  function monthFace(){
    var t=HV.local(),first=new Date(t.y,t.mo-1,1).getDay(),days=new Date(t.y,t.mo,0).getDate(),ev={};
    ((data.frame&&data.frame.calendar_events)||[]).forEach(function(e){if(!HV.isHoliday(e.cal))ev[dayKeyOf(HV.local(new Date(e.start)))]=1;});
    var h='<div class="mh"><b>'+HV.MONTHS[t.mo-1]+' '+t.y+'</b><span class="mtime tnum">'+HV.hm()+'</span></div><div class="mbig">'+t.d+'</div><table><tr>';
    'SMTWTFS'.split('').forEach(function(x){h+='<th>'+x+'</th>';});h+='</tr><tr>';
    for(var i=0;i<first;i++)h+='<td></td>';
    for(var dd=1;dd<=days;dd++){var dow=(first+dd-1)%7,k=t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(dd);
      h+='<td class="'+(dd===t.d?'today':dd<t.d?'past':'')+'">'+(dd===t.d?'<span>'+dd+'</span>':dd)+(ev[k]&&dd>=t.d?'<i></i>':'')+'</td>';if(dow===6&&dd<days)h+='</tr><tr>';}
    var d=el('f-month',h+'</tr></table>');
    d.tick=function(){var m=d.querySelector('.mtime');if(m)m.textContent=HV.hm();};return d;
  }
  /* Minimal: soft pink, embossed numerals at the quarter marks, slim hands (Apple's rose face). */
  function minimalFace(){
    var s='<svg class="mn" viewBox="0 0 200 200"><g font-family="HV SF Rounded, sans-serif" font-weight="300" fill="rgba(122,52,72,.22)" text-anchor="middle" font-size="26">'+
      '<text x="100" y="34">12</text><text x="174" y="109">3</text><text x="100" y="186">6</text><text x="26" y="109">9</text></g>'+
      hands(100,100,44,70,'#8a3a52',3.4,2.4,'#c9607e')+'</svg>';
    var d=el('f-min',s);d.tick=function(){tickHands(d,100,100);};d.tick();d.fast=true;return d;
  }

  var PLAY='<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>',PAUSE='<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
      NEXT='<svg viewBox="0 0 24 24"><path d="M4 4l11 8-11 8zM16 4h3v16h-3z"/></svg>';
  function npFace(){
    var r=playing();if(!r)return PIN==='np'?npSample():photoFace();
    return npBuild(r.title,r.artist,r.art,(r.group||[r.name]).join(' + '),r.id);
  }
  function npSample(){return npBuild('Nothing is playing','Start music on a speaker and it shows here','', 'Sonos','');}
  /* Now Playing, as on HomeView: the album art full screen, title and artist bottom-left. A tap opens Music. */
  function npBuild(title,artist,art,room,id){
    var d=el('f-np2','<div class="art"'+(art?' style="background-image:url(\''+HV.esc(art)+'\')"':'')+'></div><div class="shade"></div>'+
      '<div class="meta"><div class="room">'+HV.esc(room)+'</div><div class="song">'+HV.esc(title)+'</div><div class="artist">'+HV.esc(artist)+'</div></div>');
    d.addEventListener('click',function(e){e.stopPropagation();location.href='/frame/hv/music/';});
    return d;
  }
  /* ---------- severe weather (Home Assistant NWS alerts, Severe or Extreme only) ---------- */
  function alertFace(){
    var list=severe(),sample=false;
    if(!list.length){
      if(PIN!=='alert')return photoFace();
      sample=true;list=[{event:'Hurricane Warning',severity:'Extreme',areas:'Monroe Lower Keys',ends:new Date(HV.now().getTime()+18*36e5).toISOString(),
        headline:'Example: this face appears only while a Severe or Extreme alert is active',
        description:'* WHAT...Hurricane conditions expected.',instruction:'Follow the advice of local officials.'}];
    }
    list.forEach(function(a){seenSevere[a.id||a.event]=1;});
    var a=list[0],end=a.ends||a.expires,d=end?new Date(end):null;
    var until=d&&!isNaN(d)?'Until '+HV.dayWord(d)+' '+HV.hm(d)+' '+HV.ampm(d):'';
    var what=(String(a.description||'').match(/\*\s*WHAT\.\.\.([^*]+)/)||[])[1]||'';
    what=what.replace(/\s+/g,' ').trim();
    var more=list.length>1?'<div class="more">+ '+(list.length-1)+' more: '+list.slice(1).map(function(x){return HV.esc(x.event);}).join(', ')+'</div>':'';
    var f=el('f-alert'+(/Extreme/.test(a.severity)?' extreme':''),
      '<div class="top">'+icon('warn','big')+'<span>'+(sample?'Example \u00b7 ':'')+HV.esc(String(a.severity||'Severe').toUpperCase())+' WEATHER ALERT</span><b class="clk tnum">'+HV.hm()+'</b></div>'+
      '<div class="ev">'+HV.esc(a.event)+'</div>'+
      '<div class="meta">'+HV.esc(until)+(a.areas?(until?' \u00b7 ':'')+HV.esc(a.areas):'')+'</div>'+
      (what?'<div class="what">'+HV.esc(what)+'</div>':'')+
      (a.instruction?'<div class="do">'+HV.esc(a.instruction)+'</div>':'')+more);
    f.tick=function(){var c=f.querySelector('.clk');if(c)c.textContent=HV.hm();};
    return f;
  }
  /* ---------- tomorrow (evenings): tomorrow's weather, what goes in the backpack, what's on, and the next
     school days. The backpack comes from calendar titles (config.json "backpack", or the list below). ---------- */
  var PACK_ICONS=HV.PACK_ICONS,PACK_COLOR=HV.PACK_COLOR;   // the backpack rules live in hv.js (the launcher's week strip uses them too)
  function pack(){return HV.packRules();}
  /* a day's calendar entries split into backpack items and everything else (all-day or timed: her class schedule
     has timed entries like "Physical Education" 8-9 AM) */
  function packFor(key){
    var items=[],other=[],seen={},off=false,hol=[],rs=pack();
    eventsOn(key).forEach(function(e){
      if(HV.isHoliday(e.cal)){hol.push(e);return;}
      var hit=null;for(var i=0;i<rs.length;i++)if(rs[i].re.test(e.title)){hit=rs[i];break;}
      if(hit&&hit.off)off=true;
      if(hit){if(!seen[hit.item]){seen[hit.item]=1;items.push({r:hit,e:e});}}
      else other.push(e);});
    return {items:items,other:other,off:off,hol:hol};
  }
  function tint(h){var n=parseInt(h.slice(1),16);return 'rgba('+(n>>16)+','+(n>>8&255)+','+(n&255)+',.18)';}
  /* the rule's note, else the calendar title when it says more than the item ("Carrito de Snacks" under Snack money, not "Music" under Music class) */
  function packNote(x){if(x.r.note)return x.r.note;var t=x.e.title.replace(/[.!\s]+$/,'');
    return x.r.item.toLowerCase().indexOf(t.toLowerCase())>=0?'':t;}
  function packIcon(name,cls){return '<svg class="'+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+PACK_ICONS[name]+'</svg>';}
  function tomorrowFace(){
    var t1=addDays(1),key=dayKeyOf(t1),w=dayWx(key),P=packFor(key),din=dinnerOn(key);
    var school=t1.dow>0&&t1.dow<6&&!P.off;
    /* the weather to get dressed for: the day, and 8 AM */
    var wxh='',hint='';
    if(w){var am=null;(w.hours||[]).forEach(function(x){if(+x.t.slice(11,13)===8)am=x;});
      wxh='<div class="tw">'+icon(wxIcon(w.code,1),'twi')+'<div><b class="tnum">'+Math.round(w.hi_f)+'°<span>'+Math.round(w.lo_f)+'°</span></b>'+
        '<div>'+kind(w.code,1)+(w.precip_pct>=20?' · '+Math.round(w.precip_pct)+'% rain':'')+(am?' · '+Math.round(am.temp_f)+'° at 8 AM':'')+'</div></div></div>';
      hint=w.precip_pct>=50?['drop','Rain likely: pack an umbrella']:w.precip_pct>=35?['drop','Maybe rain: an umbrella just in case']:
        w.hi_f>=85?['sun','Hot one: water bottle and sunscreen']:w.lo_f<55?['cloud','Chilly morning: grab a jacket']:null;}
    var tags='';P.hol.forEach(function(e){tags+='<span class="tt-hol">'+HV.esc(e.title)+'</span>';});
    /* the label, the day, the date (the clock is a chip top right, where the other screens keep theirs) */
    var left='<div class="tl"><div class="tk">Tomorrow</div><div class="td'+(HV.DAYS[t1.dow].length>8?' long':'')+'">'+HV.DAYS[t1.dow]+'</div>'+
      '<div class="tm"><span>'+HV.MONTHS[t1.mo-1]+' '+t1.d+'</span>'+tags+'</div>'+
      wxh+(hint?'<div class="th">'+icon(hint[0])+HV.esc(hint[1])+'</div>':'')+'</div>';
    /* the backpack (school days only), then the calendar and dinner */
    var right='<div class="tr">';
    if(school){right+='<section class="ts"><h3>Backpack</h3>';
      if(P.items.length){right+='<div class="tp">';P.items.slice(0,4).forEach(function(x){var c=PACK_COLOR[x.r.icon];
        right+='<div class="ti"><i style="color:'+c+';background:'+tint(c)+'">'+packIcon(x.r.icon)+'</i><div><b>'+HV.esc(x.r.item)+'</b><span>'+HV.esc(packNote(x))+'</span></div></div>';});
        right+='</div>';}
      else right+='<div class="tnone">Nothing extra, just the usual</div>';
      right+='</section>';}
    else if(P.off)right+='<section class="ts off">'+packIcon('home','big')+'<div><b>No school tomorrow</b><span>'+HV.esc((P.items[0]&&P.items[0].e.title)||'')+'</span></div></section>';
    right+='<section class="ts"><h3>On the calendar</h3>';
    P.other.slice(0,school?3:5).forEach(function(e){right+='<div class="te"><u style="background:'+HV.calColor(e.cal)+'"></u><b>'+HV.esc(e.title)+'</b><em>'+whenLabel(e)+'</em></div>';});
    if(!P.other.length)right+='<div class="te none"><u></u><b>Nothing scheduled</b></div>';
    right+='<div class="te din">'+icon('fork')+'<b>'+(din?HV.esc(din):'No dinner planned yet')+'</b>'+(din?'<em class="mu">Dinner</em>':'')+'</div></section></div>';
    /* the next five school days after tomorrow */
    var strip='<div class="tw5"><h3>Next school days</h3><div class="tw5r">',n=0,i=2;
    while(n<5&&i<16){var t=addDays(i++);if(t.dow===0||t.dow===6)continue;n++;
      var p=packFor(dayKeyOf(t)),rows='';
      if(p.off)rows='<div>'+packIcon('home')+'No school</div>';
      else{p.items.slice(0,3).forEach(function(x){rows+='<div>'+packIcon(x.r.icon).replace('<svg ','<svg style="color:'+PACK_COLOR[x.r.icon]+'" ')+HV.esc(x.r.item)+'</div>';});
        if(p.items.length<3)p.other.slice(0,3-p.items.length).forEach(function(e){rows+='<div><u style="background:'+HV.calColor(e.cal)+'"></u>'+HV.esc(e.title)+'</div>';});}
      strip+='<div class="tdy'+(rows?'':' quiet')+'"><h4>'+HV.DAYS[t.dow].slice(0,3)+' '+t.d+'</h4>'+(rows||'<div>A regular day</div>')+'</div>';}
    strip+='</div></div>';
    var d=el('f-tom',left+right+strip+'<div class="hv-chip tclk tnum">'+HV.hm()+' '+HV.ampm()+'</div>');
    d.tick=function(){var c=d.querySelector('.tclk');if(c)c.textContent=HV.hm()+' '+HV.ampm();};
    return d;
  }
  /* ---------- kitty (evenings, for the kids): tomorrow's calendar and backpack with a cat who says what's up.
     Same backpack rules as the Tomorrow face, no weather. ---------- */
  var KIT_CANDY=['#ff8fc0','#ffd84d','#6fe3b4','#7cc8ff','#c3a6ff','#ffb067'];

  /* backpack stickers: up to 3 from the rules, then her cell phone, every school day */
  function kitPack(items){
    var h='';items.slice(0,3).forEach(function(x){
      h+='<div class="ks"><i style="background:'+PACK_COLOR[x.r.icon]+'">'+packIcon(x.r.icon)+'</i><b>'+HV.esc(x.r.item)+'</b></div>';});
    return h+'<div class="ks"><i style="background:#0a84ff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
      '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg></i><b>Cell phone</b></div>';
  }
  function kittyFace(){
    var t1=addDays(1),key=dayKeyOf(t1),P=packFor(key),day=HV.DAYS[t1.dow];
    var school=t1.dow>0&&t1.dow<6&&!P.off, n=P.items.length;
    /* what the cat says */
    var say=P.off||!school?'No school tomorrow. Yay!':
      n===1?'Don\'t forget: '+P.items[0].r.item+'!':n>1?n+' things for your backpack!':'Just a regular school day!';
    var name='';day.split('').forEach(function(ch,i){name+='<span style="color:'+KIT_CANDY[i%KIT_CANDY.length]+'">'+ch+'</span>';});
    var tags='';P.hol.forEach(function(e){tags+='<span class="khol">'+HV.esc(e.title)+'</span>';});
    if(P.off&&P.items[0]&&!tags)tags='<span class="khol">'+HV.esc(P.items[0].e.title)+'</span>';
    var left='<div class="kl"><div class="kbub"><em>Meow!</em>'+HV.esc(say)+'</div>'+kitPic(P,school,false)+'</div>';
    var right='<div class="kr"><div class="khd"><span class="ktag">Tomorrow is</span>'+
      '<div class="kday'+(day.length>8?' long':'')+'">'+name+'</div>'+
      '<div class="kdate"><span>'+HV.MONTHS[t1.mo-1]+' '+t1.d+'</span>'+tags+'</div></div>';
    right+='<h3>What\'s happening</h3><div class="kev">';
    P.other.slice(0,school?3:5).forEach(function(e,i){
      right+='<div class="kc" style="background:'+KIT_CANDY[i%KIT_CANDY.length]+'"><em>'+whenLabel(e)+'</em><b>'+HV.esc(e.title)+'</b></div>';});
    if(!P.other.length)right+='<div class="kc none"><b>Nothing on the calendar. Free time!</b></div>';
    right+='</div>';
    if(school){right+='<h3>In my backpack</h3><div class="kbp">';
      right+=kitPack(P.items)+'</div>';}
    right+='</div>';
    var stars='<i class="kst" style="top:7vh;left:30vw"></i><i class="kst s" style="top:15vh;left:8vw"></i><i class="kst" style="top:4vh;left:58vw"></i><i class="kst s" style="top:22vh;left:36vw"></i><i class="kst s" style="top:10vh;left:77vw"></i>';
    var d=el('f-kit',stars+left+right+'<div class="hv-chip kclk tnum">'+HV.hm()+' '+HV.ampm()+'</div>');
    d.tick=function(){var c=d.querySelector('.kclk');if(c)c.textContent=HV.hm()+' '+HV.ampm();};
    return d;
  }
  /* ---------- kitty today (mornings, for the kids): the Kitty tomorrow face for today, plus the Rain chip's heads-up
     (the Open-Meteo nowcast) said by the cat. She holds an umbrella when rain is on the way. ---------- */
  function kitRain(){
    var wx=data.frame&&data.frame.weather,n=wx&&wx.nowcast,d0=wx&&dayWx(dayKeyOf(HV.local()));
    function t12(s){var h=+s.slice(11,13),m=+s.slice(14,16);return (h%12||12)+':'+HV.pad(m)+' '+(h<12?'AM':'PM');}
    if(n&&n.state==='start'&&n.at)return n.mins<=5?'Rain is starting now. Grab an umbrella, no wet whiskers!':
      'Rain around '+t12(n.at)+', in '+n.mins+' minutes. Keep your paws dry!';
    if(n&&n.state==='stop'&&n.at)return 'It\'s raining until about '+t12(n.at)+'. Umbrella time!';
    if(n&&n.state==='rain')return 'It\'s raining! Cats hate getting wet. Umbrella!';
    /* the ride home from school, 2 to 4 PM: the highest hourly chance in that window */
    var pm=0;if(d0&&HV.local().h<16)(d0.hours||[]).forEach(function(x){var h=+x.t.slice(11,13);if(h>=14&&h<=16&&x.precip_pct>pm)pm=x.precip_pct;});
    if(pm>=50)return 'Rain may come at pickup, '+Math.round(pm)+'%. Pack an umbrella!';
    return null;
  }
  /* the picture cat (cats/*.webp, from Yani's images in data/cats, 640 px): one per backpack rule icon, picked from
     the day's items. The school regulars (PE, music, art, library) give way to anything else on the same day; a
     dress-up day takes its color from the title ("Wear red"). Rain with something on: that cat with the umbrella and
     puddle behind her; rain on a plain day: the raincoat cat. Nothing on: the backpack (school) or the yarn (day off). */
  var CAT_BY_ICON={coin:'snack',book:'library',shoe:'pe',bus:'trip',star:'picture',shirt:'dressup',art:'art',music:'music',home:'home'};
  var CAT_REGULAR={pe:1,music:1,art:1,library:1};
  var CAT_COLORS=[['red','red|rojo'],['blue','blue|azul'],['green','green|verde'],['orange','orange|naranja'],['purple','purple|morado|violet'],['yellow','yellow|amarillo']];
  function kitPic(P,school,rain){
    var pick=null,reg=null;
    P.items.forEach(function(x){var v=CAT_BY_ICON[x.r.icon];if(!v)return;
      if(v==='dressup'){var c='orange';CAT_COLORS.forEach(function(k){if(new RegExp('\\b('+k[1]+')\\b','i').test(x.e.title))c=k[0];});v='dressup_'+c;}
      if(CAT_REGULAR[v]){if(!reg)reg=v;}else if(!pick)pick=v;});
    pick=pick||reg;
    if(!pick&&rain)return '<div class="kcat pic"><img src="/frame/hv/standby/cats/rain.webp" alt=""></div>';
    pick=pick||(school?'backpack':'weekend');
    return '<div class="kcat pic">'+(rain?'<img class="kumb" src="/frame/hv/standby/cats/umbrella.webp" alt=""><img class="kpud" src="/frame/hv/standby/cats/puddle.webp" alt="">':'')+
      '<img src="/frame/hv/standby/cats/'+pick+'.webp" alt=""></div>';
  }
  function kittyTodayFace(){
    var t0=HV.local(),key=dayKeyOf(t0),P=packFor(key),day=HV.DAYS[t0.dow],now=HV.now().getTime();
    var school=t0.dow>0&&t0.dow<6&&!P.off,n=P.items.length,rain=kitRain();
    var say=rain||(P.off||!school?'No school today. Yay!':
      n===1?'Don\'t forget: '+P.items[0].r.item+'!':n>1?n+' things for your backpack!':'Have a great day at school!');
    var name='';day.split('').forEach(function(ch,i){name+='<span style="color:'+KIT_CANDY[i%KIT_CANDY.length]+'">'+ch+'</span>';});
    var tags='';P.hol.forEach(function(e){tags+='<span class="khol">'+HV.esc(e.title)+'</span>';});
    if(P.off&&P.items[0]&&!tags)tags='<span class="khol">'+HV.esc(P.items[0].e.title)+'</span>';
    var left='<div class="kl"><div class="kbub'+(say.length>40?' long':'')+(rain?' rain':'')+'"><em>'+(t0.h<12?'Good morning!':'Meow!')+'</em>'+HV.esc(say)+'</div>'+kitPic(P,school,!!rain)+'</div>';
    var right='<div class="kr"><div class="khd"><span class="ktag">Today is</span>'+
      '<div class="kday'+(day.length>8?' long':'')+'">'+name+'</div>'+
      '<div class="kdate"><span>'+HV.MONTHS[t0.mo-1]+' '+t0.d+'</span>'+tags+'</div></div>';
    /* what's still ahead today */
    var ev=P.other.filter(function(e){return new Date(e.end||e.start).getTime()>now;});
    right+='<h3>What\'s happening</h3><div class="kev">';
    ev.slice(0,school?3:5).forEach(function(e,i){
      right+='<div class="kc" style="background:'+KIT_CANDY[i%KIT_CANDY.length]+'"><em>'+whenLabel(e)+'</em><b>'+HV.esc(e.title)+'</b></div>';});
    if(!ev.length)right+='<div class="kc none"><b>Nothing else on the calendar. Free time!</b></div>';
    right+='</div>';
    if(school){right+='<h3>In my backpack</h3><div class="kbp">';
      right+=kitPack(P.items)+'</div>';}
    right+='</div>';
    var d=el('f-kit k-am',(rain?'':'<i class="ksun"></i>')+left+right+'<div class="hv-chip kclk tnum">'+HV.hm()+' '+HV.ampm()+'</div>');
    d.tick=function(){var c=d.querySelector('.kclk');if(c)c.textContent=HV.hm()+' '+HV.ampm();};
    return d;
  }
  /* ---------- today board: the Today screen redesigned for Standby. A big clock with the day, the warm Modern
     weather card with the next 12 hours as a curve, then coming up / tonight / at home. Read from across the room. ---------- */
  function bSym(kind){   // light-background line icons, as on the Modern weather card
    var sun='<circle cx="12" cy="12" r="4.2" stroke="#f5a524"/><path d="M12 2.5v2.2m0 14.6v2.2M2.5 12h2.2m14.6 0h2.2M5.3 5.3l1.5 1.5m10.4 10.4l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" stroke="#f5a524"/>';
    var cloud='<path d="M6.5 18.5a4 4 0 0 1-.4-8 5.8 5.8 0 0 1 11.2-1.3 4.5 4.5 0 1 1 .7 9.3Z" fill="#fff" stroke="#7d8aa0"/>';
    var moon='<path d="M18.8 16.7A8 8 0 0 1 7.3 5.2a8.2 8.2 0 1 0 11.5 11.5Z" stroke="#6fb0e8"/>';
    var b=kind==='sun'?sun:kind==='moon'?moon:kind==='partly'?'<g transform="translate(-1,-3) scale(.75)">'+sun+'</g>'+cloud:
      kind==='fog'?cloud+'<path d="M4 22h16M7 25h10" stroke="#9aa4b2"/>':kind==='rain'?cloud+'<path d="m8 21.5-.8 2.2m4.8-2.2-.8 2.2m4.8-2.2-.8 2.2" stroke="#2f7de1"/>':
      kind==='snow'?cloud+'<path d="M8 22v2.5m4-2.5v2.5m4-2.5v2.5" stroke="#6fb0e8"/>':
      kind==='storm'?cloud+'<path d="m13 17.5-3.5 5h3.2l-1.7 4 5.5-6h-3.6l2.4-3Z" fill="#f5a524" stroke="#f5a524" stroke-width="1"/>':cloud;
    return '<svg viewBox="0 0 24 28" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+b+'</svg>';
  }
  function bKind(code,isDay){var k=wxIcon(code,isDay);return k==='partly'&&!isDay?'moon':k;}
  function bHr(iso){var h=+iso.slice(11,13);return ((h%12)||12)+(h<12?'a':'p');}
  function bIndoor(){
    var xs=(data.ha&&data.ha.items)||[],t=null,h=null,ac=null,door=null,i,x;
    for(i=0;i<xs.length;i++){x=xs[i];if(x.avail===false)continue;
      if(x.kind==='sensor'&&!t&&(x.dc==='temperature'||/temp/i.test(x.id)))t=x;
      if(x.kind==='sensor'&&!h&&(x.dc==='humidity'||/humid/i.test(x.id)))h=x;
      if(x.kind==='climate'&&!ac)ac=x;
      if(x.kind==='sensor'&&/door|window|opening/.test(x.dc||'')&&x.on&&!door)door=x;}
    var tv=t?parseFloat(t.state):NaN;if(!isNaN(tv)&&/C/.test(t.state))tv=tv*9/5+32;
    var hv=h?parseFloat(h.state):NaN;
    return {f:isNaN(tv)?null:tv,hum:isNaN(hv)?null:hv,ac:ac,door:door};
  }
  /* the next thing worth a word, rain first (server: weather.nowcast), then the week */
  function bHeadline(w){
    var n=w.nowcast;
    if(n&&n.state==='start')return {rain:1,t:n.mins<=5?'Rain starting now':'Rain around '+hm24(n.at)+' · in '+n.mins+' min'};
    if(n&&n.state==='stop')return {rain:1,t:'Raining now, stopping around '+hm24(n.at)};
    if(n&&n.state==='rain')return {rain:1,t:'Raining now'};
    var hs=(w.hours24||w.hourly||[]).slice(1,13),i,top=null;
    for(i=0;i<hs.length;i++)if(!top||hs[i].precip_pct>top.precip_pct)top=hs[i];
    if(top&&top.precip_pct>=30)return {rain:1,t:(top.precip_pct>=60?'Rain likely':'Chance of rain')+' around '+hm24(top.t).replace(':00','')+' \u00b7 '+Math.round(top.precip_pct)+'%'};
    return {t:'Dry for the next 12 hours'};
  }
  function boardFace(){
    var t=HV.local(),key=dayKeyOf(t),w=data.frame&&data.frame.weather,i;
    /* tags under the date: a storm, cooler outside, today's holiday, sunset/sunrise, the next holiday */
    var tags=[],st=(data.storms&&data.storms.storms)||[],ind=bIndoor();
    if(t.dow===0||t.dow===6||packFor(key).off)tags.push('<span class="bt free">No school today</span>');   // a day off reads differently
    if(st.length)tags.push('<span class="bt '+(st[0].cat?'hu':'ts')+'">'+icon('warn')+HV.esc(st[0].label+' '+st[0].name)+' · '+st[0].dist_mi+' mi</span>');
    if(w&&w.temp_f!=null&&ind.f!=null&&w.temp_f<=ind.f-3&&w.temp_f>=60&&!(w.code>=51)&&!(w.nowcast&&/rain|stop/.test(w.nowcast.state)))
      tags.push('<span class="bt cool">Cooler outside · '+Math.round(w.temp_f)+'°</span>');
    var hol=null,hd=1e9;
    ((data.frame&&data.frame.calendar_events)||[]).forEach(function(e){if(!HV.isHoliday(e.cal))return;
      var k=dayKeyOf(HV.local(new Date(e.start))),dd=Math.round((Date.UTC(+k.slice(0,4),+k.slice(5,7)-1,+k.slice(8,10))-Date.UTC(t.y,t.mo-1,t.d))/864e5);
      if(dd===0)tags.unshift('<span class="bt hol">'+HV.esc(e.title)+'</span>');else if(dd>0&&dd<hd){hd=dd;hol=e;}});
    if(w&&w.sunset){var ns=key+'T'+HV.pad(t.h)+':'+HV.pad(t.mi),up=ns>=w.sunrise.slice(0,16)&&ns<w.sunset.slice(0,16);
      tags.push('<span class="bt">'+icon(up?'sunset':'sun')+(up?'Sunset '+hm24(w.sunset):'Sunrise '+hm24(ns<w.sunrise.slice(0,16)?w.sunrise:(w.next_sunrise||w.sunrise)))+'</span>');}
    if(hol&&hd<=30)tags.push('<span class="bt">'+HV.esc(hol.title)+' in '+hd+(hd===1?' day':' days')+'</span>');
    var hero='<div class="bh"><div class="bclk tnum"><b>'+HV.hm()+'</b><span>'+HV.ampm()+'</span></div>'+
      '<div class="bd">'+HV.DAYS[t.dow]+', '+HV.MONTHS[t.mo-1]+' '+t.d+'</div><div class="btags">'+tags.slice(0,3).join('')+'</div></div>';
    /* the warm weather card */
    var wx='';
    if(w&&w.temp_f!=null){
      var hi=Math.round(Math.max(w.hi_f,w.temp_f)),lo=Math.round(Math.min(w.lo_f,w.temp_f)),k=kind(w.code,w.is_day),hl=bHeadline(w);
      if(w.is_day&&(k==='Clear'||k==='Mostly clear'))k=k==='Clear'?'Sunny':'Mostly sunny';
      var hrs=(w.hours24||w.hourly||[]).slice(0,13),hh='';
      for(i=0;i<hrs.length;i++)hh+='<div'+(i===0?' class="now"':'')+'>'+(i%2?'':'<span>'+bSym(bKind(hrs[i].code,hrs[i].is_day))+'</span><small>'+(i===0?'Now':bHr(hrs[i].t))+'</small>')+'</div>';
      wx='<div class="bw"><div class="bwt"><div class="bwi">'+bSym(bKind(w.code,w.is_day))+'</div><div class="bwn tnum">'+Math.round(w.temp_f)+'°</div>'+
        '<div class="bwc"><div>'+HV.esc(k)+'<span>H '+hi+'° L '+lo+'°</span></div><em class="'+(hl.rain?'rain':'')+'">'+HV.esc(hl.t)+'</em></div></div>'+
        '<div class="bwp"><i class="bwnow"></i>'+bRain(hrs)+'<div class="bwh" style="grid-template-columns:repeat('+Math.max(1,hrs.length)+',minmax(0,1fr))">'+hh+'</div></div></div>';
    }else wx='<div class="bw empty">'+(data.frame?'The forecast did not load':'Loading the forecast')+'</div>';
    /* today's calendar: all-day first, then what is still ahead */
    var now=HV.now(),rows='',ev=eventsOn(key).filter(function(e){return !HV.isHoliday(e.cal)&&(e.all_day||new Date(e.end||e.start)>now);});
    ev.forEach(function(e){var s=new Date(e.start),right=e.all_day?'':whenLabel(e),soon='';
      if(!e.all_day){var m=Math.round((s-now)/60000);if(m<=0)right='Now';else if(m<120)right='in '+(m<60?m+' min':Math.floor(m/60)+' h'+(m%60?' '+(m%60)+' m':''));if(m<120)soon=' soon';}
      rows+='<div class="bev'+(e.all_day?' ad':'')+soon+'"><i style="background:'+HV.calColor(e.cal)+'"></i><b>'+HV.esc(e.title)+'</b><em>'+right+'</em></div>';});
    if(!ev.length)rows='<div class="bev none"><b>Nothing on the calendar</b></div>';
    var cal='<div class="bc bcal"><h3>Today</h3><div class="bevl">'+rows+'</div></div>';
    /* get ready: what today's calendar and weather mean for clothes and bags */
    var gr=bReady(w,key),ready='<div class="bc bready'+(gr.off?' off':'')+'">'+
      (gr.off?'<h3>Day off</h3><div class="bwhy">'+HV.esc(gr.why==='Weekend'?'No school, it\'s the weekend':gr.why)+'</div>':'<h3>Get ready</h3>');
    gr.rows.slice(0,gr.off?3:4).forEach(function(x){ready+='<div class="bf"><span class="bfi" style="background:'+tint(x.c)+';color:'+x.c+'">'+x.ic+'</span>'+
      '<div><b>'+HV.esc(x.t)+'</b><span>'+HV.esc(x.s)+'</span></div></div>';});
    if(!gr.rows.length)ready+='<div class="bev none"><b>'+(gr.off?'Nothing to plan for, enjoy it':'Nothing special today')+'</b></div>';
    ready+='</div>';
    /* at home: running timers, an open door, inside, the shopping list */
    var fs=[],tms=HV.state.timers||[],S=data.shop;
    tms.slice(0,2).forEach(function(x){fs.push({c:'warn',i:'clock',t:x.label||'Timer',s:'Timer running',tm:x.ends});});
    if(ind.door)fs.push({c:'warn',i:'warn',t:ind.door.name+' is open',s:'Door sensor'});
    if(ind.f!=null)fs.push({c:'in '+(ind.f<66?'t-cold':ind.f<71?'t-cool':ind.f<76?'t-comfy':ind.f<80?'t-warm':'t-hot'),i:'house',
      t:'Inside '+(Math.round(ind.f*10)/10)+'°'+(ind.hum!=null?' · '+Math.round(ind.hum)+'%':''),s:ind.ac?ind.ac.name+(ind.ac.on?' on · '+String(ind.ac.state).toLowerCase():' off'):'Humidity'});
    if(S){var todo=(S.items||[]).filter(function(x){return !x.checked;}).map(function(x){return x.name;});
      fs.push(S.left?{c:'blue',i:'cart',t:S.left+' to buy',s:todo.slice(0,4).join(', ')}:{c:'',i:'cart',t:'Nothing on the list',s:'Shopping'});}
    if(!tms.length&&fs.length<3)fs.push({c:'',i:'clock',t:'No timers running',s:'Kitchen timers'});
    var home='<div class="bc bhome"><h3>At home</h3>';
    fs.slice(0,3).forEach(function(x){home+='<div class="bf '+x.c+'"><span class="bfi">'+(BIC[x.i]?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+BIC[x.i]+'</svg>':icon(x.i))+'</span>'+
      '<div><b>'+HV.esc(x.t)+'</b><span>'+HV.esc(x.s)+'</span></div>'+(x.tm?'<u class="tnum btm" data-e="'+x.tm+'"></u>':'')+'</div>';});
    home+='</div>';
    var d=el('f-board','<div class="btop">'+hero+wx+'</div><div class="brow">'+cal+ready+home+'</div>');
    d.tick=function(){
      var c=d.querySelector('.bclk b'),a=d.querySelector('.bclk span');if(c){c.textContent=HV.hm();a.textContent=HV.ampm();}
      var ts=d.querySelectorAll('.btm'),nw=HV.now().getTime()/1000;for(var j=0;j<ts.length;j++){var l=(+ts[j].getAttribute('data-e'))-nw;ts[j].textContent=l<=0?'Done':HV.mmss(l);}};
    d.tick();d.fast=true;
    setTimeout(function(){bFit(d);
      var tg=d.querySelector('.btags');while(tg&&tg.children.length>1&&tg.scrollWidth>tg.clientWidth+1)tg.removeChild(tg.lastChild);},0);   // after the slide is in the page: real sizes
    return d;
  }
  var BIC={house:'<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    cart:'<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'};
  /* drop events from the end until the list fits; never leave a day label alone at the bottom */
  function bFit(d){var l=d.querySelector('.bevl'),k;if(!l)return;
    while(l.scrollHeight>l.clientHeight+1&&l.children.length>2){l.removeChild(l.lastChild);for(k=l.lastChild;k&&k.className==='bday';k=l.lastChild)l.removeChild(k);}}
  /* the next 12 hours as rain chance: one bar per hour on a 0-100% scale, the number over it from 10% */
  function bRain(hrs){
    var h='<div class="bwr" style="grid-template-columns:repeat('+Math.max(1,hrs.length)+',minmax(0,1fr))"><i class="bwg" style="bottom:50%"></i><span class="bwk">Rain chance</span>',i;
    for(i=0;i<hrs.length;i++){var p=Math.round(hrs[i].precip_pct||0);
      h+='<div class="'+(p>=50?'hi':p>=20?'md':'lo')+'">'+(p>=10?'<em>'+p+'%</em>':'')+'<u style="height:'+Math.max(2,p)+'%"></u></div>';}
    return h+'</div>';
  }
  /* Get ready: today's calendar (the backpack rules) and the weather around the school run.
     PICKUP is when the kids come back (3 PM); the umbrella row looks at 2-4 PM. */
  var PICKUP=15;
  var BREADY={umb:'<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 0 4 0M12 3v0"/>',
    bottle:'<path d="M9 2h6M10 2v3l-2 2.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7.5L14 5V2"/><path d="M8 12h8"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'};
  function bSvg(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';}
  /* returns {off, why, rows}: a school day lists what to wear and pack; a day off (weekend or a no-school
     event) lists what the weather means for going out */
  function bReady(w,key){
    var out=[],t=HV.local(),P=packFor(key),off=t.dow===0||t.dow===6||P.off,i,mins=t.h*60+t.mi,d0=dayWx(key);
    var why=P.off?((P.items.filter(function(x){return x.r.off;})[0]||{e:{title:'No school'}}).e.title.replace(/[.!\s]+$/,'')):(t.dow===0||t.dow===6)?'Weekend':'';
    var hrs=w?(w.hours24||w.hourly||[]):[],am=0,pk=null,day=null;
    for(i=0;i<hrs.length;i++){var x=hrs[i],h=+x.t.slice(11,13);if(x.t.slice(0,10)!==key)continue;
      if(h>=7&&h<=8&&x.precip_pct>am)am=x.precip_pct;
      if(h>=PICKUP-1&&h<=PICKUP+1&&(pk===null||x.precip_pct>pk))pk=x.precip_pct;
      if(h>=9&&h<=19&&(!day||x.precip_pct>day.precip_pct))day=x;}
    var nc=w&&w.nowcast;   // the 15-minute nowcast beats the hourly chance when rain is about to start near pickup
    if(pk!==null&&nc&&(nc.state==='rain'||(nc.state==='start'&&+nc.at.slice(11,13)>=PICKUP-1&&+nc.at.slice(11,13)<=PICKUP+1)))pk=Math.max(pk,70);
    if(!off){
      var pkt=((PICKUP%12)||12)+' '+(PICKUP<12?'AM':'PM');
      if(mins<9*60&&am>=40)out.push({c:'#0a84ff',ic:bSvg(PACK_ICONS.shirt),t:'Rain jacket this morning',s:Math.round(am)+'% rain at drop-off'});
      if(pk!==null&&pk>=30&&mins<PICKUP*60+30)   // only when an umbrella is actually needed
        out.push({c:pk>=50?'#0a84ff':'#64d2ff',ic:bSvg(BREADY.umb),t:pk>=50?'Umbrella for the '+pkt+' pickup':'Maybe an umbrella at '+pkt,s:Math.round(pk)+'% rain around '+pkt});
      if(mins<PICKUP*60)out.push({c:'#64d2ff',ic:bSvg(BREADY.phone),t:'Pack the iPhone',s:'Charged and in the backpack'});
      P.items.forEach(function(x){out.push({c:PACK_COLOR[x.r.icon],ic:bSvg(PACK_ICONS[x.r.icon]),t:x.r.item,s:packNote(x)});});
      if(d0&&d0.hi_f>=88)out.push({c:'#ff9f0a',ic:bSvg(BREADY.bottle),t:'Water bottle',s:'Hot today, high '+Math.round(d0.hi_f)+'°'});
      if(w&&w.uv&&w.uv.max>=8&&mins<16*60)out.push({c:'#ffd60a',ic:bSvg(BREADY.sun),t:'Sunscreen',s:'UV '+Math.round(w.uv.max)+' around midday'});
      if(d0&&d0.lo_f<58&&mins<10*60)out.push({c:'#bf5af2',ic:bSvg(PACK_ICONS.shirt),t:'Jacket for the morning',s:'Low '+Math.round(d0.lo_f)+'°'});
    }else{
      var dp=day?Math.round(day.precip_pct):0,dt=day?hm24(day.t).replace(':00',''):'';
      if(dp>=50)out.push({c:'#0a84ff',ic:bSvg(BREADY.umb),t:'Umbrella if you head out',s:dp+'% rain around '+dt});
      else if(d0&&d0.hi_f>=80&&dp<30&&d0.code<=2)out.push({c:'#ffd60a',ic:bSvg(BREADY.sun),t:'Good beach day',s:'High '+Math.round(d0.hi_f)+'° · rain under '+Math.max(10,Math.ceil(dp/10)*10)+'%'});
      else if(dp>=30)out.push({c:'#64d2ff',ic:bSvg(BREADY.umb),t:'Maybe rain later',s:dp+'% around '+dt});
      if(w&&w.uv&&w.uv.max>=8&&mins<16*60)out.push({c:'#ffd60a',ic:bSvg(BREADY.sun),t:'Sunscreen',s:'UV '+Math.round(w.uv.max)+' around midday'});
      if(d0&&d0.hi_f>=88)out.push({c:'#ff9f0a',ic:bSvg(BREADY.bottle),t:'Water bottle',s:'Hot today, high '+Math.round(d0.hi_f)+'°'});
    }
    return {off:off,why:why,rows:out};
  }
  var FACES={alert:alertFace,board:boardFace,tomorrow:tomorrowFace,kitty:kittyFace,kittyam:kittyTodayFace,info:infoFace,numerals:numeralsFace,month:monthFace,minimal:minimalFace,photo:photoFace,depth:photoFace,plain:photoFace,analog:analogFace,week:weekFace,cal:weekFace,weather:weatherFace,today:todayFace,date:todayFace,np:npFace,up:upFace};

  /* ---------- loop ---------- */
  function show(){
    var name=nextFace(), d=(FACES[name]||photoFace)();
    stage.appendChild(d);
    var old=cur;cur=d;
    void d.offsetWidth; d.classList.add('on');
    if(old){old.classList.remove('on');setTimeout(function(){if(old.parentNode)old.parentNode.removeChild(old);},1400);}
    clearTimeout(timer);
    if(!PIN)timer=setTimeout(show,/photo|depth|plain/.test(d.className)?IDLE.slide*1000:IDLE.face*1000);
  }
  setInterval(function(){if(cur&&cur.tick&&(cur.fast||HV.local().s<2))cur.tick();},1000);
  setInterval(function(){load().then(function(){if(!PIN&&HV.facesOn().alert&&newSevere())show();});},60000);

  var BACK=Q.get('back')==='faces'?'/frame/hv/faces/':'/frame/hv/';   // ?back=faces: previews from the schedule page return there
  document.addEventListener('click',function(e){if(e.target.closest('.hv-chrome,.hv-timers,button'))return;location.href=BACK;});
  // ?return=<seconds>: go back on its own if nobody taps (the launcher's Kids button uses 60)
  var RET=+Q.get('return');if(RET>0)setTimeout(function(){location.href=BACK;},RET*1000);
  var THUMB=Q.get('thumb')==='1';   // scripts/make_face_thumbs.py renders clean previews for the faces chooser
  if(IDLE.shade&&!THUMB){var dimEl=document.createElement('div');dimEl.className='sb-dim';dimEl.style.opacity=IDLE.shade/100;document.body.appendChild(dimEl);}
  if(!THUMB){
    var hint=document.createElement('div');hint.className='hint';hint.textContent='Tap anywhere to return';document.body.appendChild(hint);
    setTimeout(function(){hint.classList.add('on');},400);setTimeout(function(){hint.classList.remove('on');},8000);
    HV.chrome({clock:false,standby:false});
  }
  load().then(show);
})();
