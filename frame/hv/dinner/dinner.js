/* Tonight's dinner, with ingredients and a step-by-step cook view. ES5.
   Reads : GET /api/meals/plan (tonight), /api/meals/recipe?id=, /api/meals/browse (ideas when nothing is planned)
   Writes: POST /api/hv/timer {action:'start', label, seconds} for the quick timers (config.json "timers")
   URL   : ?id=<recipe id> shows that recipe instead of tonight's; ?cook=1 opens the steps; ?sheet=ing the ingredients. */
(function(){
  var root=document.getElementById('root'),esc=HV.esc;
  function q(k){var m=location.search.match(new RegExp('[?&]'+k+'=([^&]*)'));return m?decodeURIComponent(m[1]):'';}
  function $(i){return document.getElementById(i);}
  function img(u,size){return u?String(u)+'/'+(size||'large'):'';}
  var R=null,step=0,plan=null;

  function empty(){
    root.innerHTML='<div class="dn-empty"><div class="eh"><h1>Nothing planned tonight</h1><p>Pick one of these, or open Meals to plan the week.</p></div>'+
      '<div class="picks" id="picks"><div class="none">Loading ideas from TheMealDB</div></div>'+
      '<div class="ef"><button class="dn-b" id="pick">Open Meals</button>'+(plan&&plan.tomorrow?'<div class="nx">Tomorrow: <b>'+esc(plan.tomorrow.name)+'</b></div>':'')+'</div></div>';
    $('pick').onclick=function(){location.href='/frame/hv/meals/?plan='+(plan?plan.today:'');};
    HVJson('/api/meals/random').then(function(a){return HVJson('/api/meals/browse').then(function(b){return (a.results||[]).concat(b.results||[]);});})
      .then(function(list){
        var seen={},picks=[],t=HV.local(),n=t.d;
        list.forEach(function(r){if(!seen[r.id]&&!/^(Dessert|Breakfast|Side|Starter)$/.test(r.category||'')){seen[r.id]=1;picks.push(r);}});   // dinner ideas only
        if(picks.length>3){var first=picks.shift(),rest=picks.slice((n*3)%Math.max(1,picks.length-2));picks=[first].concat(rest).slice(0,3);}
        var h='';picks.forEach(function(r){
          h+='<a class="pk" href="/frame/hv/meals/?open='+encodeURIComponent(r.id)+(plan?'&plan='+plan.today:'')+'"><span class="pp" style="background-image:url(\''+esc(img(r.thumb,'medium'))+'\')"></span>'+
            '<span class="pi"><b>'+esc(r.name)+'</b><span class="pm"><span class="tm">'+esc([r.category,r.area].filter(Boolean).join(' · ')||'Recipe')+'</span></span></span></a>';});
        $('picks').innerHTML=h||'<div class="none">No ideas came back. Open Meals to search.</div>';
      },function(e){$('picks').innerHTML='<div class="none">'+esc((e&&e.message)||'TheMealDB did not answer')+'</div>';});
  }

  function timersHTML(){
    var ts=HV.cfg.timers||[],h='';
    ts.slice(0,4).forEach(function(t,i){h+='<button class="glass tq" data-t="'+i+'">'+esc(t.label)+' · '+Math.round(t.seconds/60)+' min</button>';});
    return h;
  }
  function show(){
    var r=R,tonight=plan&&plan.tonight&&plan.tonight.id===r.id,eb=tonight?'Tonight':plan&&plan.tomorrow&&plan.tomorrow.id===r.id?'Tomorrow':'Recipe';
    root.innerHTML='<img class="dn-photo" id="ph" alt="" src="'+esc(img(r.thumb))+'"><div class="dn-shade"></div>'+
      '<div class="dn-info"><div class="eb">'+eb+'</div><h1 class="dn-name">'+esc(r.name)+'</h1>'+
      '<div class="dn-sub">'+esc([r.category,r.area].filter(Boolean).join(' · '))+'</div>'+
      '<div class="panels"><div class="gp"><small>Ingredients</small><b>'+r.ingredients.length+'</b><span>'+esc(r.ingredients.slice(0,3).map(function(g){return g.name;}).join(', '))+(r.ingredients.length>3?'…':'')+'</span></div>'+
        '<div class="gp"><small>Steps</small><b>'+r.steps.length+'</b><span>'+esc(r.steps.length?r.steps[0].slice(0,60)+(r.steps[0].length>60?'…':''):'No steps listed')+'</span></div>'+
        '<div class="gp go" id="gocook"><small>Ready?</small><b>Cook</b><span>One step at a time</span></div></div>'+
      '<div class="facts">'+timersHTML()+'</div>'+
      '<div class="dn-btns"><button class="dn-b main" id="ing">Ingredients</button><button class="dn-b" id="chg">'+(tonight?'Change dinner':'Plan this')+'</button></div></div>'+
      '<div class="dn-sheet" id="sheet"></div><div class="dn-cook" id="cook"></div>';
    $('ph').onload=function(){this.className='dn-photo on';};
    $('ing').onclick=openIng;
    $('gocook').onclick=function(){openCook(0);};
    $('chg').onclick=function(){location.href=tonight?'/frame/hv/meals/?plan='+plan.today:'/frame/hv/meals/?open='+encodeURIComponent(r.id);};
    root.querySelector('.facts').onclick=function(e){var b=e.target.closest('[data-t]');if(!b)return;var t=(HV.cfg.timers||[])[+b.getAttribute('data-t')];
      HV.post('/api/hv/timer',{action:'start',label:t.label,seconds:t.seconds}).then(function(){HV.toast(t.label+' timer started');},function(x){HV.toast(x.message);});};
  }
  function openIng(){
    var r=R,h='<div class="dn-sh"><h2>Ingredients</h2><div class="legend">'+r.ingredients.length+' for '+esc(r.name)+'</div><button class="dn-x" id="sx">Close</button></div><div class="dn-ing">';
    r.ingredients.forEach(function(g){h+='<div class="dn-row"><b>'+esc(g.name)+'</b><span>'+esc(g.measure)+'</span></div>';});
    $('sheet').innerHTML=h+'</div>';$('sheet').classList.add('on');
    $('sx').onclick=function(){$('sheet').classList.remove('on');};
  }
  function openCook(i){
    var r=R,n=r.steps.length;if(!n){HV.toast('This recipe has no steps listed');return;}
    step=Math.max(0,Math.min(n-1,i));
    var c=$('cook');
    c.innerHTML='<div class="ck-top"><button class="dn-x" id="cx">Done</button><div class="ck-n tnum">Step '+(step+1)+' of '+n+'</div><button class="dn-x" id="ci">Ingredients</button></div>'+
      '<div class="ck-body"><div class="ck-step">'+esc(r.steps[step])+'</div></div>'+
      '<div class="ck-nav"><button class="dn-b" id="cp"'+(step===0?' disabled':'')+'>Back</button><div class="ck-dots">'+dots(n)+'</div><button class="dn-b main" id="cn">'+(step===n-1?'Finish':'Next')+'</button></div>';
    c.classList.add('on');document.body.classList.add('hv-cover');
    function shut(){c.classList.remove('on');document.body.classList.remove('hv-cover');}
    $('cx').onclick=shut;
    $('ci').onclick=openIng;
    $('cp').onclick=function(){openCook(step-1);};
    $('cn').onclick=function(){if(step===n-1){shut();HV.toast('Enjoy dinner');}else openCook(step+1);};
  }
  function dots(n){var h='',i;if(n>14)return '';for(i=0;i<n;i++)h+='<i'+(i===step?' class="on"':'')+'></i>';return h;}

  function loadRecipe(id){
    return HVJson('/api/meals/recipe?id='+encodeURIComponent(id)).then(function(d){R=d.recipe;show();
      if(q('cook')==='1')openCook(0);if(q('sheet')==='ing')openIng();},
      function(e){root.innerHTML='<div class="dn-empty"><div class="eh"><h1>That recipe did not load</h1><p>'+esc((e&&e.message)||'TheMealDB did not answer')+'</p></div></div>';});
  }
  HV.chrome();HV.back('Home');
  HVJson('/api/meals/plan').then(function(p){plan=p;},function(){}).then(function(){
    var id=q('id')||(plan&&plan.tonight&&plan.tonight.id);
    if(id)loadRecipe(id);else empty();
  });
})();
