/* Standby faces (/frame/hv/faces/): the Standby schedule for this frame (faces/sched.js, localStorage 'hv-sched').
   Left: the day groups (tabs), which days each one covers, and its time blocks. Right: the selected block's
   start time and the faces it rotates through, picked in order on the real previews (thumbnails rendered by
   scripts/make_face_thumbs.py into ./thumbs/). Every change saves at once. Severe weather stays a plain
   on/off (HV.setFace('alert')): it is not scheduled, it interrupts while an alert is active. */
(function(){
  var CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var v=Math.floor(Date.now()/3600000);   // thumbnails refresh hourly at most
  var FACES=HV.FACES.filter(function(f){return f[0]!=='alert';});
  var NAME={};HV.FACES.forEach(function(f){NAME[f[0]]=f[1];});
  var KEYS=FACES.map(function(f){return f[0];});
  var S=HVSched.load(HV.facesOn()), G=0, B=0;
  var extra=null;   // a new group still waiting for its first day (not saved until it has one)
  function now(){var t=HV.local();return {dow:t.dow,min:t.h*60+t.mi};}
  function groups(){return extra?S.groups.concat([extra]):S.groups;}
  function grp(){return groups()[G];}
  (function(){var n=now(),a=HVSched.at(S,n.dow,n.min);G=a.g;B=a.b;   // open on what is showing now,
    try{var r=JSON.parse(sessionStorage.getItem('hv-sched-sel')||'null');sessionStorage.removeItem('hv-sched-sel');   // or where a preview left off
      if(r&&S.groups[r[0]]&&S.groups[r[0]].blocks[r[1]]){G=r[0];B=r[1];}}catch(e){}})();
  /* full-screen preview in Standby; a tap there comes back here, to the same group and time */
  function preview(q){try{if(!extra||G<S.groups.length)sessionStorage.setItem('hv-sched-sel',JSON.stringify([G,B]));}catch(e){}
    location.href='/frame/hv/standby/?'+q+'&back=faces';}

  function save(note){
    S=HVSched.normalize({groups:S.groups},KEYS);
    if(!HVSched.save(S))HV.toast('Applied for now. Storage is unavailable.');else if(note)HV.toast(note);
  }
  function range(g,b){var bl=g.blocks[b];
    var end=b+1<g.blocks.length?g.blocks[b+1].start:g.blocks[0].start;
    return HVSched.fmt(bl.start)+' – '+HVSched.fmt(end)+(b+1<g.blocks.length?'':' next day');}
  function otherOf(g){for(var i=0;i<S.groups.length;i++)if(S.groups[i]!==g)return S.groups[i];return S.groups[0];}
  function list(faces){return faces.length?faces.map(function(k){return NAME[k]||k;}).join(', '):'No faces: photos show';}

  function left(){
    var gs=groups(),n=now(),cur=HVSched.at(S,n.dow,n.min),h='<div class="sc-tabs'+(gs.length>2?' many':'')+'">';
    gs.forEach(function(g,i){h+='<button class="sc-tab'+(i===G?' on':'')+'" data-g="'+i+'">'+HV.esc(g.days.length?HVSched.daysLabel(g.days):'New')+'</button>';});
    if(!extra&&gs.length<4)h+='<button class="sc-tab add" data-add-g="1" aria-label="New day group">'+PLUS+'</button>';
    h+='</div><div class="sc-days">';
    [1,2,3,4,5,6,0].forEach(function(d){var inG=grp().days.indexOf(d)>=0;
      h+='<button class="sc-day'+(inG?' on':'')+'" data-d="'+d+'">'+HVSched.SHORT[d]+'</button>';});
    h+='</div><div class="sc-blocks">';
    grp().blocks.forEach(function(bl,i){var live=!extra||G<S.groups.length?(cur.g===G&&cur.b===i):false;
      h+='<button class="sc-blk'+(i===B?' on':'')+'" data-b="'+i+'"><div class="t"><b>'+HVSched.blockName(bl)+'</b>'+(live?'<span class="now">Now</span>':'')+
        '<em>'+range(grp(),i)+'</em></div><div class="f">'+HV.esc(list(bl.faces))+'</div></button>';});
    h+='</div><div class="sc-acts">'+
      (grp().blocks.length<8?'<button class="sc-btn" data-act="addb">'+PLUS+'Add a time</button>':'')+
      (groups().length>1?'<button class="sc-btn" data-act="delg">'+(grp()===extra?'Cancel new schedule':'Merge into '+HV.esc(HVSched.daysLabel(otherOf(grp()).days)))+'</button>':'')+'</div>';
    var on=HV.facesOn();
    h+='<div class="sc-foot"><div class="sc-row"><div class="l"><b>Severe weather</b><small>Interrupts any time while a Severe or Extreme alert is active</small></div>'+
      '<button class="sc-sw'+(on.alert?' on':'')+'" data-act="alert" aria-label="Severe weather face"><i></i></button></div>'+
      (HVSched.saved()?'<button class="sc-link" data-act="reset">Reset to the default schedule</button>':'')+'</div>';
    return h;
  }
  function right(){
    var g=grp(),bl=g.blocks[B],h='';
    var first=B===0, last=B===g.blocks.length-1;
    h+='<div class="sc-head"><div class="nm"><b>'+HVSched.blockName(bl)+'</b><span>'+HV.esc(g.days.length?HVSched.daysLabel(g.days):'Pick days on the left')+' · '+range(g,B)+'</span></div>'+
      '<div class="sc-time"><button data-t="-60">−1h</button><button data-t="-15">−15</button><b class="tnum">'+HVSched.fmt(bl.start)+'</b><button data-t="15">+15</button><button data-t="60">+1h</button></div></div>';
    h+='<div class="sc-hint">Starts at '+HVSched.fmt(bl.start)+'. Tap faces in the order you want them; tap again to take one out.'+
      '<span class="sc-tools"><button class="sc-btn sm" data-act="preview">'+EYE+'Preview</button>'+
      (g.blocks.length>1?'<button class="sc-btn sm" data-act="delb">Remove this time</button>':'')+'</span></div>';
    h+='<div class="sc-grid">';
    FACES.forEach(function(f){var k=f[0],ix=bl.faces.indexOf(k);
      h+='<button class="sc-fc'+(ix>=0?' in':'')+'" data-k="'+k+'"><span class="shot" style="background-image:url(\'/frame/hv/faces/thumbs/'+k+'.jpg?v='+v+'\')">'+
        (ix>=0?'<i class="n">'+(ix+1)+'</i>':'<i class="p">'+PLUS+'</i>')+
        '<span class="pv" data-pv="'+k+'" role="button" aria-label="Preview '+HV.esc(f[1])+'">'+EYE+'</span></span><b>'+HV.esc(f[1])+'</b></button>';});
    return h+'</div>';
  }
  function draw(){
    if(G>=groups().length)G=0;if(B>=grp().blocks.length)B=0;
    var l=document.getElementById('scL'),r=document.getElementById('scR'),ly=l.scrollTop,ry=r.scrollTop;
    l.innerHTML=left();r.innerHTML=right();l.scrollTop=ly;r.scrollTop=ry;
    var n=now(),a=HVSched.at(S,n.dow,n.min);
    var nf=a.block.faces.length;
    document.getElementById('sub').textContent='Showing now: '+HVSched.daysLabel(a.group.days)+' \u00b7 '+HVSched.blockName(a.block)+' ('+(nf?nf+' face'+(nf===1?'':'s'):'photos')+'), until '+HVSched.fmt(HVSched.endOf(S,a.g,a.b))+'. Severe weather and Now Playing still interrupt.';
  }
  function hhmm(m){return Math.floor(m/60)+':'+(m%60<10?'0':'')+m%60;}

  document.addEventListener('click',function(e){
    var pv=e.target.closest('[data-pv]');if(pv){var pk=pv.getAttribute('data-pv');preview('face='+(pk==='photos'?'photo':pk));return;}
    var t=e.target.closest('button');if(!t||t.closest('.hv-chrome,.hv-back'))return;
    var g=grp(),bl=g.blocks[B],x;
    if((x=t.getAttribute('data-g'))!==null){G=+x;var n=now(),c=HVSched.at(S,n.dow,n.min);B=c.g===G?c.b:0;draw();return;}
    if(t.getAttribute('data-add-g')){extra={days:[],blocks:JSON.parse(JSON.stringify(g.blocks))};G=S.groups.length;B=0;
      HV.toast('Tap the days for this new schedule');draw();return;}
    if((x=t.getAttribute('data-d'))!==null){var d=+x,owner=HVSched.groupOf(S,d),mine=g.days.indexOf(d)>=0;
      if(mine){   // take a day out of this group: it goes back to another group
        if(g.days.length===1){HV.toast('Each schedule needs at least one day');return;}
        var to=-1;for(var i=0;i<S.groups.length;i++)if(S.groups[i]!==g){to=i;break;}
        if(to<0){HV.toast('Tap + to give some days their own schedule');return;}
        g.days.splice(g.days.indexOf(d),1);S.groups[to].days.push(d);
        HV.toast(HV.DAYS[d]+' now follows '+HVSched.daysLabel(S.groups[to].days));
      }else{
        var from=S.groups[owner];from.days.splice(from.days.indexOf(d),1);g.days.push(d);
        if(g===extra){S.groups.push(extra);extra=null;}
        if(!from.days.length){S.groups.splice(S.groups.indexOf(from),1);}
        HV.toast(HV.DAYS[d]+' moved to this schedule');
      }
      save();if(!mine)G=HVSched.groupOf(S,d);draw();return;}
    if((x=t.getAttribute('data-b'))!==null){B=+x;draw();return;}
    if((x=t.getAttribute('data-t'))!==null){
      var lo=B>0?g.blocks[B-1].start+15:0, hi=B<g.blocks.length-1?g.blocks[B+1].start-15:1425, ns=Math.max(lo,Math.min(hi,bl.start+(+x)));
      if(ns===bl.start){HV.toast(g.blocks.length>1?'Times stay in order: it can\u2019t pass the next or previous one':'That is as far as it goes');return;}
      bl.start=ns;if(g!==extra)save();draw();return;}
    if((x=t.getAttribute('data-k'))!==null){var ix=bl.faces.indexOf(x);
      if(ix>=0)bl.faces.splice(ix,1);
      else if(x==='night'){if(bl.faces.length)HV.toast('The Night clock shows on its own');bl.faces=['night'];}
      else{if(bl.faces[0]==='night'){bl.faces=[];HV.toast('Night clock taken out: it shows on its own');}bl.faces.push(x);}
      if(g!==extra)save();draw();return;}
    var act=t.getAttribute('data-act');
    if(act==='addb'){   // a new time halfway through the selected block, with the same faces
      var end=B+1<g.blocks.length?g.blocks[B+1].start:g.blocks[0].start+1440, mid=Math.round((bl.start+end)/2/15)*15;
      if(B+1>=g.blocks.length&&mid>=1440){mid=Math.round(g.blocks[0].start/2/15)*15;
        if(mid>=g.blocks[0].start){HV.toast('No room for another time here');return;}
        g.blocks.unshift({start:mid,faces:bl.faces.slice()});B=0;}
      else{if(mid<=bl.start){HV.toast('No room for another time here');return;}
        g.blocks.splice(B+1,0,{start:mid%1440,faces:bl.faces.slice()});B=B+1;}
      if(g!==extra)save('Added '+HVSched.fmt(mid%1440));draw();return;}
    if(act==='delb'){g.blocks.splice(B,1);B=Math.max(0,B-1);if(g!==extra)save('Time removed');draw();return;}
    if(act==='delg'){
      if(g===extra){extra=null;G=0;B=0;draw();return;}
      var dest=otherOf(g);
      g.days.forEach(function(d2){dest.days.push(d2);});S.groups.splice(S.groups.indexOf(g),1);
      save(HVSched.daysLabel(dest.days)+' now covers those days');G=S.groups.indexOf(dest);B=0;draw();return;}
    if(act==='alert'){var on=HV.facesOn();HV.setFace('alert',!on.alert);HV.toast(on.alert?'Severe weather face off':'Severe weather face on');draw();return;}
    if(act==='reset'){HVSched.reset();extra=null;S=HVSched.load(HV.facesOn());var n2=now(),a2=HVSched.at(S,n2.dow,n2.min);G=a2.g;B=a2.b;
      HV.toast('Back to the default schedule');draw();return;}
    if(act==='preview'){var day=g.days.length?g.days[0]:now().dow;preview('at='+day+'-'+hhmm(bl.start));return;}
  });

  HV.chrome({light:HV.look!=='glass'});HV.back('Settings','/frame/hv/settings/');
  draw();
  setInterval(function(){if(!document.querySelector('.hv-toast.on'))draw();},60000);   // keeps "Now" current
})();
