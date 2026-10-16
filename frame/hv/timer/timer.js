/* HomeView Timer (/frame/hv/timer/): the running timer as a ring, other timers as side pills, and a picker
   (minute presets, a stepper, Start). The picker's left column lists the house's quick timers (config.json
   "timers", edited in Settings > Household; Tonight shows the same ones): one tap starts that timer. ES5. */
(function(){
  var stage=document.getElementById('stage');
  var sel=null,picker=false,pickMin=5,PRESETS=[1,3,5,10,15,20,30,45,60],ticks=null,builtFor=null;
  function nowS(){return HV.now().getTime()/1000;}
  function fmtTotal(s){if(s<60)return s+' sec';if(s%3600===0)return (s/3600)+' hr';return Math.round(s/60)+' min';}
  function labelOf(t){var tot=fmtTotal(t.total),l=String(t.label||'Timer');
    return l.toLowerCase()===tot?tot:l+' · '+tot;}
  function pickMain(ts){
    var i;if(sel)for(i=0;i<ts.length;i++)if(ts[i].id===sel)return ts[i];
    var n=nowS(),best=null;
    for(i=0;i<ts.length;i++){var t=ts[i];
      if(!best){best=t;continue;}
      var bd=best.ends<=n,td=t.ends<=n;
      if(td&&!bd||(td===bd&&t.ends<best.ends))best=t;}
    return best;
  }
  function ringSvg(){
    var h='<svg viewBox="0 0 1000 1000">',i;
    for(i=0;i<60;i++){var a=i*Math.PI/30,s=Math.sin(a),c=-Math.cos(a);
      h+='<line x1="'+(500+s*405).toFixed(1)+'" y1="'+(500+c*405).toFixed(1)+'" x2="'+(500+s*470).toFixed(1)+'" y2="'+(500+c*470).toFixed(1)+'"/>';}
    return h+'</svg>';
  }
  function others(ts,main){return ts.filter(function(t){return t!==main;}).sort(function(a,b){return a.ends-b.ends;});}
  function pill(t){var left=t.ends-nowS(),d=left<=0;
    return '<button class="tm-pill'+(d?' done':'')+'" data-id="'+t.id+'"><b>'+HV.esc(labelOf(t))+'</b><span>'+(d?'Done':HV.mmss(left))+'</span></button>';}

  var PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  function quick(){
    var qs=(HV.cfg.timers||[]).slice(0,4),h='';if(!qs.length)return '';
    qs.forEach(function(t,i){h+='<button class="tm-q" data-q="'+i+'"><span><b>'+HV.esc(t.label)+'</b><em>'+fmtTotal(+t.seconds||0)+'</em></span><i>'+PLAY+'</i></button>';});
    return '<div class="tm-quick"><h2>Quick timers</h2>'+h+'</div>';
  }
  function drawPicker(){
    var q=quick(),h='<div class="tm-pick'+(q?' has-q':'')+'"><h1>Timer</h1><div class="tm-grid">';
    PRESETS.forEach(function(m){h+='<button class="tm-p'+(m===pickMin?' on':'')+'" data-m="'+m+'">'+m+'<small>min</small></button>';});
    h+='</div><div class="tm-step"><button class="tm-sb" data-d="-1">−1</button><div class="tm-val">'+pickMin+'<small>min</small></div><button class="tm-sb" data-d="1">+1</button></div>';
    h+='<button class="tm-btn tm-go" data-go="1">Start</button>';
    if(HV.state.timers.length)h+='<button class="tm-x" data-x="1">Back</button>';
    stage.className='';stage.innerHTML=h+'</div>'+q;builtFor='picker';
  }
  function build(main,ts){
    var rest=others(ts,main),l='',r='',i;
    for(i=0;i<rest.length;i++){if(i%2===0)l+=pill(rest[i]);else r+=pill(rest[i]);}
    stage.innerHTML='<div class="tm-ring">'+ringSvg()+'</div><div class="tm-mid"><div class="tm-digits"></div><div class="tm-label"></div></div>'+
      '<div class="tm-side l">'+l+'</div><div class="tm-side r">'+r+'</div>'+
      '<button class="tm-btn tm-dismiss" data-dismiss="1" hidden>Dismiss</button>'+
      '<button class="tm-add" data-add="1">+ Timer</button><button class="tm-cancel" data-cancel="1">Cancel</button>';
    ticks=stage.getElementsByTagName('line');
    builtFor=main.id+'|'+rest.map(function(t){return t.id;}).join(',');
  }
  function render(){
    var ts=HV.state.timers||[];
    if(picker||!ts.length){if(builtFor!=='picker')drawPicker();return;}
    var main=pickMain(ts),rest=others(ts,main),key=main.id+'|'+rest.map(function(t){return t.id;}).join(',');
    if(builtFor!==key)build(main,ts);
    var left=main.ends-nowS(),done=left<=0,lit=done?0:Math.min(60,Math.ceil(left/main.total*60)),i;
    for(i=0;i<60;i++)ticks[i].setAttribute('class',i<lit?'':'off');
    stage.className=done?'tm-done':'';
    stage.querySelector('.tm-digits').textContent=done?'Done':HV.mmss(left);
    stage.querySelector('.tm-label').textContent=labelOf(main);
    stage.querySelector('.tm-dismiss').hidden=!done;
    stage.querySelector('.tm-cancel').hidden=done;
    var pills=stage.querySelectorAll('.tm-pill'),j;
    for(j=0;j<pills.length;j++){var t=null,k;for(k=0;k<rest.length;k++)if(rest[k].id===pills[j].getAttribute('data-id'))t=rest[k];
      if(t){var sp=pills[j].querySelector('span'),d=t.ends-nowS()<=0;sp.textContent=d?'Done':HV.mmss(t.ends-nowS());
        pills[j].className='tm-pill'+(d?' done':'');}}
  }
  function start(label,seconds){
    HV.post('/api/hv/timer',{action:'start',label:label,seconds:seconds}).then(function(d){
      if(d&&d.timer){HV.state.timers=(HV.state.timers||[]).concat([d.timer]);sel=d.timer.id;}
      picker=false;builtFor=null;render();},function(er){HV.toast(er.message);});
  }
  function cancel(id){HV.post('/api/hv/timer',{action:'cancel',id:id}).then(function(){
      HV.state.timers=HV.state.timers.filter(function(t){return t.id!==id;});if(sel===id)sel=null;render();},
    function(e){HV.toast(e.message);});}
  stage.onclick=function(e){
    var b=e.target;while(b&&b!==stage&&!(b.tagName==='BUTTON'))b=b.parentNode;
    if(!b||b===stage)return;
    var ts=HV.state.timers||[],main=ts.length&&pickMain(ts);
    if(b.getAttribute('data-m')){pickMin=+b.getAttribute('data-m');builtFor=null;drawPicker();}
    else if(b.getAttribute('data-d')){pickMin=Math.max(1,Math.min(360,pickMin+(+b.getAttribute('data-d'))));builtFor=null;drawPicker();}
    else if(b.getAttribute('data-go'))start('Timer',pickMin*60);
    else if(b.getAttribute('data-q')){var q=(HV.cfg.timers||[])[+b.getAttribute('data-q')];if(q)start(q.label,+q.seconds);}
    else if(b.getAttribute('data-x')){picker=false;builtFor=null;render();}
    else if(b.getAttribute('data-add')){picker=true;builtFor=null;render();}
    else if(b.getAttribute('data-id')){sel=b.getAttribute('data-id');builtFor=null;render();}
    else if(b.getAttribute('data-dismiss')||b.getAttribute('data-cancel')){if(main)cancel(main.id);}
  };
  HV.chrome({timers:false});HV.back('Home');
  HV.on(render);
  setInterval(render,1000);
})();
