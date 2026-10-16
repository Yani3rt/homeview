/* Household settings (/frame/hv/house/): the part of config.json every frame shares and may edit, through
   GET/POST /api/settings (settings_api.py): home name, place name and units; the quick timer buttons on Tonight (up to four); each
   calendar's name, color and Holidays switch. Each card saves on its own Save button. Secrets never reach here. ES5. */
(function(){
  var D=null, dirty={};
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
    return home+grp('timers','Quick timers on Tonight',t);
  }
  function right(){
    var c='';
    D.calendars.forEach(function(x,i){
      var sw='<div class="hs-sw">';COLORS.concat(COLORS.indexOf(x.color)<0?[x.color]:[]).forEach(function(k){
        sw+='<button data-color="'+k+'" data-ix="'+i+'" style="background:'+k+'"'+(k===x.color?' class="on"':'')+' aria-label="Color"></button>';});sw+='</div>';
      c+='<div class="st-row hs-cal">'+input('calendars','name',x.name,30,i)+seg('hol'+i,[['no','Calendar'],['yes','Holidays']],x.holidays?'yes':'no')+sw+'</div>';});
    if(!D.calendars.length)c='<div class="st-row"><div class="l">No calendars yet<small>Add calendar links in config.json on the server</small></div></div>';
    return grp('calendars','Calendars',c)+'<p class="st-note">Changes show on each frame the next time a screen opens. Holidays calendars show as days off, not events.</p>';
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
      else{D.calendars[+sg.slice(3)].holidays=v==='yes';mark('calendars');}
      draw();return;}
    if(b.getAttribute('data-step')){var x=D.timers[+b.getAttribute('data-ix')];x.seconds=step(x.seconds,+b.getAttribute('data-step'));mark('timers');draw();return;}
    if(b.getAttribute('data-rm')){D.timers.splice(+b.getAttribute('data-rm'),1);mark('timers');draw();return;}
    if(b.getAttribute('data-addtimer')){D.timers.push({label:'Timer',seconds:300});mark('timers');draw();
      var ins=document.querySelectorAll('[data-sec="timers"]');if(ins.length){ins[ins.length-1].focus();ins[ins.length-1].select();}return;}
    if(b.getAttribute('data-color')){D.calendars[+b.getAttribute('data-ix')].color=b.getAttribute('data-color');mark('calendars');draw();return;}
    var sv=b.getAttribute('data-save');
    if(sv){var body={section:sv};
      if(sv==='home'){for(var k in D.home)body[k]=D.home[k];}else body[sv]=D[sv];
      b.disabled=true;
      HV.post('/api/settings',body).then(function(d){D=d;dirty[sv]=false;draw();HV.toast('Saved for every frame');},
        function(err){b.disabled=false;HV.toast(err.message||'Not saved. Try again.');});}
  });

  HV.chrome({light:true});HV.back('Settings','/frame/hv/settings/');
  function load(){HVJson('/api/settings').then(function(d){D=d;draw();},function(){
    document.getElementById('colL').innerHTML='<p class="st-note">The server did not answer. Tap to try again.</p>';
    document.getElementById('colL').onclick=function(){this.onclick=null;load();};});}
  load();
})();
