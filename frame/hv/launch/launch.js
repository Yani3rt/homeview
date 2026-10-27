/* Home launcher (/frame/hv/), Apple HomeView cards (Yani's design, 2026-10-27; replaced the greeting + week strip launcher):
     [ Hero (2 cols x 3 rows)        ] [ Up next ] [ Smart Home ]  [rail]
     [ date, today's events, clock   ] [ Tonight ] [ Shopping   ]  paw, timer, camera,
     [ or a running timer, weather   ] [ Photos  ] [ Tomorrow   ]  sleep, settings
   The hero clock becomes the countdown ring while a timer runs (tap: Timer). Up next shows the one thing that
   matters most right now: a finished timer, a severe alert or a near storm, the next event, or tomorrow's first.
   Smart Home is the old launcher's card (Outside without Home Assistant), Photos becomes Music with Sonos/Spotify.
   No greeting, no week strip, no top chips. Refreshes every 30 s (ETag'd). ES5. */
(function(){
  var d={frame:null,plan:null,shop:null,music:null,photos:null,ha:null,storms:null,alerts:null};
  var grid=document.getElementById('grid'),rail=document.getElementById('rail');
  var MUSIC=!!(HV.cfg.sonos||HV.cfg.spotify);
  var I={
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    moonsky:'<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    pcloud:'<path d="M8 6.5V5M3.8 8.3l1 .9M12.2 8.3l-1 .9"/><path d="M5.2 13a3.4 3.4 0 1 1 6.3-2.6"/><path d="M8.5 19h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 8.5 19z" fill="currentColor" stroke="none"/>',
    cloud:'<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 18z" fill="currentColor" stroke="none"/>',
    rain:'<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14z" fill="currentColor" stroke="none"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    snow:'<path d="M7 14h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 14z" fill="currentColor" stroke="none"/><path d="M8 18h.01M12 20h.01M16 18h.01"/>',
    storm:'<path d="M7 13h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 13z" fill="currentColor" stroke="none"/><path d="M12.5 14l-2 4h3l-2 4"/>',
    fog:'<path d="M4 9h16M6 13h12M4 17h16"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    fork:'<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-1.7 1.2-2.5 3.5-2.5 6.5V13H16v8"/>',
    timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
    cart:'<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    note:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    photo:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15l3-3 2 2 3-4 3 4"/>',
    air:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
    house:'<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    umb:'<path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 0 4 0"/>',
    warn:'<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
    cam:'<rect x="2.5" y="6" width="13.5" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3z"/>',
    moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    win:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  };
  var PAW='<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="5.6" cy="10.4" rx="2" ry="2.6" transform="rotate(-20 5.6 10.4)"/><ellipse cx="9.6" cy="6" rx="2.1" ry="2.7" transform="rotate(-8 9.6 6)"/><ellipse cx="14.4" cy="6" rx="2.1" ry="2.7" transform="rotate(8 14.4 6)"/><ellipse cx="18.4" cy="10.4" rx="2" ry="2.6" transform="rotate(20 18.4 10.4)"/><path d="M12 11.6c-2.9 0-5.8 3.3-5.8 5.9 0 1.7 1.3 2.4 2.7 2.4 1.3 0 2-.6 3.1-.6s1.8.6 3.1.6c1.4 0 2.7-.7 2.7-2.4 0-2.6-2.9-5.9-5.8-5.9z"/></svg>';
  function ic(n,w,fill){return '<svg viewBox="0 0 24 24" fill="'+(fill||'none')+'" stroke="currentColor" stroke-width="'+(w||2.1)+'" stroke-linecap="round" stroke-linejoin="round">'+I[n]+'</svg>';}
  function kind(c){if(c==null)return '';if(c<=1)return 'Clear';if(c===2)return 'Partly cloudy';if(c===3)return 'Cloudy';if(c===45||c===48)return 'Fog';
    if((c>=71&&c<=77)||c===85||c===86)return 'Snow';if(c>=95)return 'Storms';if(c>=51&&c<=57)return 'Drizzle';return 'Rain';}
  function wxIcon(c,day){if(c==null||c<=1)return day?'sun':'moonsky';if(c===2)return day?'pcloud':'cloud';if(c===3)return 'cloud';if(c===45||c===48)return 'fog';
    if((c>=71&&c<=77)||c===85||c===86)return 'snow';if(c>=95)return 'storm';return 'rain';}
  function key(t){return t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d);}    // a home-time day as 'YYYY-MM-DD'
  function dayKey(iso){return key(HV.local(new Date(iso)));}
  function t12(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return ((h%12)||12)+':'+m+' '+(h<12?'AM':'PM');}   // a home-time ISO
  function at(ms){var x=new Date(ms);return HV.hm(x)+' '+HV.ampm(x);}
  function thumb(u){return u?(/themealdb/.test(u)?String(u)+'/medium':String(u)):'';}
  function card(cls,href,body,style){
    return '<div class="h2-dev"><a class="h2-c '+cls+'" href="'+href+'"'+(style?' style="'+style+'"':'')+'>'+body+'</a></div>';
  }
  function lb(icon,text){return '<div class="h2-lb">'+ic(icon)+'<span>'+text+'</span></div>';}
  function evsOn(k){
    return ((d.frame&&d.frame.calendar_events)||[]).filter(function(e){var s=dayKey(e.start);if(!e.all_day)return s===k;
      var en=e.end?dayKey(e.end):s;return s<=k&&(k<en||s===k);})
      .sort(function(a,b){return (b.all_day?1:0)-(a.all_day?1:0)||new Date(a.start)-new Date(b.start);});
  }
  function timers(){return (HV.state.timers||[]).slice().sort(function(a,b){return a.ends-b.ends;});}

  /* ---------- hero ---------- */
  function heroLeft(){
    var t=HV.local(),tk=key(t),now=HV.now().getTime(),rows='',next=false;
    var left=evsOn(tk).filter(function(e){return !HV.isHoliday(e.cal)&&new Date(e.end||e.start).getTime()>now;});
    left.slice(0,3).forEach(function(e){
      var s=new Date(e.start).getTime(),m=Math.round((s-now)/60000),when=e.all_day?'All day':at(s),cls='';
      if(!e.all_day&&s<=now){when='Now';cls=' soon';}
      else if(!e.all_day&&!next&&m<=60){next=true;cls=' soon';when+=' · in '+Math.max(1,m)+' min';}
      rows+='<div class="h2-ev'+cls+'" style="border-color:'+HV.calColor(e.cal)+'"><b>'+when+'</b><span>'+HV.esc(e.title)+'</span></div>';
    });
    if(left.length>3)rows+='<div class="more">+'+(left.length-3)+' more</div>';
    if(!(HV.cfg.calendars||[]).length)rows='<div class="none">No calendars yet</div>';
    else if(!left.length)rows='<div class="none">'+(d.frame?'Nothing else today':'Loading the calendar')+'</div>';
    return '<a class="l" href="/frame/hv/calendar/"><div class="dt">'+HV.DAYS[t.dow].slice(0,3)+' '+HV.MONTHS[t.mo-1].slice(0,3)+'</div>'+
      '<div class="dnum">'+t.d+'</div><div class="evs">'+rows+'</div></a>';
  }
  // the analog dial (Standby's Info face); hands are set by tick()
  function dial(){
    var s='<svg viewBox="0 0 200 200">',i;
    for(i=0;i<60;i++){var a=i*Math.PI/30,L=i%5?4:9;s+='<line x1="'+(100+Math.sin(a)*(92-L)).toFixed(1)+'" y1="'+(100-Math.cos(a)*(92-L)).toFixed(1)+'" x2="'+(100+Math.sin(a)*92).toFixed(1)+'" y2="'+(100-Math.cos(a)*92).toFixed(1)+'" stroke="'+(i%5?'#7d8794':'#1d1d1f')+'" stroke-width="'+(i%5?1.2:2.4)+'" stroke-linecap="round"/>';}
    for(i=1;i<=12;i++){var b=i*Math.PI/6;s+='<text x="'+(100+Math.sin(b)*70).toFixed(1)+'" y="'+(100-Math.cos(b)*70+7).toFixed(1)+'" text-anchor="middle" font-size="20" font-weight="600" fill="#1d1d1f" font-family="HV SF Rounded, sans-serif">'+i+'</text>';}
    return s+'<line class="hh" x1="100" y1="100" x2="100" y2="52" stroke="#1d1d1f" stroke-width="6" stroke-linecap="round"/>'+
      '<line class="mh" x1="100" y1="100" x2="100" y2="26" stroke="#1d1d1f" stroke-width="4" stroke-linecap="round"/>'+
      '<line class="sh" x1="100" y1="114" x2="100" y2="22" stroke="#ff9f0a" stroke-width="1.6" stroke-linecap="round"/><circle cx="100" cy="100" r="4.5" fill="#ff9f0a"/></svg>';
  }
  var R=88,CIRC=2*Math.PI*R;
  function ring(){
    return '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="'+R+'" fill="rgba(255,255,255,.45)" stroke="rgba(255,159,10,.22)" stroke-width="9"/>'+
      '<circle class="arc" cx="100" cy="100" r="'+R+'" fill="none" stroke="#ff9f0a" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 '+CIRC.toFixed(1)+'" transform="rotate(-90 100 100)"/></svg>'+
      '<div class="tx"><span></span><b class="tnum"></b><em></em></div>';
  }
  var clockMode='';
  function tick(){
    var el=document.getElementById('clock');if(!el)return;
    var ts=timers(),mode=ts.length?'timer':'dial';
    if(mode!==clockMode){clockMode=mode;el.innerHTML=mode==='timer'?ring():dial();}
    if(mode==='dial'){var t=HV.local();
      el.querySelector('.hh').setAttribute('transform','rotate('+((t.h%12)*30+t.mi/2)+' 100 100)');
      el.querySelector('.mh').setAttribute('transform','rotate('+(t.mi*6+t.s/10)+' 100 100)');
      el.querySelector('.sh').setAttribute('transform','rotate('+(t.s*6)+' 100 100)');
      el.className='h2-clock';return;}
    var x=ts[0],now=HV.now().getTime()/1000,left=x.ends-now,f=x.total?Math.max(0,Math.min(1,left/x.total)):0;
    el.className='h2-clock'+(left<=0?' done':'');
    var arc=el.querySelector('.arc');arc.setAttribute('stroke-dasharray',(CIRC*f).toFixed(1)+' '+CIRC.toFixed(1));arc.style.opacity=f>0?1:0;
    el.querySelector('.tx span').textContent=x.label+(ts.length>1?' +'+(ts.length-1):'');
    el.querySelector('.tx b').textContent=left<=0?'Done':HV.mmss(left);
    el.querySelector('.tx em').textContent=left<=0?'Tap to stop':'Done at '+at(x.ends*1000);
  }
  function rainText(n){
    if(n&&n.state==='start'&&n.at)return n.mins<=5?'Rain starting now':'Rain at '+t12(n.at);
    if(n&&n.state==='stop'&&n.at)return 'Raining until '+t12(n.at);
    if(n&&n.state==='rain')return 'Raining now';
    return '';
  }
  function heroRight(){
    var wx=d.frame&&d.frame.weather,w='';
    if(!wx||wx.temp_f==null)w='<div class="loc">'+HV.esc(HV.cfg.place||'Home')+'</div><div class="k">'+(d.frame?'The forecast did not load':'Waiting for the forecast')+'</div>';
    else{
      var hl='H:'+Math.round(Math.max(wx.hi_f,wx.temp_f))+'° L:'+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°',pills='',rt=rainText(wx.nowcast),cool=coolNow();
      if(rt)pills+='<span class="h2-pill">'+ic('umb',2.2)+rt+'</span>';
      if(cool)pills+='<span class="h2-pill cool">'+ic('win',2.1)+'Cooler outside</span>';
      w='<div class="loc">'+HV.esc(HV.cfg.place||'Home')+'</div><div class="t">'+Math.round(wx.temp_f)+'°</div>'+
        '<div class="k">'+ic(wxIcon(wx.code,wx.is_day))+'<span>'+kind(wx.code)+'<br>'+hl+'</span></div>'+(pills?'<div class="h2-pills">'+pills+'</div>':'');
    }
    return '<div class="r"><a class="h2-clock" id="clock" href="/frame/hv/timer/"></a><a class="h2-wx" href="/frame/hv/weather/">'+w+'</a></div>';
  }
  // the old "Cooler outside" chip: 3°+ cooler outside than the Home Assistant indoor temperature, dry, 60°+ out
  function coolNow(){
    if(!HV.cfg.ha)return null;
    var w=d.frame&&d.frame.weather,xs=(d.ha&&d.ha.items)||[],it=null,i;
    if(!w||w.temp_f==null)return null;
    for(i=0;i<xs.length;i++)if(xs[i].kind==='sensor'&&(xs[i].dc==='temperature'||/temp/i.test(xs[i].id))){it=xs[i];break;}
    if(!it)return null;var inF=parseFloat(it.state);if(isNaN(inF))return null;if(/C/.test(it.state))inF=inF*9/5+32;
    var n=w.nowcast,wet=(n&&(n.state==='rain'||n.state==='stop'||(n.state==='start'&&n.mins<=120)))||w.code>=51;
    return !wet&&w.temp_f<=inF-3&&w.temp_f>=60;
  }

  /* ---------- Up next: the one thing that matters most right now ---------- */
  /* ---------- alerts: weather alerts (Home Assistant, already filtered by alerts_min_severity) and storms near home ---------- */
  function sevColor(s){return /Extreme|Severe/.test(s)?'red':'orange';}
  // 'Until 8:00 PM' today, 'Until Wed 8:00 PM' on another day (short enough for the Up next card)
  function untilDay(x){var t=HV.local(x);return key(t)===key(HV.local())?'':HV.DAYS[t.dow].slice(0,3)+' ';}
  function alertList(){
    var out=[];
    ((d.alerts&&d.alerts.alerts)||[]).forEach(function(a){var until=a.ends||a.expires,ud=until?new Date(until):null;
      out.push({kind:'alert',a:a,color:sevColor(a.severity),title:a.event,when:ud&&!isNaN(ud)?'Until '+untilDay(ud)+at(ud.getTime()):(a.severity||'Alert'),sub:a.areas||''});});
    ((d.storms&&d.storms.storms)||[]).forEach(function(s){if(!s.near)return;
      out.push({kind:'storm',s:s,color:/Hurricane/i.test(s.label)?'red':'orange',title:s.label+' '+s.name,when:(s.cat?s.cat+' \u00b7 ':'')+s.wind_mph+' mph',sub:s.dist_mi+' mi '+(s.dir||'')+' of home'});});
    // most urgent first: red before orange, alerts before storms (the server sorts alerts by severity already)
    return out.filter(function(x){return x.color==='red';}).concat(out.filter(function(x){return x.color!=='red';}));
  }
  var upShowsAlerts=false;
  // the list of everything that's active, in a sheet (tap the Up next alert card or the rail's alert button)
  var sheet=null,shade=null;
  function para(t){   /* NWS text: "* WHAT...Minor flooding." blocks; single newlines are line wraps */
    return HV.esc(t).split(/\n\s*\n/).map(function(p){
      p=p.replace(/\n/g,' ').replace(/^\* ?([A-Z][A-Z ]+)\.\.\./,function(m,k){return '<b>'+k.charAt(0)+k.slice(1).toLowerCase()+':</b> ';});
      return '<p>'+p+'</p>';}).join('');
  }
  function closeAlerts(){if(sheet){sheet.classList.remove('on');shade.classList.remove('on');}}
  function openAlerts(){
    var L=alertList();if(!L.length)return;
    if(!sheet){shade=document.createElement('div');shade.className='hv-alert-shade';shade.onclick=closeAlerts;document.body.appendChild(shade);
      sheet=document.createElement('div');sheet.className='hv-sheet hv-alert-sheet';document.body.appendChild(sheet);
      sheet.onclick=function(e){if(e.target.closest('.hv-alert-close'))closeAlerts();};}
    var h='';
    L.forEach(function(x){
      if(x.kind==='alert'){var a=x.a;
        h+='<section><div class="hv-alert-tag '+x.color+'">'+HV.esc(a.severity||'Alert')+'</div><h2>'+HV.esc(a.event)+'</h2>'+
          '<div class="hv-alert-meta">'+HV.esc(x.when)+(a.areas?' \u00b7 '+HV.esc(a.areas):'')+'</div>'+
          (a.headline?'<p class="hv-alert-head">'+HV.esc(a.headline.charAt(0)+a.headline.slice(1).toLowerCase())+'</p>':'')+
          para(a.description||'')+(a.instruction?'<p class="hv-alert-do">'+HV.esc(a.instruction)+'</p>':'')+'</section>';
      }else{var s=x.s;
        h+='<section><div class="hv-alert-tag '+x.color+'">Near home</div><h2>'+HV.esc(x.title)+'</h2>'+
          '<div class="hv-alert-meta">'+HV.esc(x.when)+' \u00b7 '+HV.esc(x.sub)+'</div>'+
          '<img class="h2-cone" src="/api/storms/cone/'+encodeURIComponent(s.id)+'.jpg" alt="Forecast cone"></section>';
      }
    });
    sheet.innerHTML=h+'<button class="hv-alert-close">Close</button>';sheet.scrollTop=0;
    sheet.classList.add('on');shade.classList.add('on');
  }

  function upNext(){
    var now=HV.now().getTime(),t=HV.local(),ts=timers(),i;upShowsAlerts=false;
    function up(cls,href,icon,label,big,what,why,small){
      return card('h2-up '+cls,href,lb(icon,label)+'<div class="big'+(small?' sm':'')+'">'+big+'</div><div class="what">'+what+'</div>'+(why?'<div class="why">'+why+'</div>':''));}
    // 1. a timer that is done
    for(i=0;i<ts.length;i++)if(ts[i].ends*1000<=now)
      return up('green','/frame/hv/timer/','timer','Timer','Done',HV.esc(ts[i].label)+' is ready','Tap to stop');
    // 2. weather alerts and storms near home: the most urgent one, "+N more"; tap opens the list with the details
    var L=alertList();
    if(L.length){var x=L[0];upShowsAlerts=true;
      return card('h2-up '+x.color,'/frame/hv/weather/',lb('warn',x.kind==='storm'?'Storm':'Alert')+'<div class="big sm">'+HV.esc(x.title)+'</div>'+
        '<div class="what">'+HV.esc(x.when)+'</div><div class="why">'+(L.length>1?'+'+(L.length-1)+' more \u00b7 tap for details':HV.esc(x.sub||'Tap for details'))+'</div>').replace('<a class=','<a data-alerts="1" class=');}
    // 3. what's next today: within 3 hours a countdown, later the time
    var tk=key(t),evs=((d.frame&&d.frame.calendar_events)||[]).filter(function(e){return !e.all_day&&!HV.isHoliday(e.cal)&&new Date(e.start).getTime()>now;})
      .sort(function(a,b){return new Date(a.start)-new Date(b.start);});
    var n=evs[0];
    if(n&&dayKey(n.start)===tk){var s=new Date(n.start).getTime(),m=Math.round((s-now)/60000);
      var big=m<60?Math.max(1,m)+'<small>min</small>':m<180?Math.floor(m/60)+'<small>h</small> '+(m%60)+'<small>min</small>':HV.hm(new Date(s))+'<small>'+HV.ampm(new Date(s))+'</small>';
      var pk=HV.packHit(n.title);
      return up('','/frame/hv/calendar/','cal','Up next',big,HV.esc(n.title),at(s)+(pk?' · '+HV.esc(pk.item):''));}
    // 4. nothing left today: tomorrow's first thing, with what to pack
    var tm=key(HV.local(new Date(now+864e5))),te=evsOn(tm).filter(function(e){return !HV.isHoliday(e.cal);}),first=null,pack=null;
    te.forEach(function(e){if(!first&&!e.all_day)first=e;var r=HV.packHit(e.title);if(!pack&&r)pack=r;});
    if(first){var fs=new Date(first.start);
      return up('grey','/frame/hv/calendar/','sun','Tomorrow',HV.hm(fs)+'<small>'+HV.ampm(fs)+'</small>',HV.esc(first.title),pack?HV.esc(pack.item+(pack.note?' · '+pack.note:'')):(te.length>1?'+'+(te.length-1)+' more':''));}
    if(n){var ns=new Date(n.start);
      return up('grey','/frame/hv/calendar/','cal','Coming up',HV.dayWord(ns,true),HV.esc(n.title),at(ns.getTime()),true);}
    return up('grey','/frame/hv/calendar/','cal','Up next','Free',d.frame?'Nothing on the calendar':'Loading the calendar','',true);
  }

  /* ---------- the other cards ---------- */
  // Home Assistant: indoor temperature and humidity (tinted by temperature); otherwise Outside: air quality and sun
  function homeCard(){
    var wx=d.frame&&d.frame.weather;
    if(HV.cfg.ha){
      var hi=(d.ha&&d.ha.items)||[],tmp=null,hum=null;
      hi.forEach(function(x){if(x.kind!=='sensor')return;
        if(!tmp&&(x.dc==='temperature'||/temp/i.test(x.id)))tmp=x;
        if(!hum&&(x.dc==='humidity'||/humid/i.test(x.id)))hum=x;});
      var num=function(x){var n=x?parseFloat(x.state):NaN;return isNaN(n)?null:n;},tv=num(tmp),hv=num(hum);
      var tf=tv==null?null:(/C/.test(tmp.state)?tv*9/5+32:tv);
      var band=tf==null?'t-comfy':tf<66?'t-cold':tf<71?'t-cool':tf<76?'t-comfy':tf<80?'t-warm':'t-hot';
      var body=!d.ha?'<div class="s" style="margin-top:auto">Loading</div>':(tv==null&&hv==null)?'<div class="s" style="margin-top:auto">'+HV.esc(d.ha.error||'No temperature or humidity sensor in the list')+'</div>':
        '<div class="big">'+(tv!=null?(Math.round(tv*10)/10)+'°':Math.round(hv)+'%')+'</div><div class="s">'+
        (tv!=null&&hv!=null?Math.round(hv)+'% humidity':tv!=null?'':'Humidity')+(tmp?(hv!=null?' · ':'')+HV.esc(tmp.name):'')+'</div>';
      return card('h2-home '+band,'/frame/hv/ha/',lb('house',HV.esc(HV.cfg.ha_title||'Smart Home'))+body);
    }
    var aq=d.frame&&d.frame.aqi,sun='';
    if(wx&&wx.sunset){var t2=HV.local(),ns=key(t2)+'T'+HV.pad(t2.h)+':'+HV.pad(t2.mi);
      sun=ns<wx.sunrise.slice(0,16)?'Sunrise '+t12(wx.sunrise):ns<wx.sunset.slice(0,16)?'Sunset '+t12(wx.sunset):wx.next_sunrise?'Sunrise '+t12(wx.next_sunrise):'';}
    return card('h2-home t-cool','/frame/hv/weather/',lb('air','Outside')+(aq&&aq.us_aqi!=null?'<div class="big">'+aq.us_aqi+'</div><div class="s">Air quality, '+HV.esc(aq.band||'')+(sun?' · '+sun:'')+'</div>':
      '<div class="s" style="margin-top:auto">'+(sun||'Waiting for the forecast')+'</div>'));
  }
  function tonightCard(){
    var P=d.plan,din=P&&P.tonight,tm=P&&P.tomorrow;
    return card('h2-ph','/frame/hv/'+(din?'dinner/':'meals/'),lb('fork','Tonight')+
      '<div class="cap"><b>'+(din?HV.esc(din.name):'Nothing planned yet')+'</b><span>'+(din?'Tomorrow: '+(tm?HV.esc(tm.name):'not planned'):P?'Tap to pick a dinner':'Loading the plan')+'</span></div>',
      din&&din.thumb?'background-image:url(\''+HV.esc(thumb(din.thumb))+'\')':'');
  }
  function shopCard(){
    var S=d.shop,left=S?S.left:null,body;
    if(S&&left){var open=S.items.filter(function(x){return !x.checked;}),rows='';
      open.slice(0,3).forEach(function(x,i){rows+='<li><i></i><span>'+HV.esc(x.name)+'</span>'+(i===2&&left>3?' <em>+'+(left-3)+'</em>':'')+'</li>';});
      body='<div class="row"><div class="n">'+left+'</div><ul>'+rows+'</ul></div>';}
    else body='<div class="msg">'+(!S?'Loading the list':S.items.length?'All checked off':'Nothing on the list')+'</div>';
    return card('h2-shop','/frame/hv/shopping/',lb('cart','Shopping')+body);
  }
  function mediaCard(){
    if(MUSIC){
      var rooms=(d.music&&d.music.rooms)||[],pl=null;rooms.forEach(function(r){if(!pl&&r.ok&&r.state==='PLAYING'&&r.title)pl=r;});
      return card('h2-ph h2-music','/frame/hv/music/',lb('note','Music')+'<div class="cap"><b>'+(pl?HV.esc(pl.title):'Nothing playing')+'</b><span>'+
        (pl?HV.esc(pl.artist||pl.name):HV.cfg.sonos?rooms.length+' speaker'+(rooms.length===1?'':'s'):'Spotify')+'</span></div>');
    }
    var ps=(d.photos&&d.photos.photos)||[],p0=ps.length?ps[Math.floor((HV.now().getTime()/60000)%ps.length)]:null;
    return card('h2-ph','/frame/hv/photos/',lb('photo','Photos')+'<div class="cap"><b>'+(d.photos?ps.length+' photo'+(ps.length===1?'':'s'):'Loading photos')+'</b></div>',
      p0?'background-image:url(\''+p0.url+'?w=480\')':'');
  }
  // Tomorrow: backpack stickers (from the backpack rules) and the first events
  function tomorrowCard(){
    var t=HV.local(new Date(HV.now().getTime()+864e5)),evs=evsOn(key(t)),bp='',seen={},rows='';
    evs.forEach(function(e){if(HV.isHoliday(e.cal))return;var r=HV.packHit(e.title);if(!r||seen[r.item]||bp.split('<i').length>4)return;seen[r.item]=1;
      bp+='<i style="background:'+(HV.PACK_COLOR[r.icon]||'#8e8e93')+'">'+HV.packIcon(r.icon,'#fff')+'</i>';});
    evs.slice(0,evs.length>3?2:3).forEach(function(e){
      rows+='<div><i style="background:'+HV.calColor(e.cal)+'"></i><span>'+HV.esc(e.title)+'</span>'+(e.all_day?'':' <em>'+HV.hm(new Date(e.start))+'</em>')+'</div>';});
    if(evs.length>3)rows+='<div class="free">+'+(evs.length-2)+' more</div>';
    if(!evs.length)rows='<div class="free">'+(d.frame?'Nothing on the calendar':'Loading')+'</div>';
    return card('h2-tmr','/frame/hv/calendar/',lb('cal','Tomorrow · '+HV.DAYS[t.dow].slice(0,3))+(bp?'<div class="bp">'+bp+'</div>':'')+'<div class="e">'+rows+'</div>');
  }

  grid.onclick=function(e){var a=e.target.closest&&e.target.closest('[data-alerts]');if(a){e.preventDefault();openAlerts();}};
  function render(){
    if(sheet&&sheet.classList.contains('on')&&!alertList().length)closeAlerts();
    grid.innerHTML='<div class="h2-hero">'+heroLeft()+heroRight()+'</div>'+upNext()+homeCard()+tonightCard()+shopCard()+mediaCard()+tomorrowCard();
    clockMode='';tick();drawRail();
  }

  /* ---------- rail: alerts (when Up next is busy), paw (Kitty faces), Timer, Camera, Sleep Mode, Settings ---------- */
  var SLEEP='input_boolean.sleepmode',sleepArm=0;
  function sleepItem(){var r=null;((d.ha&&d.ha.items)||[]).forEach(function(x){if(x.id===SLEEP)r=x;});return r;}
  function sleepWindow(){var t=HV.local();return (t.h===21&&t.mi>=30)||t.h>=22||t.h<3;}
  function buildRail(){
    var h='<button class="b alert" data-go="alerts" aria-label="Weather alerts" style="display:none">'+ic('warn',2.2)+'<i></i></button>'+
      '<button class="b paw" data-go="kids" aria-label="Kids">'+PAW+'</button>'+
      '<button class="b tm" data-go="timer" aria-label="Timer">'+ic('timer',2)+'</button>'+
      (HV.cfg.camera?'<button class="b" data-go="camera" aria-label="'+HV.esc(HV.cfg.camera_name||'Camera')+'">'+ic('cam',2.1)+'</button>':'')+
      (HV.cfg.ha?'<button class="b sleep" data-go="sleep" aria-label="Sleep mode" style="display:none">'+ic('moon',2.1)+'</button>':'')+
      '<div class="sp"></div><button class="b" data-go="settings" aria-label="Settings">'+ic('gear',1.9)+'</button>';
    rail.innerHTML=h;
    rail.onclick=function(e){
      var b=e.target;while(b&&b!==rail&&!b.getAttribute('data-go'))b=b.parentNode;if(!b||b===rail)return;
      var go=b.getAttribute('data-go');
      if(go==='kids')location.href=HV.SCREENS.standby+'?face='+(HV.local().h>=15?'kitty':'kittyam')+'&return=60';   // Kitty today before 3 PM, Kitty tomorrow from 3 PM
      else if(go==='timer')location.href=HV.SCREENS.timer;
      else if(go==='camera')location.href=HV.SCREENS.camera;
      else if(go==='settings')location.href='/frame/hv/settings/';
      else if(go==='sleep')toggleSleep();
      else if(go==='alerts')openAlerts();
    };
  }
  // Sleep Mode (9:30 PM - 3:00 AM): toggles a Home Assistant input_boolean; turning it on asks for a second tap
  function toggleSleep(){
    var it=sleepItem();if(!it)return;
    if(!it.on&&Date.now()-sleepArm>4000){sleepArm=Date.now();HV.toast('Tap again to put the house in Sleep mode');return;}
    sleepArm=0;var want=!it.on;it.on=want;drawRail();
    HV.post('/api/ha/action',{entity:SLEEP,action:want?'on':'off'}).then(function(){HV.toast(want?'Sleep mode on. Good night':'Sleep mode off');
      setTimeout(function(){HVJson('/api/ha/state').then(function(x){d.ha=x;drawRail();},function(){});},800);},
      function(e){it.on=!want;drawRail();HV.toast(e.message);});
  }
  function drawRail(){
    // alert button: only while alerts are active and the Up next card isn't already showing them (a finished timer won)
    var al=rail.querySelector('.alert'),L=alertList();
    if(al){al.style.display=L.length&&!upShowsAlerts?'':'none';
      if(L.length){al.className='b alert '+L[0].color;al.querySelector('i').textContent=L.length>1?L.length:'';}}
    var tm=rail.querySelector('.tm');if(tm)tm.className='b tm'+(timers().length?' run':'');
    var sl=rail.querySelector('.sleep');if(!sl)return;var it=sleepItem();
    sl.style.display=it&&it.avail!==false&&sleepWindow()?'':'none';
    sl.className='b sleep'+(it&&it.on?' on':'');
    sl.innerHTML=ic('moon',2.1,it&&it.on?'currentColor':'none');
  }

  function load(){
    var jobs=[
      HVJson('/api/frame').then(function(x){d.frame=x;},function(){}),
      HVJson('/api/meals/plan').then(function(x){d.plan=x;},function(){}),
      HVJson('/api/meals/shopping').then(function(x){d.shop=x;},function(){}),
      HVJson('/api/storms').then(function(x){d.storms=x;},function(){})
    ];
    if(!MUSIC)jobs.push(HVJson('/api/frame/photos').then(function(x){d.photos=x;},function(){}));
    if(HV.cfg.ha)jobs.push(HVJson('/api/ha/state').then(function(x){d.ha=x;},function(){}));
    if(HV.cfg.ha_alerts)jobs.push(HVJson('/api/ha/alerts').then(function(x){d.alerts=x;},function(){}));
    if(HV.cfg.sonos)jobs.push(HVJson('/api/frame/music').then(function(x){d.music=x;},function(){}));
    return Promise.all(jobs).then(render);
  }
  buildRail();
  // timers start, end or change: redraw (Up next and the rail depend on them); the clock itself ticks every second
  var tsig='';
  HV.on(function(){var s=timers().map(function(x){return x.id+':'+x.ends+':'+(x.ends*1000<=HV.now().getTime()?1:0);}).join(',');
    if(s!==tsig){tsig=s;if(d.frame)render();}});
  setInterval(function(){tick();var s=timers().map(function(x){return x.id+':'+x.ends+':'+(x.ends*1000<=HV.now().getTime()?1:0);}).join(',');if(s!==tsig){tsig=s;render();}},1000);
  render();load();setInterval(load,30000);
  setInterval(drawRail,30000);
})();
