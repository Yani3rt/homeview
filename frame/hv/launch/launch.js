/* Home launcher (/frame/hv/): live widgets, each opens its full screen. Refreshes every 30 s (ETag'd).
   Layout, 4 x 3:
     [ Today (2 wide)          ] [ Weather  ] [ Outside  ]   (Outside becomes Smart Home when Home Assistant is set up)
     [ Tonight  ] [ Timer      ] [ Shopping ] [ Photos   ]   (Photos becomes Music when Sonos or Spotify is set up)
     [ This week: tomorrow + 6 days, events and dinners   ]
   Standby is the photo chip top right. Timer shows one-tap quick timers (config.json timers) when none is running. ES5. */
(function(){
  var d={frame:null,plan:null,shop:null,music:null,photos:null,ha:null};
  var grid=document.getElementById('grid');
  var MUSIC=!!(HV.cfg.sonos||HV.cfg.spotify);
  var I={
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    fork:'<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-1.7 1.2-2.5 3.5-2.5 6.5V13H16v8"/>',
    timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
    cart:'<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    note:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    photo:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15l3-3 2 2 3-4 3 4"/>',
    air:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
    house:'<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>'
  };
  function ic(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+I[n]+'</svg>';}
  function kind(c){if(c==null)return '';if(c<=1)return 'Clear';if(c===2)return 'Partly cloudy';if(c===3)return 'Cloudy';if(c===45||c===48)return 'Fog';
    if((c>=71&&c<=77)||c===85||c===86)return 'Snow';if(c>=95)return 'Storms';if(c>=51&&c<=57)return 'Drizzle';return 'Rain';}
  function wet(c){return (c>=51&&c<=67)||(c>=80&&c<=82)||c>=95;}   // drizzle, rain, showers, storms
  function key(t){return t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d);}    // a home-time day as 'YYYY-MM-DD'
  function dayKey(iso){return key(HV.local(new Date(iso)));}
  function upcoming(n){
    var now=HV.now().getTime();
    return ((d.frame&&d.frame.calendar_events)||[]).filter(function(e){return new Date(e.end||e.start).getTime()>now&&new Date(e.start).getTime()<now+14*864e5;})
      .sort(function(a,b){return new Date(a.start)-new Date(b.start);}).slice(0,n);
  }
  function when(e){var s=new Date(e.start),day=HV.dayWord(s,true);
    return (day==='Today'?'':day+' ')+(e.all_day?'All day':HV.hm(s)+' '+HV.ampm(s));}
  function thumb(u,size){return u?String(u)+'/'+(size||'medium'):'';}   // TheMealDB serves /small, /medium, /large
  function hm24(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return ((h%12)||12)+':'+m+' '+(h<12?'AM':'PM');}
  function hr(iso){var h=+iso.slice(11,13);return ((h%12)||12)+' '+(h<12?'AM':'PM');}
  function mins(s){return s%60?HV.mmss(s):(s/60)+' min';}
  // a tile; href makes the whole tile a link, tag:'div' for tiles with their own buttons (data-href / data-qt)
  function w(cls,href,label,icon,body,style){
    var a=' class="w '+cls+'"'+(style?' style="'+style+'"':'');
    return (href?'<a'+a+' href="'+href+'">':'<div'+a+' data-href="'+(cls.indexOf('timer')>=0?'/frame/hv/timer/':'/frame/hv/calendar/')+'">')+
      '<div class="lbl">'+ic(icon)+label+'</div>'+body+(href?'</a>':'</div>');
  }

  function todayTile(){
    var up=upcoming(4),tk=key(HV.local()),now=HV.now().getTime(),rows=[],line=false,shown=0,dim='style="color:rgba(235,235,245,.6)"';
    var noCal=!(HV.cfg.calendars||[]).length;
    if(!up.length)return w('today s2','/frame/hv/today/','Today','cal','<div class="line" '+dim+'>'+(noCal?'No calendars yet. Add ICS links in config.json':'Nothing on the calendars for two weeks')+'</div>');
    up.forEach(function(e){
      if(rows.length>=3)return;
      if(!line&&dayKey(e.start)!==tk){line=true;if(rows.length<=1)rows.push('<div class="none">Nothing else today</div>');if(rows.length>=3)return;}
      var s=new Date(e.start).getTime(),m=Math.round((s-now)/60000),em='<em>'+when(e)+'</em>';
      if(!e.all_day&&s<=now)em='<em class="soon">Now</em>';
      else if(!e.all_day&&m<=60)em='<em class="soon">'+HV.hm(new Date(s))+' '+HV.ampm(new Date(s))+' · in '+Math.max(1,m)+' min</em>';
      if(dayKey(e.start)===tk)shown++;
      rows.push('<div class="ev"><i style="background:'+HV.calColor(e.cal)+'"></i><span>'+HV.esc(e.title)+'</span>'+em+'</div>');
    });
    // today's events that did not fit: a "+2 more" top right (they move up as earlier ones end)
    var left=-shown;
    upcoming(60).forEach(function(e){if(dayKey(e.start)===tk)left++;});
    return w('today s2','/frame/hv/today/','Today'+(left>0?'<span class="more">+'+left+' more</span>':''),'cal','<div class="evs">'+rows.join('')+'</div>');
  }

  function weatherTile(wx){
    if(!wx||wx.temp_f==null)return w('wx','/frame/hv/weather/','Weather','sun','<div class="line">'+(d.frame?'The forecast did not load':'Waiting for the forecast')+'</div>');
    var wc=!wx.is_day?' night':(wx.code>=3?' cloud':''),t=HV.local(),nk=key(t)+'T'+HV.pad(t.h);
    var hrs=(wx.hours24||wx.hourly||[]).filter(function(x){return x.t.slice(0,13)>nk;}).slice(0,12);
    var n=wx.nowcast,rainNow=wet(wx.code)||!!(n&&(n.state==='rain'||n.state==='stop')),say='',i;
    if(rainNow){for(i=0;i<hrs.length;i++)if(!wet(hrs[i].code)){say='Rain until '+hr(hrs[i].t);break;}if(!say)say='Rain for hours';}
    else for(i=0;i<hrs.length;i++)if(wet(hrs[i].code)){say='Rain from '+hr(hrs[i].t);break;}
    if(!say)say=kind(wx.code)+' · H '+Math.round(Math.max(wx.hi_f,wx.temp_f))+'° L '+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°';
    var strip='';hrs.slice(0,4).forEach(function(x){strip+='<div'+(wet(x.code)?' class="rain"':'')+'>'+hr(x.t)+'<b>'+Math.round(x.temp_f)+'°</b></div>';});
    return w('wx'+wc,'/frame/hv/weather/','Weather','sun','<div><div class="big">'+Math.round(wx.temp_f)+'°</div><div class="say">'+say+'</div></div>'+(strip?'<div class="hrs">'+strip+'</div>':''));
  }

  // Home Assistant: the indoor temperature and humidity from its sensors; otherwise Outside: air quality and sunrise or sunset
  function homeTile(wx){
    if(HV.cfg.ha){
      var hi=(d.ha&&d.ha.items)||[],tmp=null,hum=null;
      hi.forEach(function(x){if(x.kind!=='sensor')return;
        if(!tmp&&(x.dc==='temperature'||/temp/i.test(x.id)))tmp=x;
        if(!hum&&(x.dc==='humidity'||/humid/i.test(x.id)))hum=x;});
      var num=function(x){var n=x?parseFloat(x.state):NaN;return isNaN(n)?null:n;};
      var tv=num(tmp),hv=num(hum);
      // a soft tint by indoor temperature (in °F; a °C sensor is converted): cold, cool, comfy, warm, hot
      var tf=tv==null?null:(/C/.test(tmp.state)?tv*9/5+32:tv);
      var band=tf==null?'':tf<66?'t-cold':tf<71?'t-cool':tf<76?'t-comfy':tf<80?'t-warm':'t-hot';
      return w('temp '+band,'/frame/hv/ha/',HV.esc(HV.cfg.ha_title||'Smart Home'),'house',!d.ha?'<div class="line">Loading</div>':
        (tv==null&&hv==null)?'<div class="line muted">'+HV.esc(d.ha.error||'No temperature or humidity sensor in the list')+'</div>':
        '<div><div class="big">'+(tv!=null?(Math.round(tv*10)/10)+'°':Math.round(hv)+'%')+'</div><div class="line muted">'+
          (tv!=null&&hv!=null?Math.round(hv)+'% humidity':tv!=null?HV.esc(tmp.name):'Humidity')+(tmp&&hv!=null?' · '+HV.esc(tmp.name):'')+'</div></div>');
    }
    var aq=d.frame&&d.frame.aqi,sun='';
    if(wx&&wx.sunset){var t2=HV.local(),ns=t2.y+'-'+HV.pad(t2.mo)+'-'+HV.pad(t2.d)+'T'+HV.pad(t2.h)+':'+HV.pad(t2.mi);
      sun=ns<wx.sunrise.slice(0,16)?'Sunrise '+hm24(wx.sunrise):ns<wx.sunset.slice(0,16)?'Sunset '+hm24(wx.sunset):wx.next_sunrise?'Sunrise '+hm24(wx.next_sunrise):'';}
    return w('','/frame/hv/weather/','Outside','air','<div>'+(aq&&aq.us_aqi!=null?'<div class="big">'+aq.us_aqi+'</div><div class="line muted">Air quality, '+HV.esc(aq.band||'')+(sun?' · '+sun:'')+'</div>':
      '<div class="line">'+(sun||'Waiting for the forecast')+'</div>')+'</div>');
  }

  function timerBody(){
    var ts=(HV.state.timers||[]).slice().sort(function(a,b){return a.ends-b.ends;}),now=HV.now().getTime()/1000,dim='style="color:rgba(235,235,245,.6)"';
    if(ts.length){var t=ts[0],left=t.ends-now,f=t.total?Math.max(0,Math.min(1,1-left/t.total)):0;
      return '<div><div class="big">'+(left<=0?'Done':HV.mmss(left))+'</div><div class="line" '+dim+'>'+HV.esc(t.label)+(ts.length>1?' · +'+(ts.length-1)+' more':'')+'</div></div>'+
        '<div class="bar"><i style="-webkit-transform:scaleX('+f.toFixed(3)+');transform:scaleX('+f.toFixed(3)+')"></i></div>';}
    var q=(HV.cfg.timers||[]).slice(0,2),b='';   // two big one-tap rows; the Timer screen has the rest
    if(!q.length)return '<div><div class="line" style="font-size:3.4vh">No timers running</div><div class="line" '+dim+'>Tap to start one</div></div>';
    q.forEach(function(x,i){b+='<button data-qt="'+i+'"><span>'+HV.esc(x.label)+'</span><em>'+mins(x.seconds)+'</em></button>';});
    return '<div class="qt">'+b+'</div>';   // tapping anywhere else on the tile opens the Timer screen for other lengths
  }

  function shopTile(){
    var S=d.shop,left=S?S.left:null,body;
    if(S&&left){var open=S.items.filter(function(x){return !x.checked;}),rows='';
      open.slice(0,3).forEach(function(x,i){rows+='<div>'+HV.esc(x.name)+(i===2&&left>3?' <span>+'+(left-3)+' more</span>':'')+'</div>';});
      body='<div class="cnt"><div class="big">'+left+'</div><div class="sub">to buy</div></div><div class="items">'+rows+'</div>';}
    else body='<div><div class="big">'+(S?left:'—')+'</div><div class="line">'+(!S?'Loading the list':S.items.length?'All checked off':'Nothing on the list')+'</div></div>';
    return w(left?'on':'','/frame/hv/shopping/','Shopping','cart',body);
  }

  // This week: tomorrow and the 6 days after, each with up to 2 events and its dinner (or a + Dinner to plan one)
  function weekTile(){
    var P=d.plan,meals=(P&&P.days)||{},evs=(d.frame&&d.frame.calendar_events)||[],now=HV.now().getTime(),h='',j;
    for(j=1;j<=7;j++){
      var k=key(HV.local(new Date(now+j*864e5))),dt=new Date(k+'T12:00:00'),dn=j===1?'Tomorrow':HV.DAYS[dt.getDay()].slice(0,3),meal=meals[k];
      var on=evs.filter(function(e){var s=dayKey(e.start);if(!e.all_day)return s===k;
          var en=e.end?dayKey(e.end):s;return s<=k&&(k<en||s===k);})
        .sort(function(a,b){return (b.all_day?1:0)-(a.all_day?1:0)||new Date(a.start)-new Date(b.start);});
      h+='<div class="d" data-href="/frame/hv/calendar/"><div class="dn">'+dn+'<b>'+(+k.slice(8,10))+'</b></div>';
      on.slice(0,on.length>3?1:2).forEach(function(e){h+='<div class="e"><i style="background:'+HV.calColor(e.cal)+'"></i><span>'+HV.esc(e.title)+'</span></div>';});
      if(on.length>3)h+='<div class="free">+'+(on.length-1)+' more</div>';
      else if(on.length===3)h+='<div class="free">+1 more</div>';
      if(!on.length)h+='<div class="free">Free</div>';
      h+=meal?'<div class="ml set" data-href="/frame/hv/meals/">'+ic('fork')+'<span>'+HV.esc(meal.name)+'</span></div>':
        '<div class="ml add" data-href="/frame/hv/meals/">'+ic('plus')+'<span>Dinner</span></div>';
      h+='</div>';
    }
    return w('week s4',null,'This week','cal','<div class="wk">'+h+'</div>');
  }

  function render(){
    var t=HV.local(),h=t.h,wx=d.frame&&d.frame.weather,P=d.plan,din=P&&P.tonight;
    HV.rainChip(wx&&wx.nowcast);                    // rain soon, left of the camera button
    document.getElementById('hello').textContent=h<5?'Good night':h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    document.getElementById('date').textContent=HV.DAYS[t.dow]+', '+HV.MONTHS[t.mo-1]+' '+t.d;
    var html=todayTile()+weatherTile(wx)+homeTile(wx);
    // Tonight (photo), with tomorrow's dinner as a nudge
    var tm=P&&P.tomorrow,dsub=din?'Tomorrow: '+(tm?tm.name:'not planned'):P?'Tap to pick a dinner':'Loading the plan';
    html+=w('dinner','/frame/hv/'+(din?'dinner/':'meals/'),'Tonight','fork',
      '<div><div class="name">'+(din?HV.esc(din.name):'Nothing planned yet')+'</div><div class="line">'+HV.esc(dsub)+'</div></div>',
      din&&din.thumb?'background-image:url(\''+HV.esc(thumb(din.thumb))+'\')':'');
    html+=w('timer',null,'Timer','timer','<div class="tb">'+timerBody()+'</div>');
    html+=shopTile();
    if(MUSIC){
      var rooms=(d.music&&d.music.rooms)||[],pl=null;rooms.forEach(function(r){if(!pl&&r.ok&&r.state==='PLAYING'&&r.title)pl=r;});
      html+=w('music','/frame/hv/music/','Music','note',pl?'<div><div class="line" style="font-size:3.2vh">'+HV.esc(pl.title)+'</div><div class="line" style="color:rgba(255,255,255,.7)">'+HV.esc(pl.artist||pl.name)+'</div></div>':
        '<div><div class="line">Nothing playing</div><div class="line" style="color:rgba(255,255,255,.7)">'+(HV.cfg.sonos?rooms.length+' speaker'+(rooms.length===1?'':'s'):'Spotify')+'</div></div>');
    }else{
      var ps=(d.photos&&d.photos.photos)||[],p0=ps.length?ps[Math.floor((HV.now().getTime()/60000)%ps.length)]:null;
      html+=w('photos','/frame/hv/photos/','Photos','photo','<div class="line">'+(d.photos?ps.length+' photo'+(ps.length===1?'':'s'):'Loading photos')+'</div>',p0?'background-image:url(\''+p0.url+'?w=480\')':'');
    }
    html+=weekTile();
    grid.innerHTML=html;
  }
  // taps on tiles that hold their own buttons: a quick timer starts at once; anything else follows its data-href
  var busy=false;
  grid.onclick=function(e){
    var el=e.target;while(el&&el!==grid&&!el.getAttribute('data-qt')&&!el.getAttribute('data-href'))el=el.parentNode;
    if(!el||el===grid)return;
    var q=el.getAttribute('data-qt');
    if(q!=null){var x=(HV.cfg.timers||[])[+q];if(!x||busy)return;busy=true;
      HV.post('/api/hv/timer',{action:'start',label:x.label,seconds:x.seconds}).then(function(r){busy=false;
        if(r&&r.timer)HV.state.timers=(HV.state.timers||[]).concat([r.timer]);HV.toast(x.label+' timer started');render();},
        function(er){busy=false;HV.toast(er.message);});
      return;}
    location.href=el.getAttribute('data-href');
  };
  // the running timer counts down every second without redrawing the grid
  setInterval(function(){if(!(HV.state.timers||[]).length)return;var tb=grid.querySelector('.w.timer .tb');if(tb)tb.innerHTML=timerBody();},1000);
  function load(){
    var jobs=[
      HVJson('/api/frame').then(function(x){d.frame=x;},function(){}),
      HVJson('/api/meals/plan').then(function(x){d.plan=x;},function(){}),
      HVJson('/api/meals/shopping').then(function(x){d.shop=x;},function(){}),
      HVJson('/api/frame/photos').then(function(x){d.photos=x;},function(){})
    ];
    if(HV.cfg.ha)jobs.push(HVJson('/api/ha/state').then(function(x){d.ha=x;},function(){}));
    if(HV.cfg.sonos)jobs.push(HVJson('/api/frame/music').then(function(x){d.music=x;},function(){}));
    return Promise.all(jobs).then(render).then(drawSleep).then(drawCool);
  }
  HV.chrome({light:true});   // the Standby chip (photo icon) sits next to the clock
  // Settings chip: a cog, far right of the top-right chips
  (function(){var c=document.querySelector('.hv-chrome');if(!c)return;var a=document.createElement('a');a.className='hv-chip light';a.href='/frame/hv/settings/';a.setAttribute('aria-label','Settings');
    a.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';c.appendChild(a);})();
  /* Sleep mode chip (top right, left of the camera), only 9:30 PM - 3:00 AM home time. Toggles a Home Assistant
     input_boolean that puts the house to sleep. The entity must also be in home_assistant.entities in config.json
     (the server only acts on listed entities). Turning it on asks for a second tap. */
  var SLEEP='input_boolean.sleepmode',sleepChip=null,sleepArm=0;
  function sleepItem(){var r=null;((d.ha&&d.ha.items)||[]).forEach(function(x){if(x.id===SLEEP)r=x;});return r;}
  function sleepWindow(){var t=HV.local();return (t.h===21&&t.mi>=30)||t.h>=22||t.h<3;}
  function drawSleep(){
    if(!HV.cfg.ha)return;
    var c=document.querySelector('.hv-chrome');if(!c)return;
    if(!sleepChip){sleepChip=document.createElement('button');sleepChip.className='hv-chip light hv-sleep';sleepChip.setAttribute('aria-label','Sleep mode');
      var al=c.querySelector('.hv-alert');c.insertBefore(sleepChip,al?al.nextSibling:c.firstChild);
      sleepChip.onclick=function(){
        var it=sleepItem();if(!it)return;
        if(!it.on&&Date.now()-sleepArm>4000){sleepArm=Date.now();HV.toast('Tap again to put the house in Sleep mode');return;}
        sleepArm=0;var want=!it.on;it.on=want;drawSleep();
        HV.post('/api/ha/action',{entity:SLEEP,action:want?'on':'off'}).then(function(){HV.toast(want?'Sleep mode on. Good night':'Sleep mode off');
          setTimeout(function(){HVJson('/api/ha/state').then(function(x){d.ha=x;drawSleep();},function(){});},800);},
          function(e){it.on=!want;drawSleep();HV.toast(e.message);});
      };}
    var it=sleepItem();
    sleepChip.style.display=it&&it.avail!==false&&sleepWindow()?'':'none';
    sleepChip.classList.toggle('on',!!(it&&it.on));
    sleepChip.innerHTML='<svg viewBox="0 0 24 24" fill="'+(it&&it.on?'currentColor':'none')+'" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  }
  setInterval(drawSleep,30000);

  /* "Cooler outside" chip (left of the camera): only while it is 3°+ cooler outside than the Home Assistant indoor
     temperature, not raining or about to, and 60°+ out. Same rule as the Weather screen. Tap: Weather. */
  var coolChip=null;
  function coolNow(){
    var w=d.frame&&d.frame.weather,xs=(d.ha&&d.ha.items)||[],it=null,i;
    if(!w||w.temp_f==null)return null;
    for(i=0;i<xs.length;i++)if(xs[i].kind==='sensor'&&(xs[i].dc==='temperature'||/temp/i.test(xs[i].id))){it=xs[i];break;}
    if(!it)return null;var inF=parseFloat(it.state);if(isNaN(inF))return null;if(/C/.test(it.state))inF=inF*9/5+32;
    var n=w.nowcast,wet=(n&&(n.state==='rain'||n.state==='stop'||(n.state==='start'&&n.mins<=120)))||w.code>=51;
    return !wet&&w.temp_f<=inF-3&&w.temp_f>=60?{out:w.temp_f,inF:inF}:null;
  }
  function drawCool(){
    if(!HV.cfg.ha)return;
    var c=document.querySelector('.hv-chrome');if(!c)return;
    if(!coolChip){coolChip=document.createElement('a');coolChip.className='hv-chip hv-cool';coolChip.href='/frame/hv/weather/';
      var after=c.querySelector('.hv-sleep')||c.querySelector('.hv-alert');c.insertBefore(coolChip,after?after.nextSibling:c.firstChild);}
    var x=coolNow();
    coolChip.style.display=x?'':'none';
    if(x)coolChip.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/></svg>'+
      'Cooler outside \u00b7 '+Math.round(x.out)+'\u00b0';
  }
  HV.on(function(){if(d.frame)render();});
  render();load();setInterval(load,30000);
})();
