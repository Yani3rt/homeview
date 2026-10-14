/* Home launcher (/frame/hv/): live widgets, each opens its full screen. Refreshes every 30 s (ETag'd).
   Layout, 4 x 3:
     [ Today (2 wide)          ] [ Tonight (tall) ] [ Weather  ]
     [ Calendar ] [ Timer      ] [                ] [ Shopping ]
     [ Meals    ] [ Music      ] [ Photos         ] [ Outside  ]
   Music becomes a Standby tile when neither Sonos nor Spotify is set up in config.json. ES5. */
(function(){
  var d={frame:null,plan:null,shop:null,music:null,photos:null};
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
    book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    air:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  function ic(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+I[n]+'</svg>';}
  function kind(c){if(c==null)return '';if(c<=1)return 'Clear';if(c===2)return 'Partly cloudy';if(c===3)return 'Cloudy';if(c===45||c===48)return 'Fog';
    if((c>=71&&c<=77)||c===85||c===86)return 'Snow';if(c>=95)return 'Storms';if(c>=51&&c<=57)return 'Drizzle';return 'Rain';}
  function upcoming(n){
    var now=HV.now().getTime();
    return ((d.frame&&d.frame.calendar_events)||[]).filter(function(e){return new Date(e.end||e.start).getTime()>now&&new Date(e.start).getTime()<now+14*864e5;})
      .sort(function(a,b){return new Date(a.start)-new Date(b.start);}).slice(0,n);
  }
  function when(e){var s=new Date(e.start),day=HV.dayWord(s,true);
    return (day==='Today'?'':day+' ')+(e.all_day?'All day':HV.hm(s)+' '+HV.ampm(s));}
  function thumb(u,size){return u?String(u)+'/'+(size||'medium'):'';}   // TheMealDB serves /small, /medium, /large
  function hm24(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return ((h%12)||12)+':'+m+' '+(h<12?'AM':'PM');}
  function w(cls,href,label,icon,body,style){
    return '<a class="w '+cls+'" href="'+href+'"'+(style?' style="'+style+'"':'')+'><div class="lbl">'+ic(icon)+label+'</div>'+body+'</a>';
  }

  function render(){
    var t=HV.local(),h=t.h,wx=d.frame&&d.frame.weather,up=upcoming(3),P=d.plan,din=P&&P.tonight;
    document.getElementById('hello').textContent=h<5?'Good night':h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    document.getElementById('date').textContent=HV.DAYS[t.dow]+', '+HV.MONTHS[t.mo-1]+' '+t.d;
    var html='';
    // Today
    var evs='';up.forEach(function(e){evs+='<div class="ev"><i style="background:'+HV.calColor(e.cal)+'"></i><span>'+HV.esc(e.title)+'</span><em>'+when(e)+'</em></div>';});
    var noCal=!(HV.cfg.calendars||[]).length;
    html+=w('today s2','/frame/hv/today/','Today','cal',(evs||'<div class="line" style="color:rgba(235,235,245,.6)">'+(noCal?'No calendars yet. Add ICS links in config.json':'Nothing on the calendars for two weeks')+'</div>'));
    // Tonight (tall, photo)
    var dsub=din?[din.category,din.area].filter(Boolean).join(' · ')||'Tap to start cooking':P?'Tap to pick a dinner':'Loading the plan';
    html+=w('dinner r2','/frame/hv/'+(din?'dinner/':'meals/'),'Tonight','fork',
      '<div><div class="name">'+(din?HV.esc(din.name):'Nothing planned yet')+'</div><div class="line" style="color:rgba(255,255,255,.75)">'+HV.esc(dsub)+'</div></div>',
      din&&din.thumb?'background-image:url(\''+HV.esc(thumb(din.thumb))+'\')':'');
    // Weather
    if(wx&&wx.temp_f!=null){var wc=!wx.is_day?' night':(wx.code>=3?' cloud':'');
      html+=w('wx'+wc,'/frame/hv/weather/','Weather','sun','<div><div class="big">'+Math.round(wx.temp_f)+'°</div><div class="line">'+kind(wx.code)+' · H '+Math.round(Math.max(wx.hi_f,wx.temp_f))+'° L '+Math.round(Math.min(wx.lo_f,wx.temp_f))+'°</div></div>');}
    else html+=w('wx','/frame/hv/weather/','Weather','sun','<div class="line">'+(d.frame?'The forecast did not load':'Waiting for the forecast')+'</div>');
    // Calendar: next 7 days count
    var week=0,now=HV.now().getTime();((d.frame&&d.frame.calendar_events)||[]).forEach(function(e){var s=new Date(e.start).getTime();if(s>now-864e5&&s<now+7*864e5)week++;});
    html+=w('','/frame/hv/calendar/','Calendar','cal','<div><div class="big">'+week+'</div><div class="line muted">event'+(week===1?'':'s')+' in the next 7 days</div></div>');
    // Timer
    var ts=(HV.state.timers||[]).slice().sort(function(a,b){return a.ends-b.ends;}),tnow=HV.now().getTime()/1000;
    html+=w('timer','/frame/hv/timer/','Timer','timer',ts.length?'<div><div class="big">'+(ts[0].ends<=tnow?'Done':HV.mmss(ts[0].ends-tnow))+'</div><div class="line" style="color:rgba(235,235,245,.6)">'+HV.esc(ts[0].label)+(ts.length>1?' · +'+(ts.length-1)+' more':'')+'</div></div>':'<div><div class="line" style="font-size:3.4vh">No timers running</div><div class="line" style="color:rgba(235,235,245,.6)">Tap to start one</div></div>');
    // Shopping
    var S=d.shop,left=S?S.left:null;
    html+=w(left?'on':'','/frame/hv/shopping/','Shopping','cart','<div><div class="big">'+(S?left:'—')+'</div><div class="line">'+(!S?'Loading the list':left?'to buy for '+S.meals.length+' dinner'+(S.meals.length===1?'':'s'):S.items.length?'All checked off':'Plan dinners to build a list')+'</div></div>');
    // Meals
    var planned=P?P.planned_7:0;
    html+=w('','/frame/hv/meals/','Meals','book','<div><div class="big">'+planned+'<span style="font-size:3.4vh;color:var(--ink-3)"> / 7</span></div><div class="line muted">dinners planned, next 7 days</div></div>');
    // Music, or Standby when no music is set up
    if(MUSIC){
      var rooms=(d.music&&d.music.rooms)||[],pl=null;rooms.forEach(function(r){if(!pl&&r.ok&&r.state==='PLAYING'&&r.title)pl=r;});
      html+=w('music','/frame/hv/music/','Music','note',pl?'<div><div class="line" style="font-size:3.2vh">'+HV.esc(pl.title)+'</div><div class="line" style="color:rgba(255,255,255,.7)">'+HV.esc(pl.artist||pl.name)+'</div></div>':
        '<div><div class="line">Nothing playing</div><div class="line" style="color:rgba(255,255,255,.7)">'+(HV.cfg.sonos?rooms.length+' speaker'+(rooms.length===1?'':'s'):'Spotify')+'</div></div>');
    }else html+=w('timer','/frame/hv/standby/','Standby','clock','<div><div class="big">'+HV.hm()+'</div><div class="line" style="color:rgba(235,235,245,.6)">Clock faces and photos</div></div>');
    // Photos
    var ps=(d.photos&&d.photos.photos)||[],p0=ps.length?ps[Math.floor((HV.now().getTime()/60000)%ps.length)]:null;
    html+=w('photos','/frame/hv/photos/','Photos','photo','<div class="line">'+(d.photos?ps.length+' photo'+(ps.length===1?'':'s'):'Loading photos')+'</div>',p0?'background-image:url(\''+p0.url+'?w=480\')':'');
    // Outside: air quality and the next sunrise or sunset
    var aq=d.frame&&d.frame.aqi,sun='';
    if(wx&&wx.sunset){var t2=HV.local(),ns=t2.y+'-'+HV.pad(t2.mo)+'-'+HV.pad(t2.d)+'T'+HV.pad(t2.h)+':'+HV.pad(t2.mi);
      sun=ns<wx.sunrise.slice(0,16)?'Sunrise '+hm24(wx.sunrise):ns<wx.sunset.slice(0,16)?'Sunset '+hm24(wx.sunset):wx.next_sunrise?'Sunrise '+hm24(wx.next_sunrise):'';}
    html+=w('','/frame/hv/weather/','Outside','air','<div>'+(aq&&aq.us_aqi!=null?'<div class="big">'+aq.us_aqi+'</div><div class="line muted">Air quality, '+HV.esc(aq.band||'')+(sun?' · '+sun:'')+'</div>':
      '<div class="line">'+(sun||'Waiting for the forecast')+'</div>')+'</div>');
    grid.innerHTML=html;
  }
  function load(){
    var jobs=[
      HVJson('/api/frame').then(function(x){d.frame=x;},function(){}),
      HVJson('/api/meals/plan').then(function(x){d.plan=x;},function(){}),
      HVJson('/api/meals/shopping').then(function(x){d.shop=x;},function(){}),
      HVJson('/api/frame/photos').then(function(x){d.photos=x;},function(){})
    ];
    if(HV.cfg.sonos)jobs.push(HVJson('/api/frame/music').then(function(x){d.music=x;},function(){}));
    return Promise.all(jobs).then(render);
  }
  HV.chrome({light:true});
  // Settings chip next to the clock (Background lives under Settings)
  (function(){var c=document.querySelector('.hv-chrome');if(!c)return;var a=document.createElement('a');a.className='hv-chip light';a.href='/frame/hv/settings/';a.setAttribute('aria-label','Settings');
    a.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></svg>';c.insertBefore(a,c.firstChild);})();
  HV.on(function(){if(d.frame)render();});
  render();load();setInterval(load,30000);
})();
