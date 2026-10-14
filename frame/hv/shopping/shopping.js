/* Shopping: everything the planned dinners need, with the same ingredient merged across recipes. ES5.
   Reads : GET /api/meals/shopping?days=7|14  {start, end, meals, items:[{key, name, amount, meals, checked}], left}
   Writes: POST /api/meals/shopping {key, checked} | {clear_checked:true}   (shared by every frame) */
(function(){
  var root=document.getElementById('root'),esc=HV.esc;
  var CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var days=/[?&]days=14/.test(location.search)?14:7,D=null,busy=false;
  function pd(s){var p=s.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));}
  function short(k){var d=pd(k);return HV.DAYS[d.getUTCDay()].slice(0,3)+' '+d.getUTCDate();}

  function item(x){
    var wy='';if(x.amount)wy+='<em class="blue">'+esc(x.amount)+'</em>';
    x.meals.slice(0,2).forEach(function(m){wy+='<em>'+esc(m)+'</em>';});if(x.meals.length>2)wy+='<em>+'+(x.meals.length-2)+'</em>';
    return '<button class="li'+(x.checked?' done':'')+'" data-k="'+esc(x.key)+'"><span class="bx">'+(x.checked?CHECK:'')+'</span><span class="tx"><b>'+esc(x.name)+'</b><span class="wy">'+wy+'</span></span></button>';
  }
  function draw(){
    var h='<header class="sh"><h1 class="hv-title">Shopping</h1><div class="hv-sub" id="sub"></div></header>';
    if(!D){root.innerHTML=h+'<div class="hv-empty">Loading the list</div>';return;}
    var todo=D.items.filter(function(x){return !x.checked;}),done=D.items.filter(function(x){return x.checked;});
    var sub=D.meals.length?D.left+' to buy for '+D.meals.length+' dinner'+(D.meals.length===1?'':'s')+', '+short(D.start)+' to '+short(D.end):'No dinners planned for these days';
    var cols=['',''],all=todo.concat(done),half=Math.ceil(all.length/2);
    all.forEach(function(x,i){cols[i<half?0:1]+=item(x);});
    var list=D.items.length?'<div class="lc"><div class="hv-card ac">'+cols[0]+'</div></div>'+(cols[1]?'<div class="lc"><div class="hv-card ac">'+cols[1]+'</div></div>':''):
      '<div class="lc"><div class="hv-card ac" style="padding:4vh 2vw"><h3>Nothing to buy yet</h3><p class="hv-empty" style="margin-top:1vh">Plan dinners in Meals and their ingredients show up here, merged.</p>'+
      '<a class="hv-pill primary" href="/frame/hv/meals/?view=week" style="margin-top:2vh;display:inline-flex;align-items:center">Plan the week</a></div></div>';
    var ml='';D.meals.forEach(function(m){ml+='<div class="ml"><b>'+esc(short(m.date))+'</b><span class="t">'+esc(m.name)+'</span></div>';});
    if(D.missing&&D.missing.length)ml+='<div class="ml"><span class="t" style="color:var(--ink-3)">'+esc(D.missing.join(', '))+' did not load</span></div>';
    var rail='<section class="hv-card rc"><h3>Days<span></span></h3><div class="sgs">'+
        '<button class="sg'+(days===7?' on':'')+'" data-days="7"><b>7</b> days</button><button class="sg'+(days===14?' on':'')+'" data-days="14"><b>14</b> days</button></div></section>'+
      '<section class="hv-card rc"><h3>Dinners<span>'+D.meals.length+'</span></h3>'+(ml||'<div class="hv-empty">None planned</div>')+'</section>'+
      (done.length?'<button class="hv-pill" id="clr">Clear '+done.length+' checked</button>':'')+
      '<p class="hv-sub" style="font-size:2.3vh">Amounts are added up when the units match; other amounts are listed side by side. Recipes from TheMealDB.</p>';
    root.innerHTML=h+'<div class="body"><div class="lst">'+list+'</div><div class="rail">'+rail+'</div></div>';
    document.getElementById('sub').textContent=sub;
  }
  function load(){return HVJson('/api/meals/shopping?days='+days).then(function(d){D=d;draw();},function(e){root.innerHTML='<div class="hv-empty" style="padding-top:30vh;text-align:center">'+esc((e&&e.message)||'The list did not load')+'</div>';});}
  root.onclick=function(e){
    var b=e.target.closest('[data-k]');
    if(b&&!busy){var k=b.getAttribute('data-k'),x=null;D.items.forEach(function(it){if(it.key===k)x=it;});if(!x)return;
      x.checked=!x.checked;D.left+=x.checked?-1:1;draw();busy=true;
      HV.post('/api/meals/shopping',{key:k,checked:x.checked}).then(null,function(err){HV.toast(err.message);}).then(function(){busy=false;load();});return;}
    b=e.target.closest('[data-days]');if(b){days=+b.getAttribute('data-days');D=null;draw();load();return;}
    if(e.target.closest('#clr'))HV.post('/api/meals/shopping',{clear_checked:true}).then(load,function(err){HV.toast(err.message);});
  };
  HV.chrome({light:true});HV.back('Home');
  draw();load();setInterval(function(){if(!busy)load();},30000);
})();
