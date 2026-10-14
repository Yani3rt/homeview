/* Meals: browse and search TheMealDB, plan dinners for the next 7 days. ES5 (old WebView).
   Reads : GET /api/meals/categories, /api/meals/browse?category=, /api/meals/search?q=, /api/meals/random,
           /api/meals/recipe?id=, /api/meals/plan
   Writes: POST /api/meals/plan {date, id}  (id null clears the day)
   URL   : ?view=week opens the week; ?plan=YYYY-MM-DD picks a dinner for that day; ?q= starts a search;
           ?open=<recipe id> opens a recipe (handy for screenshots). */
(function(){
  var root=document.getElementById('root'),esc=HV.esc;
  var CHECK='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var PLATE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/></svg>';
  var SEARCH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  var BACK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  function q(k){var m=location.search.match(new RegExp('[?&]'+k+'=([^&]*)'));return m?decodeURIComponent(m[1].replace(/\+/g,' ')):'';}
  function $(i){return document.getElementById(i);}
  function pd(s){var p=s.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));}
  function dayShort(k){var d=pd(k);return HV.DAYS[d.getUTCDay()].slice(0,3);}
  function dayLong(k){var d=pd(k);return HV.DAYS[d.getUTCDay()]+', '+HV.MONTHS[d.getUTCMonth()].slice(0,3)+' '+d.getUTCDate();}
  function img(u,size){return u?String(u)+'/'+(size||'medium'):'';}   // TheMealDB serves /small, /medium, /large

  var S={view:q('view')==='week'?'week':'browse',cats:[],cat:'',q:q('q'),results:null,err:'',plan:null,
         planFor:/^\d{4}-\d{2}-\d{2}$/.test(q('plan'))?q('plan'):'',cur:null,sel:'',busy:false,seq:0};

  root.innerHTML='<div class="ml-top"><h1 class="ml-title">Meals</h1><div class="ml-find">'+SEARCH+
    '<input id="q" type="search" placeholder="Search recipes or a main ingredient" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Search recipes">'+
    '<button class="ml-clr" id="qclr" hidden aria-label="Clear">&times;</button></div><div class="ml-seg" id="seg"></div></div>'+
    '<div class="ml-chips" id="chips"></div><div class="ml-banner" id="banner" hidden></div>'+
    '<div class="ml-scroll" id="scroll"><div class="ml-note" id="note"></div><div class="ml-grid" id="grid"></div><div class="ml-credit">Recipes from TheMealDB (themealdb.com)</div></div>'+
    '<div class="ml-dt" id="dt"></div><div class="ml-scrim" id="scrim"></div>'+
    '<div class="hv-sheet ml-sheet" id="psheet"><div class="ml-sh"><div style="flex:1;min-width:0"><h2 id="ptitle">Plan dinner</h2><p>Pick a day. A day that already has a dinner gets replaced.</p></div>'+
    '<button class="hv-pill" id="pcancel">Cancel</button></div><div class="ml-pds" id="pds"></div><div class="ml-sf"><span class="h" id="phint"></span><button class="hv-pill primary" id="pgo" style="padding:0 4vw">Plan</button></div></div>';
  HV.chrome({light:true});HV.back('Home');
  $('q').value=S.q;$('qclr').hidden=!S.q;

  /* ---------- the plan ---------- */
  function plannedOn(id){var w=(S.plan&&S.plan.week)||[],i;for(i=0;i<w.length;i++)if(w[i].meal&&w[i].meal.id===id)return w[i].date;return '';}
  function loadPlan(){return HVJson('/api/meals/plan').then(function(d){S.plan=d;},function(){});}

  /* ---------- top bar ---------- */
  function drawSeg(){
    var n=S.plan?S.plan.planned_7:0;
    $('seg').innerHTML='<button data-view="browse" class="'+(S.view==='browse'?'on':'')+'">Browse</button>'+
      '<button data-view="week" class="'+(S.view==='week'?'on':'')+'">Next 7 days'+(S.plan?' · '+n:'')+'</button>';
  }
  function drawChips(){
    var e=$('chips');
    if(S.view!=='browse'){e.innerHTML='';e.style.display='none';return;}
    e.style.display='';
    var h='<button class="ml-chip'+(!S.cat&&!S.q?' on':'')+'" data-cat="">Ideas</button>';
    S.cats.forEach(function(c){h+='<button class="ml-chip'+(S.cat===c.name?' on':'')+'" data-cat="'+esc(c.name)+'">'+esc(c.name)+'</button>';});
    h+='<button class="ml-chip wk" data-random="1">Surprise me</button>';
    e.innerHTML=h;
  }
  function drawBanner(){
    var b=$('banner'),sc=$('scroll');
    if(S.planFor&&S.view==='browse'){b.hidden=false;sc.className='ml-scroll pl';
      b.innerHTML='Picking dinner for '+esc(dayLong(S.planFor))+'. Tap a recipe, then Plan.<button class="hv-pill" id="bx" style="height:5.4vh;margin-left:auto">Stop</button>';
      $('bx').onclick=function(){S.planFor='';drawBanner();};}
    else{b.hidden=true;sc.className='ml-scroll'+(S.view==='week'?' wk':'');}
  }

  /* ---------- browse ---------- */
  function card(r){
    var on=plannedOn(r.id);
    return '<button class="ml-card" data-id="'+esc(r.id)+'"><div class="ml-ph">'+PLATE+(r.thumb?'<img alt="" src="'+esc(img(r.thumb,'medium'))+'" onload="this.className=\'ld\'">':'')+
      (on?'<span class="ml-badge pl">'+esc(on===S.plan.today?'Tonight':dayShort(on))+'</span>':'')+'</div>'+
      '<div class="ml-nm">'+esc(r.name)+'</div><div class="ml-mt">'+esc([r.category,r.area].filter(Boolean).join(' · ')||'Recipe')+'</div></button>';
  }
  function empty(t,s){return '<div class="ml-empty" style="grid-column:1/-1"><b>'+esc(t)+'</b>'+(s?'<span>'+esc(s)+'</span>':'')+'</div>';}
  function drawBrowse(){
    var g=$('grid'),n=$('note');
    if(S.err){n.textContent='';g.innerHTML=empty('Recipes did not load',S.err);return;}
    if(!S.results){n.textContent='';g.innerHTML=empty('Loading recipes','From TheMealDB');return;}
    if(!S.results.length){n.textContent='';g.innerHTML=empty('No recipes found','Try one word, like a main ingredient: chicken, salmon, beans');return;}
    n.textContent=S.q?S.results.length+' recipe'+(S.results.length===1?'':'s')+' for “'+S.q+'”':S.cat?S.cat+' · '+S.results.length+' recipes':S.idea?'Ideas: '+S.idea:'Ideas';
    var h='';S.results.slice(0,60).forEach(function(r){h+=card(r);});g.innerHTML=h;
  }
  function fetchList(url){
    var my=++S.seq;S.results=null;S.err='';draw();
    HVJson(url).then(function(d){if(my!==S.seq)return;S.results=d.results||[];draw();},
      function(e){if(my!==S.seq)return;S.err=(e&&e.message)||'TheMealDB did not answer';draw();});
  }
  function ideas(){   // a different main-course category each day, so the first screen changes
    S.cat='';
    if(!S.cats.length){S.idea='';fetchList('/api/meals/browse');return;}
    var t=HV.local(),n=Math.round(Date.UTC(t.y,t.mo-1,t.d)/864e5),pool=S.cats.filter(function(c){return !/^(Dessert|Starter|Side|Breakfast|Goat|Miscellaneous)$/.test(c.name);});
    if(!pool.length)pool=S.cats;
    var c=pool[n%pool.length];S.idea=c.name;
    fetchList('/api/meals/browse?category='+encodeURIComponent(c.name));
  }

  /* ---------- the week ---------- */
  function drawWeek(){
    var g=$('grid'),n=$('note'),P=S.plan;
    if(!P){n.textContent='';g.innerHTML=empty('Loading the plan','');return;}
    n.textContent=P.planned_7+' of 7 dinners planned. Tap a day to plan or change it.';
    var h='';
    P.week.forEach(function(w,i){var m=w.meal,lab=i===0?'Tonight':i===1?'Tomorrow':dayShort(w.date)+' '+pd(w.date).getUTCDate();
      h+='<div class="ml-wd'+(m?' pl':'')+'">'+(m&&m.thumb?'<div class="bg" style="background-image:url(\''+esc(img(m.thumb))+'\')"></div><div class="sh"></div>':'')+
        '<div class="d">'+esc(lab)+'</div>'+
        (m?'<button class="r" data-id="'+esc(m.id)+'">'+esc(m.name)+'</button><div class="acts"><button class="hv-pill" data-pick="'+w.date+'">Change</button><button class="hv-pill" data-clear="'+w.date+'">Clear</button></div>':
          '<div class="free">Nothing planned</div><div class="acts"><button class="hv-pill primary" data-pick="'+w.date+'">Pick a dinner</button></div>')+'</div>';});
    g.innerHTML='<div class="ml-wk">'+h+'</div>';
  }

  function draw(){drawSeg();drawChips();drawBanner();if(S.view==='week')drawWeek();else drawBrowse();}

  /* ---------- recipe detail ---------- */
  function openRecipe(id){
    var dt=$('dt');S.cur=null;
    dt.innerHTML='<div class="ml-dl"><button class="ml-x" id="dx">'+BACK+'Recipes</button><div class="nop">'+PLATE+'</div></div><div class="ml-dr"><div class="ml-src">Loading</div></div>';
    dt.classList.add('on');document.body.classList.add('hv-cover');$('dx').onclick=closeRecipe;
    HVJson('/api/meals/recipe?id='+encodeURIComponent(id)).then(function(d){S.cur=d.recipe;drawRecipe();},function(e){
      dt.querySelector('.ml-dr').innerHTML='<div class="ml-src">Not available</div><div class="ml-dn">'+esc((e&&e.message)||'That recipe did not load')+'</div>';});
  }
  function drawRecipe(){
    var r=S.cur,dt=$('dt'),on=plannedOn(r.id),ing='';
    r.ingredients.forEach(function(g){ing+='<div class="ml-ir"><span class="t">'+esc(g.name)+'</span><span class="q">'+esc(g.measure)+'</span></div>';});
    var primary=S.planFor?'Plan for '+(S.plan&&S.planFor===S.plan.today?'tonight':dayShort(S.planFor)):on?'Move to another day':'Plan for a day';
    dt.innerHTML='<div class="ml-dl"><button class="ml-x" id="dx">'+BACK+'Recipes</button>'+(r.thumb?'<img alt="" src="'+esc(img(r.thumb,'large'))+'" onload="this.className=\'ld\'">':'<div class="nop">'+PLATE+'</div>')+'</div>'+
      '<div class="ml-dr"><div><div class="ml-src">'+esc([r.category,r.area].filter(Boolean).join(' · ')||'Recipe')+'</div><h2 class="ml-dn">'+esc(r.name)+'</h2>'+
      '<div class="ml-sub">'+r.ingredients.length+' ingredients · '+r.steps.length+' step'+(r.steps.length===1?'':'s')+(on?' · planned for '+esc(on===S.plan.today?'tonight':dayLong(on)):'')+'</div></div>'+
      '<div class="ml-ing"><h3>Ingredients</h3>'+ing+'</div>'+
      '<div class="ml-acts"><button class="hv-pill primary" id="dplan">'+esc(primary)+'</button><button class="hv-pill" id="dcook">Cook now</button></div></div>';
    $('dx').onclick=closeRecipe;
    $('dcook').onclick=function(){location.href='/frame/hv/dinner/?id='+encodeURIComponent(r.id);};
    $('dplan').onclick=function(){if(S.planFor)planDay(S.planFor,r.id,true);else openPlanSheet();};
  }
  function closeRecipe(){$('dt').classList.remove('on');document.body.classList.remove('hv-cover');S.cur=null;}

  /* ---------- plan sheet ---------- */
  function openPlanSheet(){
    var P=S.plan;if(!P||!S.cur)return;
    S.sel='';$('ptitle').textContent='Plan '+S.cur.name;
    var h='';P.week.forEach(function(w,i){var m=w.meal;
      h+='<button class="ml-pd '+(m?'pl':'fr')+'" data-day="'+w.date+'">'+(m&&m.thumb?'<span class="bg" style="background-image:url(\''+esc(img(m.thumb,'small'))+'\')"></span><span class="sh"></span>':'')+
        '<span class="d">'+(i===0?'Tonight':dayShort(w.date))+'<small>'+pd(w.date).getUTCDate()+'</small></span><span class="r">'+(m?esc(m.name):'Free')+'</span><span class="ck">'+CHECK+'</span></button>';});
    $('pds').innerHTML=h;$('phint').textContent='Choose a day';
    $('psheet').classList.add('on');$('scrim').classList.add('on');
  }
  function closePlanSheet(){$('psheet').classList.remove('on');$('scrim').classList.remove('on');}
  function planDay(day,id,leave){
    if(S.busy)return;S.busy=true;
    HV.post('/api/meals/plan',{date:day,id:id}).then(function(d){
      S.plan=d;HV.toast(id?'Planned for '+(day===d.today?'tonight':dayLong(day)):'Cleared '+dayLong(day));
      closePlanSheet();
      if(leave&&S.planFor){S.planFor='';closeRecipe();S.view='week';}
      else if(S.cur)drawRecipe();
      draw();
    },function(e){HV.toast(e.message);}).then(function(){S.busy=false;});
  }
  $('pds').onclick=function(e){var b=e.target.closest('[data-day]');if(!b)return;S.sel=b.getAttribute('data-day');
    var all=$('pds').querySelectorAll('.ml-pd');for(var i=0;i<all.length;i++)all[i].classList.toggle('sel',all[i]===b);
    $('phint').textContent=dayLong(S.sel);};
  $('pgo').onclick=function(){if(!S.sel){HV.toast('Choose a day first');return;}planDay(S.sel,S.cur.id,false);};
  $('pcancel').onclick=closePlanSheet;$('scrim').onclick=closePlanSheet;

  /* ---------- events ---------- */
  $('seg').onclick=function(e){var b=e.target.closest('[data-view]');if(!b)return;S.view=b.getAttribute('data-view');draw();};
  $('chips').onclick=function(e){var b=e.target.closest('button');if(!b)return;
    if(b.getAttribute('data-random')){S.q='';S.cat='';$('q').value='';fetchList('/api/meals/random');return;}
    S.cat=b.getAttribute('data-cat')||'';S.q='';$('q').value='';$('qclr').hidden=true;
    if(S.cat)fetchList('/api/meals/browse?category='+encodeURIComponent(S.cat));else ideas();};
  $('grid').onclick=function(e){
    var b=e.target.closest('[data-pick]');
    if(b){S.planFor=b.getAttribute('data-pick');S.view='browse';draw();if(!S.results)ideas();return;}
    b=e.target.closest('[data-clear]');if(b){planDay(b.getAttribute('data-clear'),null,false);return;}
    b=e.target.closest('[data-id]');if(b)openRecipe(b.getAttribute('data-id'));
  };
  var qt=null;
  $('q').oninput=function(){var v=this.value;$('qclr').hidden=!v;clearTimeout(qt);
    qt=setTimeout(function(){S.q=v.replace(/^\s+|\s+$/g,'');S.cat='';S.view='browse';if(S.q)fetchList('/api/meals/search?q='+encodeURIComponent(S.q));else ideas();},450);};
  $('q').onkeydown=function(e){if(e.keyCode===13)this.blur();};
  $('qclr').onclick=function(){$('q').value='';$('qclr').hidden=true;S.q='';ideas();};

  /* ---------- start ---------- */
  draw();
  loadPlan().then(draw);
  HVJson('/api/meals/categories').then(function(d){S.cats=d.categories||[];},function(e){S.err=(e&&e.message)||'TheMealDB did not answer';}).then(function(){
    if(S.err){draw();return;}
    if(S.q)fetchList('/api/meals/search?q='+encodeURIComponent(S.q));else ideas();
  });
  if(q('open'))openRecipe(q('open'));
  setInterval(function(){if(!$('dt').classList.contains('on'))loadPlan().then(draw);},60000);
})();
