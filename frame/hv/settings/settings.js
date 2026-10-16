/* HomeView Settings: Apple-Settings style grouped list for this frame. Idle choices are stored per frame
   in localStorage "hv-idle" (mode off|photos, minutes 1|3|5|10, slide 15|30|60, shade 0|30|60): hv.js reads
   mode and minutes for the idle jump, Standby reads slide (seconds per photo) and shade (% black over Standby).
   An older saved mode 'dim' counts as 'photos'.
   Everything else that is per house lives in config.json on the server. */
(function(){
  var KEY='hv-idle';
  var settings={mode:'photos',minutes:3,slide:30,shade:0};
  function pick(list,v,d){v=+v;for(var i=0;i<list.length;i++)if(list[i]===v)return v;return d;}
  function valid(s){s=s||{};return {mode:s.mode==='off'?'off':'photos',minutes:pick([1,3,5,10],s.minutes,3),slide:pick([15,30,60],s.slide,30),shade:pick([0,30,60],s.shade,0)};}
  try{settings=valid(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(e){}
  var photoCount=null, avail={};

  function chev(){return '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';}
  function seg(id,opts,cur){
    var h='<div class="st-seg" data-id="'+id+'">';
    opts.forEach(function(o){h+='<button data-v="'+o[0]+'"'+(String(o[0])===String(cur)?' class="on"':'')+'>'+o[1]+'</button>';});
    return h+'</div>';
  }
  function row(label,sub,right,cls){return '<div class="st-row'+(cls?' '+cls:'')+'"><div class="l">'+label+(sub?'<small>'+sub+'</small>':'')+'</div>'+right+'</div>';}
  function grp(title,rows){return '<div class="st-grp"><h4>'+title+'</h4><div class="st-card">'+rows+'</div></div>';}

  function frameInfo(){
    var w=innerWidth,h=innerHeight,big=w>1500;
    return {size:big?'15-inch':'10-inch',res:w+' × '+h};
  }
  function ua(){
    var m=navigator.userAgent.match(/(Chrome|Firefox|Version)\/([\d.]+)/),a=/Android/.test(navigator.userAgent);
    return (a?'Android ':'')+(m?(m[1]==='Version'?'WebView ':m[1]+' ')+m[2].split('.')[0]:'Browser');
  }

  function left(){
    var idleOn=settings.mode!=='off';
    /* Photo interval and Appearance stay live with Stay on: the Standby button still opens Standby */
    var h=grp('When untouched',
      row('Switch to','',seg('mode',[['photos','Standby'],['off','Stay on']],settings.mode))+
      row('After','',seg('minutes',[[1,'1 min'],[3,'3 min'],[5,'5 min'],[10,'10 min']],settings.minutes),idleOn?'':'off')+
      row('Photo interval','Each photo in Standby',seg('slide',[[15,'15 s'],[30,'30 s'],[60,'1 min']],settings.slide))+
      row('Appearance','Standby brightness',seg('shade',[[0,'Normal'],[30,'Softer'],[60,'Dim']],settings.shade)));
    return h;
  }
  /* every HomeView screen, named as its own title reads ('' is the Home launcher). Music only when Sonos or Spotify is set up, Camera only when a camera is. */
  var SCREENS=[
    ['Home',''],['Today','today'],['Calendar','calendar'],['Weather','weather'],['Tonight','dinner'],['Meals','meals'],
    ['Shopping','shopping'],['Timer','timer'],['Music','music'],['Photos','photos'],['Camera','camera'],[HV.cfg.ha_title||'Home Assistant','ha'],['Standby','standby'],['Night','night'],
    ['Background','background'],['Standby faces','faces']
  ].filter(function(x){return (x[1]!=='music'||HV.cfg.sonos||HV.cfg.spotify)&&(x[1]!=='camera'||HV.cfg.camera)&&(x[1]!=='ha'||HV.cfg.ha);});
  /* Weather screen style, per frame (localStorage 'hv-wx'): 'apple' (sky gradient, glass cards) or 'modern' (light card, 24 h chart) */
  function wxStyle(){var v='apple';try{v=localStorage.getItem('hv-wx')||'apple';}catch(e){}return v==='modern'?'modern':'apple';}
  /* "Weekdays · Evening now · 3 faces", from the Standby schedule (faces/sched.js) */
  function schedNow(){if(!window.HVSched)return 'Schedule by day and time';
    var t=HV.local(),a=HVSched.at(HVSched.load(HV.facesOn()),t.dow,t.h*60+t.mi),n=a.block.faces.length;
    return HV.esc(HVSched.daysLabel(a.group.days))+' \u00b7 '+HVSched.blockName(a.block)+' now \u00b7 '+n+' face'+(n===1?'':'s');}
  function right(){
    var h='';
    var w=HV.wall(),wl=w.t==='color'?'Color':w.t==='image'?String(w.id).replace(/\.[a-z]+$/i,'').replace(/[-_]/g,' '):'Auto';
    h+=grp('Look',
      '<a class="st-row st-nav" href="/frame/hv/background/"><div class="l">Background<small>'+(HV.look==='glass'?'Glass':'Light')+' · '+HV.esc(wl)+'</small></div>'+chev()+'</a>'+
      row('Weather style',wxStyle()==='modern'?'24-hour chart, 7 days':'Sky colors, hourly strip, tiles',seg('wx',[['apple','Apple'],['modern','Modern']],wxStyle()))+
      '<a class="st-row st-nav" href="/frame/hv/faces/"><div class="l">Standby faces<small>'+schedNow()+'</small></div>'+chev()+'</a>');
    return h+rightBody();
  }
  function rightBody(){
    var f=frameInfo(),c=HV.cfg,h='';
    h+=grp('This frame',
      row('Screen',HV.esc(ua()),'<span class="v">'+f.size+' \u00b7 '+f.res+'</span>')+
      row('Home',HV.esc(c.place||c.home_name||'Home'),'<span class="v">'+HV.esc(c.timezone||'')+'</span>')+
      row('Photos','<span id="vph">'+(photoCount==null?'...':photoCount+' photos')+'</span>','')+
      row('Music',c.sonos||c.spotify?[c.sonos?'Sonos':'',c.spotify?'Spotify':''].filter(Boolean).join(' and '):'Not set up in config.json','<span class="v">'+(c.sonos||c.spotify?'On':'Off')+'</span>'));
    h+='<p class="st-note">Idle uses touch inactivity. Softer and Dim shade Standby; they do not change the backlight. The night clock shows instead during the times it\u2019s scheduled (Standby faces). Location, calendars, units and music are set in config.json on the server.</p>';
    return h;
  }
  function links(){
    var s='';
    SCREENS.forEach(function(x){
      var up=avail[x[1]];
      s+='<a class="st-link'+(up===false?' off':'')+'" href="/frame/hv/'+(x[1]?x[1]+'/':'')+'">'+x[0]+'</a>';
    });
    return '<h4>Open a screen</h4><div class="st-links">'+s+'</div>';
  }
  function draw(){
    var sx=document.getElementById('colL').scrollTop,rx=document.getElementById('colR').scrollTop;
    document.getElementById('colL').innerHTML=left();document.getElementById('colR').innerHTML=right();document.getElementById('links').innerHTML=links();
    document.getElementById('colL').scrollTop=sx;document.getElementById('colR').scrollTop=rx;
    var p=document.getElementById('pvn');if(p)p.textContent=photoCount==null?'':photoCount+' photos';
    tickClock();
  }
  function tickClock(){var e=document.getElementById('vclock');if(e)e.textContent=HV.hm()+' '+HV.ampm();}
  function save(note){
    try{localStorage.setItem(KEY,JSON.stringify(settings));HV.toast(note||'Saved for this screen');}
    catch(e){HV.toast('Applied for now. Storage is unavailable.');}
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest('.st-seg button');
    if(b){
      var id=b.parentNode.getAttribute('data-id'),v=b.getAttribute('data-v');
      if(id==='wx'){try{localStorage.setItem('hv-wx',v);}catch(x){}HV.toast('Weather: '+(v==='modern'?'Modern':'Apple')+' style');draw();return;}
      var o={};o[id]=id==='mode'?v:+v;settings=valid(Object.assign?Object.assign({},settings,o):merge(settings,o));
      save();draw();return;
    }
    if(e.target.closest('#preview')){location.href='/frame/hv/standby/';return;}
  });
  function merge(a,b){var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=b[k];return o;}

  HV.chrome({light:true});HV.back('Home');
  draw();
  HVJson('/api/frame/photos').then(function(d){photoCount=(d.media||d.photos||[]).length;},function(){}).then(draw);
  /* which screens exist yet */
  SCREENS.forEach(function(x){
    fetch('/frame/hv/'+(x[1]?x[1]+'/':''),{method:'HEAD',cache:'no-store'}).then(function(r){avail[x[1]]=r.ok;draw();},function(){});
  });
  setInterval(tickClock,5000);
})();
