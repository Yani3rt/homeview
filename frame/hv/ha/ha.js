/* Devices: Home Assistant entities from config.json (home_assistant.entities), through the server
   (ha_api.py). ES5 on purpose (old WebView).
   - Tap a light / switch / fan to toggle it; dimmable lights have a brightness button (top right).
   - Tap an automation to enable or disable it; tap a scene or script to run it.
   - Climate: - and + change the setpoint (sent 1.2 s after the last tap); the mode pill picks a mode.
   - Sensors are read-only.
   A tap shows its result at once (optimistic) and is confirmed by the next poll (every 3 s). */
(function(){
  'use strict';
  var list=document.getElementById('list'),sheet=document.getElementById('sheet'),shade=document.getElementById('shade');
  var doc=null,pending={},setT={},setV={},sheetFor=null;
  document.getElementById('title').textContent=HV.cfg.ha_title||'Devices';
  HV.chrome({light:true});HV.back('Home');

  var P={
    bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>',
    plug:'<path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
    fan:'<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4C11 6 13 3.5 15.5 4.5S16 10 12 10.4zM13.6 12c4.4-1 6.9 1 5.9 3.5S14 16 13.6 12zM12 13.6c1 4.4-1 6.9-3.5 5.9S8 14 12 13.6zM10.4 12c-4.4 1-6.9-1-5.9-3.5S10 8 10.4 12z"/>',
    therm:'<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
    play:'<path d="M8 5.5v13l10.5-6.5z"/>',
    auto:'<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
    gauge:'<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l3.5-4.5"/>',
    door:'<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M4 21h16"/><circle cx="14.5" cy="12.5" r=".8"/>',
    motion:'<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v3M8.5 12l2.5-4.5 4 1.5 2 3M11 7.5L8 9.5"/>',
    drop:'<path d="M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5z"/>',
    bolt:'<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    dots:'<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 15.5v.5"/>',
    sun:'<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>'
  };
  function svg(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">'+(P[n]||P.dots)+'</svg>';}
  function icon(it){
    var d=it.domain,dc=it.dc||'';
    if(d==='light')return 'bulb';if(d==='fan')return 'fan';if(d==='switch'||d==='input_boolean')return 'plug';
    if(d==='climate')return 'therm';if(it.kind==='run')return 'play';if(d==='automation')return 'auto';
    if(/door|window|opening|garage/.test(dc))return 'door';if(/motion|occupancy|presence/.test(dc))return 'motion';
    if(/moisture|humidity/.test(dc))return 'drop';if(/temperature/.test(dc))return 'therm';if(/power|energy|current|voltage/.test(dc))return 'bolt';
    return d==='sensor'?'gauge':'dots';
  }
  function mix(it){                               // a tap's result, shown until the server agrees (or 6 s pass)
    var p=pending[it.id];if(!p)return it;
    if(Date.now()>p.until||(p.patch.on!=null&&it.on===p.patch.on)){delete pending[it.id];return it;}
    var o={},k;for(k in it)o[k]=it[k];for(k in p.patch)o[k]=p.patch[k];return o;
  }
  function deg(v){return v==null?'—':v+'°';}
  function modeWord(m){return {heat_cool:'Auto',auto:'Auto',heat:'Heat',cool:'Cool',dry:'Dry',fan_only:'Fan',off:'Off'}[m]||String(m||'').replace(/_/g,' ');}

  function tile(it){
    it=mix(it);
    var k=it.kind,cls='tile k-'+k+' d-'+it.domain+(it.on?' on':'')+(it.avail===false?' off':'');
    if(k==='climate'){
      var sp=setV[it.id]!=null?setV[it.id]:it.set,act=it.action?String(it.action).replace(/_/g,' '):'';
      cls+=(it.mode==='cool'||/cool/.test(it.action||''))?' cool':'';
      var setHtml=sp!=null?'<button data-act="dn" aria-label="Lower">−</button><b>'+deg(sp)+'</b><button data-act="up" aria-label="Raise">+</button>':
        (it.low!=null&&it.high!=null?'<b>'+it.low+'–'+deg(it.high)+'</b>':'<b>—</b>');
      return '<div class="'+cls+'" data-id="'+HV.esc(it.id)+'">'+
        '<div class="top"><div class="ic">'+svg('therm')+'</div><div><div class="nm">'+HV.esc(it.name)+'</div><div class="st">'+HV.esc(act?act.charAt(0).toUpperCase()+act.slice(1):modeWord(it.mode))+'</div></div></div>'+
        (it.modes&&it.modes.length?'<button class="mode" data-act="mode">'+HV.esc(modeWord(it.mode))+'</button>':'')+
        '<div class="row"><div class="cur">'+deg(it.cur)+'<small>now</small></div><div class="set">'+setHtml+'</div></div></div>';
    }
    if(k==='sensor')
      return '<div class="'+cls+'" data-id="'+HV.esc(it.id)+'"><div class="ic">'+svg(icon(it))+'</div><div><div class="val">'+HV.esc(it.state)+'</div><div class="st">'+HV.esc(it.name)+'</div></div></div>';
    return '<div class="'+cls+'" data-id="'+HV.esc(it.id)+'" role="button"><div class="ic">'+svg(icon(it))+'</div>'+
      (it.dimmable&&it.avail!==false?'<button class="more" data-act="dim" aria-label="Brightness">'+svg('sun')+'</button>':'')+
      '<div><div class="nm">'+HV.esc(it.name)+'</div><div class="st">'+HV.esc(it.state)+'</div></div></div>';
  }
  function render(){
    if(!doc)return;
    var sub=document.getElementById('sub');
    document.getElementById('hdr').hidden=!!(doc.enabled&&!doc.error);   // no title or count; shown only for a problem
    if(!doc.enabled){sub.textContent='Not set up';list.innerHTML='<div class="ha-msg">'+HV.esc(doc.error||'')+'</div>';return;}
    var h='',open=false,on=0,n=0;
    (doc.items||[]).forEach(function(it){
      if(it.kind==='section'){if(open)h+='</div>';h+='<div class="ha-sec">'+HV.esc(it.name)+'</div><div class="ha-grid">';open=true;return;}
      if(!open){h+='<div class="ha-grid">';open=true;}
      var m=mix(it);if(m.kind==='toggle'){n++;if(m.on)on++;}
      h+=tile(it);
    });
    if(open)h+='</div>';
    if(!(doc.items||[]).length)h='<div class="ha-msg">'+HV.esc(doc.error||'Nothing to show')+'</div>';
    list.innerHTML=h;
    sub.textContent=doc.error&&(doc.items||[]).length?doc.error:(n?(on?on+' of '+n+' on':'Everything is off'):(doc.items||[]).length+' devices');
  }
  function find(id){var r=null;(doc&&doc.items||[]).forEach(function(it){if(it.id===id)r=it;});return r;}
  function send(id,action,value,patch){
    if(patch){pending[id]={patch:patch,until:Date.now()+6000};render();}
    return HV.post('/api/ha/action',{entity:id,action:action,value:value}).then(function(){setTimeout(poll,400);},
      function(e){delete pending[id];HV.toast(e.message);render();});
  }

  /* climate setpoint: change locally, send after the last tap */
  function nudge(it,dir){
    var cur=setV[it.id]!=null?setV[it.id]:it.set;if(cur==null)return;
    var step=it.step||1,v=Math.round((cur+dir*step)*10)/10;
    if(it.min!=null&&v<it.min)v=it.min;if(it.max!=null&&v>it.max)v=it.max;
    setV[it.id]=v;render();clearTimeout(setT[it.id]);
    setT[it.id]=setTimeout(function(){
      HV.post('/api/ha/action',{entity:it.id,action:'temp',value:v}).then(function(){setTimeout(function(){delete setV[it.id];poll();},1500);},
        function(e){delete setV[it.id];HV.toast(e.message);render();});
    },1200);
  }

  /* sheets */
  function openSheet(html,id){sheetFor=id;sheet.innerHTML=html+'<button class="close" data-sh="close">Close</button>';sheet.classList.add('on');shade.classList.add('on');}
  function closeSheet(){sheetFor=null;sheet.classList.remove('on');shade.classList.remove('on');}
  shade.onclick=closeSheet;
  function dimSheet(it){
    it=mix(it);var h='<h2>'+HV.esc(it.name)+'</h2><div class="ha-opts">';
    [10,25,50,75,100].forEach(function(p){h+='<button data-sh="b" data-v="'+p+'"'+(it.on&&it.pct===p?' class="on"':'')+'>'+p+'%</button>';});
    h+='<button data-sh="off"'+(!it.on?' class="on"':'')+'>Off</button></div>';openSheet(h,it.id);
  }
  function modeSheet(it){
    var h='<h2>'+HV.esc(it.name)+'</h2><div class="ha-opts">';
    (it.modes||[]).forEach(function(m){h+='<button data-sh="m" data-v="'+HV.esc(m)+'"'+(it.mode===m?' class="on"':'')+'>'+HV.esc(modeWord(m))+'</button>';});
    openSheet(h+'</div>',it.id);
  }
  sheet.onclick=function(e){
    var b=e.target.closest('button');if(!b)return;var a=b.getAttribute('data-sh'),it=find(sheetFor);
    if(a==='close'||!it){closeSheet();return;}
    if(a==='b'){var p=+b.getAttribute('data-v');send(it.id,'brightness',p,{on:true,pct:p,state:'On · '+p+'%'});}
    else if(a==='off')send(it.id,'off',null,{on:false,pct:null,state:'Off'});
    else if(a==='m'){var m=b.getAttribute('data-v');send(it.id,'mode',m,{mode:m,on:m!=='off'});}
    closeSheet();
  };

  list.onclick=function(e){
    var t=e.target.closest('.tile');if(!t)return;var it=find(t.getAttribute('data-id'));if(!it||it.avail===false)return;
    var b=e.target.closest('[data-act]'),a=b&&b.getAttribute('data-act');
    if(a==='dim'){dimSheet(it);return;}
    if(a==='mode'){modeSheet(it);return;}
    if(a==='up'||a==='dn'){nudge(it,a==='up'?1:-1);return;}
    var m=mix(it);
    if(it.kind==='toggle')send(it.id,'toggle',null,{on:!m.on,state:m.on?'Off':'On',pct:m.on?null:m.pct});
    else if(it.kind==='automation')send(it.id,m.on?'disable':'enable',null,{on:!m.on,state:m.on?'Disabled':'Enabled'});
    else if(it.kind==='run')send(it.id,'run').then(function(){HV.toast(it.name+': done');});
  };

  var timer=null;
  function poll(){
    clearTimeout(timer);
    if(document.hidden)return;
    HVJson('/api/ha/state').then(function(d){doc=d;render();},function(){document.getElementById('hdr').hidden=false;document.getElementById('sub').textContent='The server is not answering';})
      .then(function(){clearTimeout(timer);timer=setTimeout(poll,3000);});
  }
  document.addEventListener('visibilitychange',function(){if(!document.hidden)poll();});
  poll();
})();
