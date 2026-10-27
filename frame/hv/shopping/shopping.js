/* Shopping: what the household adds by hand (and taps in Buy again), newest on top. With shopping.from_meals
   on in config.json it also lists what the planned dinners need, merged, with a 7 / 14 days choice. ES5.
   Reads : GET /api/meals/shopping?days=7|14  {start, end, meals, items:[{key, name, amount, meals, added, checked}], left}
   Writes: POST /api/meals/shopping {key, checked} | {add:name} | {remove:key} | {clear_checked:true}
           (shared by every frame; clearing drops checked hand-added items) */
(function(){
  var root=document.getElementById('root'),esc=HV.esc;
  var CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var RM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ADD='<form class="af" id="af" autocomplete="off"><input id="ai" maxlength="60" placeholder="Add an item" enterkeyhint="done"><button class="hv-pill primary" type="submit">Add</button></form>';
  var days=/[?&]days=14/.test(location.search)?14:7,D=null,busy=false,ST=[],editST=false;
  var PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var TICK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  /* - n + for a hand-added item; going below 1 takes it off the list */
  function stepper(x){
    var q=x.qty||1;
    return '<div class="qs"><button data-q="'+esc(x.key)+'" data-d="-1" aria-label="One less">\u2212</button><b class="tnum">'+q+'</b>'+
      '<button data-q="'+esc(x.key)+'" data-d="1" aria-label="One more">+</button></div>';
  }
  /* Buy again: tap a card to put a usual item on the list (and, through the server, in Reminders). The card fades
     out and stays hidden while the item is on the list; the count is changed on the list itself (- n +). */
  function onList(k){var r=null;(D&&D.items||[]).forEach(function(x){if(x.key===k)r=x;});return r;}
  function staples(){
    var h='',hidden=0;
    ST.forEach(function(s){var x=onList(s.key),on=x&&!x.checked;
      if(on&&!editST){hidden++;return;}
      h+='<button class="st'+(editST?' ed':'')+'" data-st="'+esc(s.name)+'" data-sk="'+esc(s.key)+'"><span class="pl">'+(editST?RM:PLUS)+'</span><b>'+esc(s.name)+'</b></button>';});
    return '<section class="hv-card rc ba"><h3>Buy again'+(hidden&&!editST?'<span class="stn">'+hidden+' on the list</span>':'')+'<button class="sted" id="sted">'+(editST?'Done':'Edit')+'</button></h3>'+
      (editST?'<form class="af" id="sf" autocomplete="off"><input id="si" maxlength="40" placeholder="New usual item" enterkeyhint="done"><button class="hv-pill primary" type="submit">Keep</button></form>':'')+
      '<div class="stg">'+(h||'<div class="hv-empty">'+(ST.length?'Everything here is on the list':'Tap Edit to add the things you buy often')+'</div>')+'</div></section>';
  }
  function tapStaple(b){
    var name=b.getAttribute('data-st'),k=b.getAttribute('data-sk'),x=onList(k);
    if(editST){busy=true;HV.post('/api/meals/staples',{remove:name}).then(function(r){ST=r.items;},function(err){HV.toast(err.message);}).then(function(){busy=false;draw();});return;}
    var req;
    if(x){req={key:k,checked:false};x.checked=false;x.qty=1;x.at=Date.now()/1000;}
    else{req={add:name};D.items.push({key:k,name:name,amount:'',meals:[],added:true,qty:1,at:Date.now()/1000,checked:false});}
    b.classList.add('on');b.querySelector('.pl').innerHTML=TICK;holdUntil=Date.now()+450;b.classList.add('gone');draw();   // fade out, then redraw
    busy=true;
    HV.post('/api/meals/shopping',req).then(function(){HV.toast('Added '+name);},function(err){HV.toast(err.message);}).then(function(){busy=false;load();});
  }
  /* the stepper: change the count at once, send it, then reload */
  var qT={};
  function step(b){
    var k=b.getAttribute('data-q'),d=+b.getAttribute('data-d'),x=onList(k);if(!x)return;
    x.qty=Math.max(0,Math.min(99,(x.qty||1)+d));
    if(!x.qty)D.items=D.items.filter(function(i){return i!==x;});
    draw();clearTimeout(qT[k]);
    qT[k]=setTimeout(function(){busy=true;HV.post('/api/meals/shopping',{key:k,qty:x.qty}).then(function(){if(!x.qty)HV.toast('Took '+x.name+' off the list');},
      function(err){HV.toast(err.message);}).then(function(){busy=false;load();});},600);   // quick taps send one change
  }
  function pd(s){var p=s.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));}
  function short(k){var d=pd(k);return HV.DAYS[d.getUTCDay()].slice(0,3)+' '+d.getUTCDate();}

  function item(x){
    var wy='';if(x.amount)wy+='<em class="blue">'+esc(x.amount)+'</em>';
    x.meals.slice(0,2).forEach(function(m){wy+='<em>'+esc(m)+'</em>';});if(x.meals.length>2)wy+='<em>+'+(x.meals.length-2)+'</em>';
    if(x.added&&D&&D.from_meals)wy+='<em class="sea">Added</em>';   // only needed next to dinner ingredients
    return '<div class="lr"><button class="li'+(x.checked?' done':'')+'" data-k="'+esc(x.key)+'"><span class="bx">'+(x.checked?CHECK:'')+'</span><span class="tx"><b>'+esc(x.name)+'</b>'+(wy?'<span class="wy">'+wy+'</span>':'')+'</span></button>'+
      (x.added&&!x.checked?stepper(x):x.added?'<button class="rm" data-rm="'+esc(x.key)+'" aria-label="Remove '+esc(x.name)+'">'+RM+'</button>':'')+'</div>';
  }
  var holdUntil=0,holdT=null;
  /* Clear list: a second tap within 4 s empties the whole list (no pop-up dialogs on the frame) */
  var BIN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  var armed=false,armT=null;
  function clearAll(){
    if(!armed){armed=true;draw();clearTimeout(armT);armT=setTimeout(function(){armed=false;draw();},4000);return;}
    armed=false;clearTimeout(armT);var n=D.items.length;D.items=[];D.left=0;draw();busy=true;
    HV.post('/api/meals/shopping',{clear_all:true}).then(function(){HV.toast('Cleared '+n+(n===1?' item':' items'));},function(err){HV.toast(err.message);}).then(function(){busy=false;load();});
  }
  function draw(){                                  // wait for a card's fade-out to finish before redrawing
    var w=holdUntil-Date.now();
    if(w>0){clearTimeout(holdT);holdT=setTimeout(draw,w);return;}
    drawNow();
  }
  function drawNow(){
    var h='<header class="sh"><h1 class="hv-title">Shopping</h1><div class="hv-sub" id="sub"></div></header>';
    if(!D){root.innerHTML=h+'<div class="hv-empty">Loading the list</div>';return;}
    var todo=D.items.filter(function(x){return !x.checked;}),done=D.items.filter(function(x){return x.checked;});
    todo.sort(function(a,b){return (b.at||0)-(a.at||0);});   // newest added on top (also for a tap not yet saved)
    var FM=!!D.from_meals;
    var sub=!FM?(D.left?D.left+' to buy':D.items.length?'All checked off':'Nothing on the list'):D.meals.length?D.left+' to buy for '+D.meals.length+' dinner'+(D.meals.length===1?'':'s')+', '+short(D.start)+' to '+short(D.end):
      D.items.length?D.left+' to buy · no dinners planned for these days':'No dinners planned for these days';
    var rows='';todo.concat(done).forEach(function(x){rows+=item(x);});   // one column: newest to buy on top, checked last
    var foot='<div class="lf">'+(done.length?'<button class="hv-pill" id="clr">Clear '+done.length+' checked</button>':'')+
      '<button class="hv-pill lx'+(armed?' armed':'')+'" id="clra">'+BIN+(armed?'Tap again to clear '+D.items.length+(D.items.length===1?' item':' items'):'Clear list')+'</button></div>';
    var list=D.items.length?'<div class="lc"><div class="hv-card ac">'+ADD+rows+foot+'</div></div>':
      '<div class="lc"><div class="hv-card ac" style="padding:4vh 2vw">'+ADD+'<h3>Nothing to buy yet</h3><p class="hv-empty" style="margin-top:1vh">'+(FM?'Add things above, or plan dinners in Meals and their ingredients show up here, merged.':'Add things above, or tap a card in Buy again.')+'</p>'+
      (FM?'<a class="hv-pill primary" href="/frame/hv/meals/?view=week" style="margin-top:2vh;display:inline-flex;align-items:center">Plan the week</a>':'')+'</div></div>';
    var ml='';D.meals.forEach(function(m){ml+='<div class="ml"><b>'+esc(short(m.date))+'</b><span class="t">'+esc(m.name)+'</span></div>';});
    if(D.missing&&D.missing.length)ml+='<div class="ml"><span class="t" style="color:var(--ink-3)">'+esc(D.missing.join(', '))+' did not load</span></div>';
    var rail=staples()+(FM?'<section class="hv-card rc"><h3>Days<span></span></h3><div class="sgs">'+
        '<button class="sg'+(days===7?' on':'')+'" data-days="7"><b>7</b> days</button><button class="sg'+(days===14?' on':'')+'" data-days="14"><b>14</b> days</button></div></section>'+
      '<section class="hv-card rc"><h3>Dinners<span>'+D.meals.length+'</span></h3>'+(ml||'<div class="hv-empty">None planned</div>')+'</section>':'')+
      (FM?'<p class="hv-sub" style="font-size:2.3vh">Amounts are added up when the units match; other amounts are listed side by side. Recipes from TheMealDB.</p>':'');
    root.innerHTML=h+'<div class="body"><div class="lst">'+list+'</div><div class="rail">'+rail+'</div></div>';
    document.getElementById('sub').textContent=sub;
  }
  function loadST(){return HVJson('/api/meals/staples').then(function(d){ST=d.items||[];if(D)draw();},function(){});}
  function load(){return HVJson('/api/meals/shopping?days='+days).then(function(d){D=d;draw();},function(e){root.innerHTML='<div class="hv-empty" style="padding-top:30vh;text-align:center">'+esc((e&&e.message)||'The list did not load')+'</div>';});}
  root.onsubmit=function(e){
    e.preventDefault();
    if(e.target.id==='sf'){var si=document.getElementById('si'),sv=si?si.value.replace(/^\s+|\s+$/g,''):'';if(!sv||busy)return;
      busy=true;HV.post('/api/meals/staples',{add:sv}).then(function(r){ST=r.items;HV.toast('Kept '+sv+' in Buy again');},function(err){HV.toast(err.message);}).then(function(){busy=false;draw();});return;}var i=document.getElementById('ai'),v=i?i.value.replace(/^\s+|\s+$/g,''):'';if(!v||busy)return;
    busy=true;HV.post('/api/meals/shopping',{add:v}).then(function(){HV.toast('Added '+v);},function(err){HV.toast(err.message);}).then(function(){busy=false;load();});
  };
  root.onclick=function(e){
    if(e.target.closest('#sted')){editST=!editST;draw();return;}
    var q=e.target.closest('[data-q]');if(q){if(D)step(q);return;}
    var s=e.target.closest('[data-st]');if(s){if(!busy&&D)tapStaple(s);return;}
    var r=e.target.closest('[data-rm]');
    if(r&&!busy){busy=true;HV.post('/api/meals/shopping',{remove:r.getAttribute('data-rm')}).then(null,function(err){HV.toast(err.message);}).then(function(){busy=false;load();});return;}
    var b=e.target.closest('[data-k]');
    if(b&&!busy){var k=b.getAttribute('data-k'),x=null;D.items.forEach(function(it){if(it.key===k)x=it;});if(!x)return;
      x.checked=!x.checked;D.left+=x.checked?-1:1;draw();busy=true;
      HV.post('/api/meals/shopping',{key:k,checked:x.checked}).then(null,function(err){HV.toast(err.message);}).then(function(){busy=false;load();});return;}
    b=e.target.closest('[data-days]');if(b){days=+b.getAttribute('data-days');D=null;draw();load();return;}
    if(e.target.closest('#clra')){if(!busy&&D)clearAll();return;}
    if(e.target.closest('#clr'))HV.post('/api/meals/shopping',{clear_checked:true}).then(load,function(err){HV.toast(err.message);});
  };
  HV.chrome({light:true,camera:false,alerts:false,standby:false});HV.back('Home');
  draw();load().then(loadST);setInterval(function(){var a=document.activeElement;if(!busy&&!editST&&!(a&&(a.id==='ai'||a.id==='si')))load();},30000);
})();
