/* Household settings (/frame/hv/house/): the part of config.json every frame shares and may edit, through
   GET/POST /api/settings (settings_api.py): home name, place name and units; the quick timer buttons on Tonight and the Timer screen (up to four); each
   calendar's name, color and Holidays switch; the backpack rules for Standby's Tomorrow and Today board faces
   (config.json "backpack"; the built-in list until the first save); and the tropical storm watch (config.json "storms"). Each card saves on its own Save button, and a
   save only replaces that card's values. Secrets never reach here. ES5. */
(function(){
  var D=null, dirty={}, openRule=-1;
  /* the backpack icons and colors, as Standby draws them (HV.PACK_ICONS / HV.PACK_COLOR in hv.js) */
  var PACK_ICONS={
    coin:'<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.2 0-2.2-.6-2.7-1.6M12 6.4V8M12 16v1.6"/>',
    book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    shoe:'<path d="M3 16.5h18V19H3zM3 16.5V9l4 1 3 3 6 1.2c2.6.5 5 1.4 5 2.3"/>',
    music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    art:'<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5S13 18 13 17s.8-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z"/><path d="M7.5 11h.01M10 7h.01M15 7h.01"/>',
    shirt:'<path d="M8 3L3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
    bus:'<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3M8 14.5h.01M16 14.5h.01"/>',
    home:'<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    bag:'<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    star:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z"/>'};
  var PACK_COLOR={coin:'#ffb340',book:'#64d2ff',shoe:'#30d158',music:'#bf5af2',art:'#ff6482',shirt:'#ff9f0a',bus:'#ffd60a',home:'#8e8e93',bag:'#5ac8fa',star:'#ffd60a'};
  var ICON_ORDER=['coin','book','shoe','bus','star','shirt','art','music','home','bag'];
  function ico(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(PACK_ICONS[k]||PACK_ICONS.star)+'</svg>';}
  function words(m){return String(m||'').split('|').map(function(w){return w.trim();}).filter(Boolean).join(', ');}
  var COLORS=['#ff9f0a','#ff3b30','#ff2d55','#bf5af2','#5e5ce6','#0a84ff','#64d2ff','#30b0c7','#34c759','#a2845e','#8e8e93'];
  var STEPS=[1,2,3,4,5,6,7,8,9,10,12,15,18,20,25,30,40,45,60,75,90,120,150,180,240];   // minutes
  function esc(s){return HV.esc(String(s==null?'':s));}
  function seg(id,opts,cur){var h='<div class="st-seg" data-id="'+id+'">';
    opts.forEach(function(o){h+='<button data-v="'+o[0]+'"'+(o[0]===cur?' class="on"':'')+'>'+o[1]+'</button>';});return h+'</div>';}
  function row(label,right,cls){return '<div class="st-row'+(cls?' '+cls:'')+'"><div class="l">'+label+'</div>'+right+'</div>';}
  function grp(id,title,rows){return '<div class="st-grp"><h4>'+title+'<button class="st-btn blue" data-save="'+id+'"'+(dirty[id]?'':' disabled')+'>Save</button></h4><div class="st-card">'+rows+'</div></div>';}
  function input(sec,field,val,max,ix){return '<input class="hs-in" data-sec="'+sec+'" data-f="'+field+'"'+(ix!=null?' data-ix="'+ix+'"':'')+' maxlength="'+max+'" value="'+esc(val)+'" autocomplete="off">';}
  function dur(s){var m=Math.round(s/60);if(s<60)return s+' s';if(m<60)return m+' min';var h=Math.floor(m/60),r=m%60;return h+' h'+(r?' '+r:'');}

  function left(){
    var h=D.home,t='';
    var home=grp('home','Home',
      row('Name',input('home','home_name',h.home_name,40),'hs-row')+
      row('Place',input('home','place',h.place,40),'hs-row')+
      row('Temperature',seg('temperature',[['fahrenheit','°F'],['celsius','°C']],h.temperature))+
      row('Wind',seg('wind',[['mph','mph'],['kmh','km/h'],['ms','m/s'],['kn','knots']],h.wind)));
    D.timers.forEach(function(x,i){
      t+='<div class="st-row">'+input('timers','label',x.label,20,i)+
        '<div class="hs-tm"><button data-step="-1" data-ix="'+i+'" aria-label="Shorter">−</button><b class="tnum">'+dur(x.seconds)+'</b><button data-step="1" data-ix="'+i+'" aria-label="Longer">+</button></div>'+
        '<button class="hs-x" data-rm="'+i+'" aria-label="Remove '+esc(x.label)+'">×</button></div>';});
    if(D.timers.length<4)t+='<button class="st-row hs-add" data-addtimer="1">Add a timer</button>';
    return home+grp('timers','Quick timers \u00b7 Tonight and Timer',t)+storms();
  }
  /* hurricane watch (storms_api.py): which oceans, how far away a storm shows, and how close counts as near */
  var OCEANS=[['AL','Atlantic','Gulf and Caribbean too'],['EP','Eastern Pacific','Mexico\u2019s Pacific coast'],['CP','Central Pacific','Hawaii']];
  var MILES=[50,100,150,200,250,300,400,500,600,750,1000,1250,1500,2000,2500,3000,4000,5000];
  function miles(id,v){return '<div class="hs-tm"><button data-mi="'+id+'" data-d="-1" aria-label="Closer">\u2212</button><b class="tnum">'+String(v).replace(/\B(?=(\d{3})+$)/g,',')+' mi</b><button data-mi="'+id+'" data-d="1" aria-label="Farther">+</button></div>';}
  function storms(){
    var s=D.storms,h=row('Storm cards',seg('stormon',[['no','Off'],['yes','On']],s.enabled?'yes':'no'));
    if(s.enabled){
      OCEANS.forEach(function(o){h+=row(o[1]+'<small>'+o[2]+'</small>',seg('ocean'+o[0],[['no','No'],['yes','Watch']],s.basins.indexOf(o[0])>=0?'yes':'no'));});
      h+=row('Show storms within<small>Miles from home</small>',miles('radius_mi',s.radius_mi))+
        row('Near<small>Checked every hour when this close</small>',miles('near_mi',s.near_mi));}
    return grp('storms','Tropical storms',h)+'<p class="st-note">Storms from the National Hurricane Center show on Weather, nearest first.</p>';
  }
  function right(){
    var c='';
    D.calendars.forEach(function(x,i){
      var sw='<div class="hs-sw">';COLORS.concat(COLORS.indexOf(x.color)<0?[x.color]:[]).forEach(function(k){
        sw+='<button data-color="'+k+'" data-ix="'+i+'" style="background:'+k+'"'+(k===x.color?' class="on"':'')+' aria-label="Color"></button>';});sw+='</div>';
      c+='<div class="st-row hs-cal">'+input('calendars','name',x.name,30,i)+seg('hol'+i,[['no','Calendar'],['yes','Holidays']],x.holidays?'yes':'no')+sw+'</div>';});
    if(!D.calendars.length)c='<div class="st-row"><div class="l">No calendars yet<small>Add calendar links in config.json on the server</small></div></div>';
    return grp('calendars','Calendars',c)+backpack()+'<p class="st-note">Changes show on each frame the next time a screen opens. Holidays calendars show as days off, not events.</p>';
  }
  /* one summary row per rule; tapping it opens that rule's editor (one at a time) */
  function backpack(){
    var h='';
    if(D.backpack_default)h+='<div class="st-row hs-bp-note"><div class="l">The built-in list<small>Change anything and save to make it yours</small></div></div>';
    D.backpack.forEach(function(r,i){
      var ic='<span class="hs-ic" style="background:'+(PACK_COLOR[r.icon]||PACK_COLOR.star)+'">'+ico(r.icon)+'</span>';
      if(i!==openRule){
        h+='<button class="st-row hs-bp" data-rule="'+i+'">'+ic+'<div class="l">'+esc(r.item||'New item')+
          '<small>'+(r.off?'Day off \u00b7 ':'')+'When the calendar says '+esc(words(r.match)||'\u2026')+(r.note?' \u00b7 '+esc(r.note):'')+'</small></div>'+
          '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>';
        return;}
      var pick='<div class="hs-icons">';ICON_ORDER.forEach(function(k){
        pick+='<button data-icon="'+k+'" data-ix="'+i+'" style="color:'+PACK_COLOR[k]+'"'+(k===r.icon?' class="on"':'')+' aria-label="'+k+'">'+ico(k)+'</button>';});pick+='</div>';
      h+='<div class="hs-bp-ed">'+
        '<div class="hs-f">'+ic+input('backpack','item',r.item,40,i)+'<button class="hs-x" data-rmrule="'+i+'" aria-label="Remove rule">\u00d7</button></div>'+
        '<label class="hs-f"><span class="hs-lb">When the calendar says</span><input class="hs-in" data-sec="backpack" data-f="match" data-ix="'+i+'" maxlength="80" value="'+esc(words(r.match))+'" placeholder="PE, gym" autocomplete="off"></label>'+
        '<label class="hs-f"><span class="hs-lb">Note</span><input class="hs-in" data-sec="backpack" data-f="note" data-ix="'+i+'" maxlength="60" value="'+esc(r.note)+'" placeholder="Optional" autocomplete="off"></label>'+
        pick+
        '<div class="hs-f"><span class="hs-lb">Day off, no backpack</span>'+seg('off'+i,[['no','No'],['yes','Yes']],r.off?'yes':'no')+'<button class="st-btn blue hs-done" data-rule="-1">Done</button></div>'+
        '</div>';});
    if(D.backpack.length<30)h+='<button class="st-row hs-add" data-addrule="1">Add a rule</button>';
    if(!D.backpack_default)h+='<button class="st-row hs-reset" data-resetbp="1">Go back to the built-in list</button>';
    return grp('backpack','Backpack',h)+'<p class="st-note">A calendar event with one of these words puts the item on Standby\u2019s Tomorrow and Today board faces. Separate words with commas.</p>';
  }
  function draw(){
    var a=document.getElementById('colL'),b=document.getElementById('colR'),sa=a.scrollTop,sb=b.scrollTop;
    a.innerHTML=left();b.innerHTML=right();a.scrollTop=sa;b.scrollTop=sb;
  }
  function mark(sec){if(!dirty[sec]){dirty[sec]=true;var b=document.querySelector('[data-save="'+sec+'"]');if(b)b.disabled=false;}}
  function step(s,d){var m=s/60,i=0;
    if(d>0){while(i<STEPS.length&&STEPS[i]<=m)i++;return STEPS[Math.min(i,STEPS.length-1)]*60;}
    i=STEPS.length-1;while(i>=0&&STEPS[i]>=m)i--;return STEPS[Math.max(i,0)]*60;}

  document.addEventListener('input',function(e){var t=e.target;if(!t.getAttribute('data-sec'))return;
    var sec=t.getAttribute('data-sec'),f=t.getAttribute('data-f'),ix=t.getAttribute('data-ix');
    if(sec==='home')D.home[f]=t.value;else D[sec][+ix][f]=t.value;mark(sec);});
  document.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b||b.disabled)return;
    var sg=b.parentNode.getAttribute('data-id');
    if(sg){var v=b.getAttribute('data-v');
      if(sg==='temperature'||sg==='wind'){D.home[sg]=v;mark('home');}
      else if(sg==='stormon'){D.storms.enabled=v==='yes';mark('storms');}
      else if(sg.indexOf('ocean')===0){var bs=D.storms.basins,oc=sg.slice(5),oi=bs.indexOf(oc);if(v==='yes'&&oi<0)bs.push(oc);if(v==='no'&&oi>=0)bs.splice(oi,1);mark('storms');}
      else if(sg.indexOf('off')===0){var rr=D.backpack[+sg.slice(3)];if(v==='yes')rr.off=true;else delete rr.off;mark('backpack');}
      else{D.calendars[+sg.slice(3)].holidays=v==='yes';mark('calendars');}
      draw();return;}
    if(b.getAttribute('data-step')){var x=D.timers[+b.getAttribute('data-ix')];x.seconds=step(x.seconds,+b.getAttribute('data-step'));mark('timers');draw();return;}
    if(b.getAttribute('data-mi')){var mk=b.getAttribute('data-mi'),mv=D.storms[mk],md=+b.getAttribute('data-d'),mj=0;
      if(md>0){while(mj<MILES.length&&MILES[mj]<=mv)mj++;mv=MILES[Math.min(mj,MILES.length-1)];}
      else{mj=MILES.length-1;while(mj>=0&&MILES[mj]>=mv)mj--;mv=MILES[Math.max(mj,0)];}
      D.storms[mk]=Math.max(mk==='radius_mi'?250:50,mv);
      if(D.storms.near_mi>D.storms.radius_mi)D.storms.near_mi=D.storms.radius_mi;   // near never reaches past the show distance
      mark('storms');draw();return;}
    if(b.getAttribute('data-rm')){D.timers.splice(+b.getAttribute('data-rm'),1);mark('timers');draw();return;}
    if(b.getAttribute('data-addtimer')){D.timers.push({label:'Timer',seconds:300});mark('timers');draw();
      var ins=document.querySelectorAll('[data-sec="timers"]');if(ins.length){ins[ins.length-1].focus();ins[ins.length-1].select();}return;}
    if(b.getAttribute('data-rule')){openRule=+b.getAttribute('data-rule');draw();
      if(openRule>=0){var it=document.querySelector('[data-sec="backpack"][data-f="item"]');if(it&&it.scrollIntoView)it.scrollIntoView(false);}return;}
    if(b.getAttribute('data-icon')){D.backpack[+b.getAttribute('data-ix')].icon=b.getAttribute('data-icon');mark('backpack');draw();return;}
    if(b.getAttribute('data-rmrule')){D.backpack.splice(+b.getAttribute('data-rmrule'),1);openRule=-1;mark('backpack');draw();return;}
    if(b.getAttribute('data-addrule')){D.backpack.push({match:'',item:'',note:'',icon:'star'});openRule=D.backpack.length-1;mark('backpack');draw();
      var ni=document.querySelector('[data-sec="backpack"][data-f="item"]');if(ni){if(ni.scrollIntoView)ni.scrollIntoView(false);ni.focus();}return;}
    if(b.getAttribute('data-resetbp')){   // two taps, no confirm(): the frame's WebView may not show dialogs
      if(!b.getAttribute('data-sure')){b.setAttribute('data-sure','1');b.textContent='Tap again to replace your rules';return;}
      HV.post('/api/settings',{section:'backpack',reset:true}).then(function(d){D.backpack=d.backpack;D.backpack_default=d.backpack_default;dirty.backpack=false;openRule=-1;draw();HV.toast('Back to the built-in list');},
        function(err){HV.toast(err.message||'Not saved. Try again.');});return;}
    if(b.getAttribute('data-color')){D.calendars[+b.getAttribute('data-ix')].color=b.getAttribute('data-color');mark('calendars');draw();return;}
    var sv=b.getAttribute('data-save');
    if(sv){var body={section:sv};
      if(sv==='home'){for(var k in D.home)body[k]=D.home[k];}else if(sv==='storms'){for(var q in D.storms)body[q]=D.storms[q];}else body[sv]=D[sv];
      b.disabled=true;
      HV.post('/api/settings',body).then(function(d){D[sv]=d[sv];if(sv==='backpack'){D.backpack_default=d.backpack_default;openRule=-1;}
          dirty[sv]=false;draw();HV.toast('Saved for every frame');},
        function(err){b.disabled=false;HV.toast(err.message||'Not saved. Try again.');});}
  });

  HV.chrome({light:true});HV.back('Settings','/frame/hv/settings/');
  function load(){HVJson('/api/settings').then(function(d){D=d;draw();},function(){
    document.getElementById('colL').innerHTML='<p class="st-note">The server did not answer. Tap to try again.</p>';
    document.getElementById('colL').onclick=function(){this.onclick=null;load();};});}
  load();
})();
