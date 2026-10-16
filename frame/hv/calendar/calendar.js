/* HomeView Calendar. Sources: /api/frame (calendar_events, weather.days, calendars), /api/meals/plan (dinners).
   Calendars, their names and colors come from config.json (HV.cfg.calendars).
   Left: seven days starting today with events, forecast and dinner. Right: month grid with dots. Tap a day: agenda sheet. ES5. */
(function(){
  var root=document.getElementById('root'),sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim'),esc=HV.esc,pad=HV.pad;
  var DOW=HV.DAYS,MON=HV.MONTHS;
  var CAL={};(HV.cfg.calendars||[]).forEach(function(c){CAL[c.key]={n:c.name,c:c.color};});
  var FALLBACK={n:'Calendar',c:'#ff9f0a'};
  var D={frame:null,plan:null},hidden={},vm=null,last='';

  function key(o){return o.y+'-'+pad(o.mo)+'-'+pad(o.d);}
  function dk(d){return key(HV.local(d));}
  function dnum(k){var p=k.split('-');return Math.round(Date.UTC(+p[0],+p[1]-1,+p[2])/864e5);}
  function fromNum(n){var d=new Date(n*864e5);return {y:d.getUTCFullYear(),mo:d.getUTCMonth()+1,d:d.getUTCDate(),dow:d.getUTCDay()};}
  function kOf(n){return key(fromNum(n));}
  function st(d){var t=HV.local(d);return (t.h%12||12)+(t.mi?':'+pad(t.mi):'')+' '+(t.h<12?'AM':'PM');}
  function R(n){return Math.round(n);}
  function todayN(){return dnum(key(HV.local()));}
  function ico(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';}
  var FORK=ico('<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 21V3c-2 1-3 4-3 8h3"/>');
  var CHEV_L=ico('<path d="M15 5l-7 7 7 7"/>'),CHEV_R=ico('<path d="M9 5l7 7-7 7"/>');

  /* events as {e, a, b, s} with a..b the first/last day number covered */
  function events(){
    var f=D.frame,ev=f&&(f.calendar_events||f.events)||[],out=[],i,e,s,a,b;
    for(i=0;i<ev.length;i++){e=ev[i];if(hidden[e.cal])continue;
      s=new Date(e.start);a=dnum(dk(s));
      if(e.all_day&&e.end)b=dnum(dk(new Date(e.end)))-1;
      else if(e.end)b=dnum(dk(new Date(new Date(e.end).getTime()-1000)));
      else b=a;
      if(b<a)b=a;
      out.push({e:e,a:a,b:b,s:s});}
    return out;
  }
  function onDay(all,n){
    var r=[],i;for(i=0;i<all.length;i++)if(all[i].a<=n&&all[i].b>=n)r.push(all[i]);
    r.sort(function(x,y){return (x.e.all_day===y.e.all_day?0:x.e.all_day?-1:1)||x.s-y.s;});
    return r;
  }
  function wxFor(n){
    var w=D.frame&&D.frame.weather,ds=w&&w.days||[],k=kOf(n),i;
    for(i=0;i<ds.length;i++)if(ds[i].date===k)return ds[i];
    return null;
  }
  function mealFor(n){var P=D.plan;return P&&P.days?P.days[kOf(n)]||null:null;}
  function mealName(m){return m&&m.name?m.name:'';}

  function sub(){
    var f=D.frame;if(!f)return 'Loading your calendars';
    var cs=f.calendars||[],miss=[],names=[],i;
    if(!cs.length)return 'No calendars yet. Add ICS links to config.json';
    for(i=0;i<cs.length;i++){names.push(cs[i].name);if(cs[i].status!=='ok')miss.push(cs[i].name+(cs[i].status==='needs-package'?' (install icalendar)':''));}
    return miss.length?miss.join(', ')+(miss.length===1?' calendar isn’t':' calendars aren’t')+' up to date':names.join(', ');
  }

  function head(){
    var h='<div><h1>Calendar</h1><p>'+esc(sub())+'</p></div><div class="cl-chips">',k;
    for(k in CAL)h+='<button class="cl-chip'+(hidden[k]?' off':'')+'" data-cal="'+k+'" style="--c:'+CAL[k].c+'" aria-pressed="'+(!hidden[k])+'"><i></i>'+CAL[k].n+'</button>';
    return h+'</div>';
  }

  function weekRows(all){
    var t=todayN(),h='',i,n;
    var K=D.plan,maxMeal=todayN()+6;
    for(i=0;i<7;i++){n=t+i;var o=fromNum(n),es=onDay(all,n),w=wxFor(n),mh='',eh='',j;
      var lab=i===0?'Today':DOW[o.dow].slice(0,3)+' '+o.d;
      var ws=w?R(w.hi_f)+'° / '+R(w.lo_f)+'°'+(w.precip_pct>=30?' <u>'+R(w.precip_pct)+'%</u>':''):'';
      var shownN=es.length>2?1:es.length;
      for(j=0;j<shownN;j++){var x=es[j];
        eh+='<div class="cl-e"><i style="background:'+((CAL[x.e.cal]||FALLBACK).c)+'"></i>'+(x.e.all_day?'':'<em>'+st(x.s)+'</em>')+'<span>'+esc(x.e.title)+'</span></div>';}
      if(es.length>2)eh+='<div class="cl-e more">+'+(es.length-1)+' more</div>';
      if(!es.length)eh='<div class="cl-e none">Nothing planned</div>';
      var nm=mealName(mealFor(n));
      if(nm)mh='<div class="cl-dn">'+FORK+'<span>'+esc(nm)+'</span></div>';
      else if(K&&n<=maxMeal)mh='<div class="cl-dn none"><span>No dinner planned</span></div>';
      else mh='<div class="cl-dn none"></div>';
      h+='<button class="cl-day'+(i===0?' today':'')+'" data-day="'+n+'"><div class="cl-lb"><b>'+lab+'</b><span>'+ws+'</span></div><div class="cl-evs">'+eh+'</div>'+mh+'</button>';}
    return h;
  }

  function monthGrid(all){
    var y=vm.y,mo=vm.mo,first=dnum(y+'-'+pad(mo)+'-01'),f=fromNum(first),start=first-f.dow;
    var dim=new Date(Date.UTC(y,mo,0)).getUTCDate(),rows=Math.ceil((f.dow+dim)/7),t=todayN(),h='',i,j;
    for(i=0;i<rows*7;i++){var n=start+i,o=fromNum(n),es=onDay(all,n),seen={},dots='',c=0;
      for(j=0;j<es.length&&c<3;j++){var cal=es[j].e.cal;if(!seen[cal]){seen[cal]=1;dots+='<i style="background:'+((CAL[cal]||FALLBACK).c)+'"></i>';c++;}}
      h+='<button class="cl-c'+(o.mo!==mo?' out':'')+(n===t?' today':'')+(o.dow===0||o.dow===6?' wk':'')+'" data-day="'+n+'" aria-label="'+DOW[o.dow]+' '+MON[o.mo-1]+' '+o.d+', '+es.length+' events"><b>'+o.d+'</b><span class="cl-dots">'+dots+'</span></button>';}
    var away=vm.y!==HV.local().y||vm.mo!==HV.local().mo;
    return '<div class="cl-mh"><b>'+MON[mo-1]+' '+y+'</b><div class="cl-nav">'+(away?'<button class="w" data-nav="0">Today</button>':'')+
      '<button data-nav="-1" aria-label="Previous month">'+CHEV_L+'</button><button data-nav="1" aria-label="Next month">'+CHEV_R+'</button></div></div>'+
      '<div class="cl-wl"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>'+
      '<div class="cl-mg" style="grid-template-rows:repeat('+rows+',minmax(0,1fr))">'+h+'</div>';
  }

  function draw(){
    var t=HV.local();if(!vm)vm={y:t.y,mo:t.mo};
    var all=events(),out='<header class="cl-head">'+head()+'</header><div class="cl-body"><div class="cl-week">'+weekRows(all)+'</div><div class="cl-month">'+monthGrid(all)+'</div></div>';
    if(out===last)return;last=out;root.innerHTML=out;
  }

  /* ---------- day sheet ---------- */
  function openDay(n){
    var o=fromNum(n),es=onDay(events(),n),w=wxFor(n),m=mealFor(n),nm=mealName(m),h,i;
    var line=[];
    if(w)line.push('High '+R(w.hi_f)+'°, low '+R(w.lo_f)+'°'+(w.precip_pct>=30?', '+R(w.precip_pct)+'% chance of precipitation':''));
    var diff=n-todayN();
    h='<div class="cl-sh"><div><h2>'+(diff===0?'Today, ':diff===1?'Tomorrow, ':'')+DOW[o.dow]+', '+MON[o.mo-1]+' '+o.d+'</h2><p>'+esc(line.join(' · ')||(es.length+(es.length===1?' event':' events')))+'</p></div><button class="hv-pill primary" id="sx">Close</button></div>';
    var ev='';
    for(i=0;i<es.length;i++){var x=es[i],e=x.e,when=e.all_day?'All day':st(x.s)+(e.end?' – '+st(new Date(e.end)):'');
      if(x.b>x.a&&e.all_day)when='All day · through '+MON[fromNum(x.b).mo-1].slice(0,3)+' '+fromNum(x.b).d;
      ev+='<div class="cl-ev"><i style="background:'+((CAL[e.cal]||FALLBACK).c)+'"></i><div><b>'+esc(e.title)+'</b><span>'+esc(when+(e.location?' · '+String(e.location).split('\n')[0]:'')+' · '+(CAL[e.cal]||FALLBACK).n)+'</span></div></div>';}
    if(!ev)ev='<div class="hv-empty">Nothing planned. Enjoy the space.</div>';
    var dn='';
    if(nm){var th=m&&m.thumb;
      dn='<div class="cl-sd'+(th?'':' plain')+'">'+(th?'<img alt="" src="'+esc(th)+'/medium" onerror="this.parentNode.className=\'cl-sd plain\';this.parentNode.removeChild(this)">':'')+'<div><small>Dinner</small>'+esc(nm)+'</div></div>';}
    else if(D.plan)dn='<div class="cl-sd plain"><div><small>Dinner</small>Not planned yet</div></div>';
    h+='<div class="cl-sx"><div>'+ev+'</div><div>'+dn+'</div></div>';
    sheet.innerHTML=h;sheet.classList.add('on');scrim.classList.add('on');
    document.getElementById('sx').onclick=closeSheet;
  }
  function closeSheet(){sheet.classList.remove('on');scrim.classList.remove('on');}
  scrim.onclick=closeSheet;

  root.onclick=function(ev){
    var t=ev.target;
    while(t&&t!==root&&!(t.getAttribute&&(t.getAttribute('data-day')||t.getAttribute('data-cal')||t.getAttribute('data-nav')!=null)))t=t.parentNode;
    if(!t||t===root)return;
    var c=t.getAttribute('data-cal'),nv=t.getAttribute('data-nav'),d=t.getAttribute('data-day');
    if(c){hidden[c]=!hidden[c];draw();}
    else if(nv!=null){var td=HV.local();
      if(nv==='0')vm={y:td.y,mo:td.mo};
      else{var mo=vm.mo+(+nv),y=vm.y;if(mo<1){mo=12;y--;}if(mo>12){mo=1;y++;}vm={y:y,mo:mo};}
      draw();}
    else if(d)openDay(+d);
  };

  HV.chrome({light:true});HV.back('Home');
  draw();
  function loadF(){HVJson('/api/frame').then(function(d){D.frame=d;draw();},function(){});}
  function loadK(){HVJson('/api/meals/plan').then(function(d){if(d&&d.ok!==false){D.plan=d;draw();}},function(){});}
  var qo=location.search.match(/[?&]open=(\d+)/);   // preview: open the agenda sheet for today + N
  if(qo)setTimeout(function(){openDay(todayN()+(+qo[1]));},1500);
  loadF();loadK();setInterval(loadF,30000);setInterval(loadK,60000);
  setInterval(draw,60000);
})();
