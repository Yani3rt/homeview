/* HomeView Weather. Source: /api/frame (weather from Open-Meteo: now, hours24, days, sunrise/sunset; aqi). ES5. */
(function(){
  var root=document.getElementById('root'),esc=HV.esc,pad=HV.pad,DOW=HV.DAYS;
  var D={frame:null},last='';
  /* Style, per frame: 'apple' (default) or 'modern' (Settings > Weather style; ?wx=modern|apple to try one) */
  var MODERN=(function(){var q=(location.search.match(/[?&]wx=(modern|apple)/)||[])[1],v=q;
    try{if(!v)v=localStorage.getItem('hv-wx');}catch(e){}return v==='modern';})();
  if(MODERN){root.className='wm';document.body.className+=' wm-body';}
  var WU=HV.cfg.wind_unit||'mph',WUL={kmh:'km/h',ms:'m/s',kn:'kn'}[WU]||'mph';
  function toMph(v){return WU==='kmh'?v/1.609:WU==='ms'?v*2.237:WU==='kn'?v*1.151:v;}

  function key(o){return o.y+'-'+pad(o.mo)+'-'+pad(o.d);}
  function dnum(k){var p=k.split('-');return Math.round(Date.UTC(+p[0],+p[1]-1,+p[2])/864e5);}
  function R(n){return Math.round(n);}
  function mins(s){return +s.slice(11,13)*60+(+s.slice(14,16));}
  function strTime(s){var h=+s.slice(11,13),m=+s.slice(14,16);return (h%12||12)+':'+pad(m)+' '+(h<12?'AM':'PM');}
  function hr12(h){return (h%12||12)+(h<12?'a':'p');}
  function dur(m){m=Math.max(0,Math.round(m));return Math.floor(m/60)+' h '+pad(m%60)+' m';}
  function dayName(k){var p=k.split('-');return DOW[new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).getUTCDay()];}

  function wk(code,isDay){
    if(code==null)return ['unknown','Forecast'];
    if(code===0)return isDay?['sun','Clear']:['moon','Clear'];
    if(code===1)return isDay?['sun','Mostly clear']:['moon','Mostly clear'];
    if(code===2)return [isDay?'partly':'mooncloud','Partly cloudy'];
    if(code===3)return ['cloud','Cloudy'];
    if(code===45||code===48)return ['fog','Fog'];
    if(code>=51&&code<=57)return ['rain','Drizzle'];
    if(code>=61&&code<=67)return ['rain','Rain'];
    if(code>=71&&code<=77)return ['snow','Snow'];
    if(code>=80&&code<=82)return ['rain','Showers'];
    if(code===85||code===86)return ['snow','Snow showers'];
    if(code>=95)return ['storm','Thunderstorms'];
    return ['cloud','Cloudy'];
  }
  function sym(kind){return MODERN?symL(kind):symD(kind);}
  /* light-background line icons (modern style): outlined clouds, orange sun, blue moon and rain */
  function symL(kind){
    var sun='<circle cx="12" cy="12" r="4.2" stroke="#f5a524"/><path d="M12 2.5v2.2m0 14.6v2.2M2.5 12h2.2m14.6 0h2.2M5.3 5.3l1.5 1.5m10.4 10.4l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" stroke="#f5a524"/>';
    var cloud='<path d="M6.5 18.5a4 4 0 0 1-.4-8 5.8 5.8 0 0 1 11.2-1.3 4.5 4.5 0 1 1 .7 9.3Z" fill="#fff" stroke="#7d8aa0"/>';
    var moon='<path d="M18.8 16.7A8 8 0 0 1 7.3 5.2a8.2 8.2 0 1 0 11.5 11.5Z" stroke="#6fb0e8"/>';
    var b=kind==='sun'?sun:kind==='moon'?moon:(kind==='partly'||kind==='mooncloud')?'<g transform="translate(-1,-3) scale(.75)">'+(kind==='partly'?sun:moon)+'</g>'+cloud:
      kind==='fog'?cloud+'<path d="M4 22h16M7 25h10" stroke="#9aa4b2"/>':kind==='rain'?cloud+'<path d="m8 21.5-.8 2.2m4.8-2.2-.8 2.2m4.8-2.2-.8 2.2" stroke="#2f7de1"/>':
      kind==='snow'?cloud+'<path d="M8 22v2.5m4-2.5v2.5m4-2.5v2.5" stroke="#6fb0e8"/>':
      kind==='storm'?cloud+'<path d="m13 17.5-3.5 5h3.2l-1.7 4 5.5-6h-3.6l2.4-3Z" fill="#f5a524" stroke="#f5a524" stroke-width="1"/>':cloud;
    return '<svg viewBox="0 0 24 28" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+b+'</svg>';
  }
  function symD(kind){
    var sun='<circle cx="12" cy="12" r="4" fill="#ffd36a" stroke="#ffd36a"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="#ffd36a"/>';
    var cloud='<path d="M6 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.6-1.4A4.7 4.7 0 1 1 18 18Z" fill="#f2f6ff" stroke="#f2f6ff"/>';
    var moon='<path d="M18.8 16.7A8 8 0 0 1 7.3 5.2a8.2 8.2 0 1 0 11.5 11.5Z" fill="#fff0bd" stroke="#fff0bd"/>';
    var b=kind==='sun'?sun:kind==='moon'?moon:(kind==='partly'||kind==='mooncloud')?'<g transform="translate(-1,-3) scale(.8)">'+(kind==='partly'?sun:moon)+'</g>'+cloud:
      kind==='fog'?cloud+'<path d="M3 21h18M6 24h12" stroke="#d7e6f5"/>':kind==='rain'?cloud+'<path d="m7 21-1 2m7-2-1 2m7-2-1 2" stroke="#8fd0ff"/>':
      kind==='snow'?cloud+'<path d="M6 21v3m-1.5-1.5h3M13 21v3m-1.5-1.5h3M20 21v3m-1.5-1.5h3" stroke="#fff"/>':
      kind==='storm'?cloud+'<path d="m13 17-4 6h4l-2 4 7-7h-5l3-3Z" fill="#ffd36a" stroke="#ffd36a"/>':cloud;
    return '<svg viewBox="0 0 24 28" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+b+'</svg>';
  }
  function sky(kind,isDay){
    // deep enough at the bottom that white text on the dark glass cards stays above 4.5:1 contrast
    if(!isDay)return kind==='rain'||kind==='storm'?['#161d29','#323c4d']:['#0b1630','#22365f'];
    if(kind==='sun'||kind==='partly')return ['#1a5fb4','#3a86d4'];
    if(kind==='rain')return ['#34445a','#56677c'];
    if(kind==='storm')return ['#242a36','#434c5e'];
    if(kind==='snow')return ['#4f6984','#738ca6'];
    if(kind==='fog')return ['#58666f','#7d8a94'];
    return ['#45607d','#6a839d'];
  }
  function ic(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';}
  var I={
    rain:'<path d="M6 15a4 4 0 0 1-.5-8 6 6 0 0 1 11.6-1.4A4.7 4.7 0 1 1 18 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',
    cool:'<path d="M12 3v14M8 13l4 4 4-4M5 21h14"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    ok:'<path d="M5 12l5 5 9-10"/>',
    rise:'<path d="M12 3v7M8.5 6.5L12 3l3.5 3.5M3 18h18M6 18a6 6 0 0 1 12 0"/>',
    set:'<path d="M12 10V3M8.5 6.5L12 10l3.5-3.5M3 18h18M6 18a6 6 0 0 1 12 0"/>',
    wind:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
    drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    air:'<path d="M4 8h9a2.5 2.5 0 1 0-2.5-2.5M4 12h13a2.5 2.5 0 1 1-2.5 2.5M4 16h6"/>',
    therm:'<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>',
    wave:'<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M12 3v7M9 7l3 3 3-3"/>',
    storm:'<path d="M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 4.5c-4 0-7.5 3-7.5 7.5 0-3 2.5-5 5-5M12 19.5c4 0 7.5-3 7.5-7.5 0 3-2.5 5-5 5"/>',
    win:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>',
    umb:'<path d="M3 12a9 9 0 0 1 18 0zM12 12v6a2 2 0 0 0 4 0M12 3v0"/>'
  };

  function fixW(w){
    if(w.hi_f==null||w.temp_f>w.hi_f)w.hi_f=w.temp_f;
    if(w.lo_f==null||w.temp_f<w.lo_f)w.lo_f=w.temp_f;
    var t=w.days&&w.days[0];if(t){if(t.hi_f==null||w.hi_f>t.hi_f)t.hi_f=w.hi_f;if(t.lo_f==null||w.lo_f<t.lo_f)t.lo_f=w.lo_f;}
    return w;
  }
  function nm(d,i){return i===0?'Today':dayName(d.date).slice(0,3);}
  /* the next two hours, from 15-minute precipitation (server: weather.nowcast) */
  function nowcastLine(n){
    if(!n)return null;
    if(n.state==='start')return {i:'umb',t:'Rain around '+strTime(n.at),s:(n.mins<=5?'Starting now':'In about '+n.mins+' min')+(n.heavy?' \u00b7 heavy at times':'')};
    if(n.state==='stop')return {i:'umb',t:'Raining now',s:'Stopping around '+strTime(n.at)+(n.mins>5?' (in '+n.mins+' min)':'')};
    if(n.state==='rain')return {i:'umb',t:'Raining now',s:'For at least the next two hours'};
    return null;
  }
  /* "Cooler outside": the Home Assistant indoor temperature sensor vs. now and the next 6 hours outside.
     Only when it is 3°+ cooler out, not raining or about to rain, and not cold (60°+). */
  var COOL_BY=3,COOL_MIN=60;
  function indoorF(){
    var it=null,i,xs=(D.ha&&D.ha.items)||[];
    for(i=0;i<xs.length;i++)if(xs[i].kind==='sensor'&&(xs[i].dc==='temperature'||/temp/i.test(xs[i].id))){it=xs[i];break;}
    if(!it)return null;var v=parseFloat(it.state);if(isNaN(v))return null;
    return /C/.test(it.state)?v*9/5+32:v;
  }
  function coolerLine(w,hrs){
    var inF=indoorF();if(inF===null||w.temp_f==null)return null;
    var n=w.nowcast,wet=n&&(n.state==='rain'||n.state==='stop'||(n.state==='start'&&n.mins<=120));
    var k=wk(w.code,w.is_day)[0];if(wet||k==='rain'||k==='storm')return null;
    var out=w.temp_f;
    if(out<=inF-COOL_BY&&out>=COOL_MIN)return {i:'win',t:'Cooler outside',s:R(out)+'\u00b0 out, '+R(inF)+'\u00b0 in \u00b7 open the windows?'};
    for(var i=1;i<hrs.length&&i<=6;i++){var h=hrs[i];
      if(h.temp_f<=inF-COOL_BY&&h.temp_f>=COOL_MIN&&h.precip_pct<40)
        return {i:'win',t:'Cooler outside after '+hr12(+h.t.slice(11,13)).replace('a',' AM').replace('p',' PM'),s:R(h.temp_f)+'\u00b0 out then, '+R(inF)+'\u00b0 in now'};}
    return null;
  }
  function highlights(days){
    var out=[],wet=null,cold=null,hot=null,drop=null,i,d;
    for(i=0;i<days.length;i++){d=days[i];
      if(!wet||d.precip_pct>wet.d.precip_pct)wet={d:d,i:i};
      if(!cold||d.lo_f<cold.d.lo_f)cold={d:d,i:i};
      if(!hot||d.hi_f>hot.d.hi_f)hot={d:d,i:i};
      if(i&&days[i-1].hi_f-d.hi_f>=10&&(!drop||days[i-1].hi_f-d.hi_f>drop.delta))drop={d:d,i:i,delta:days[i-1].hi_f-d.hi_f};}
    function dn(x){return x.i===0?'today':x.i===1?'tomorrow':dayName(x.d.date);}   // mid-sentence: "Snow Thursday", "Cooler tomorrow"
    if(wet&&wet.d.precip_pct>=40)out.push({i:'rain',t:(wk(wet.d.code,1)[0]==='snow'?'Snow':wet.d.precip_pct>=60?'Rain':'Rain possible')+' '+dn(wet),s:R(wet.d.precip_pct)+'% chance · high '+R(wet.d.hi_f)+'°'});
    if(drop)out.push({i:'cool',t:'Cooler '+dn(drop),s:'High drops '+R(drop.delta)+'° to '+R(drop.d.hi_f)+'°'});
    if(cold&&cold.d.lo_f<=40)out.push({i:'cool',t:(cold.d.lo_f<=32?'Freezing ':'Chilly ')+(cold.i===0?'tonight':dn(cold)),s:'Low '+R(cold.d.lo_f)+'°'});
    if(hot&&hot.d.hi_f>=85)out.push({i:'sun',t:'Hot '+dn(hot),s:''});
    if(!out.length)out.push({i:'ok',t:'A steady week',s:'No big swings or storms in this forecast'});
    return out.slice(0,3);
  }
  /* UV: now, in words, and the high stretch of the day (WHO bands) */
  function uvWord(v){return v<3?'Low':v<6?'Moderate':v<8?'High':v<11?'Very high':'Extreme';}
  function uvTile(u){
    if(!u)return tileHtml(I.sun,'UV index','--','not available');
    var t=HV.local(),key=t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d)+'T'+HV.pad(t.h)+':00',now=null,i;
    for(i=0;i<(u.hours||[]).length;i++)if(u.hours[i].t===key)now=u.hours[i].uv;
    var dark=now===null||now<0.5,big=dark?Math.round(u.max):Math.round(now);
    var sub=u.high_from?(dark&&key>u.high_until?'Peaked at '+Math.round(u.max)+' today':'High '+hr12(+u.high_from.slice(11,13))+'\u2013'+hr12(+u.high_until.slice(11,13)))
      :(dark?'Peak today':'Peak '+Math.round(u.max)+' today');
    return '<div class="g wx-tl wx-uv'+(big>=8?' hot':'')+'"><h5>'+ic(I.sun)+'UV<span class="wt">'+esc(sub)+'</span></h5><div><b>'+big+'</b><span>'+uvWord(big)+'</span></div></div>';
  }
  /* Tides (NOAA, /api/tides): next high/low, a 24 h curve with "now", water temperature, very-high-tide flag */
  function tideTile(T){
    if(!T||!T.enabled)return '';
    if(!T.events||!T.events.length)return '<div class="g wx-tl wx-tide"><h5>'+ic(I.wave)+'Tides</h5><div><span>'+esc(T&&T.error||'Loading tides')+'</span></div></div>';
    var e=T.events,n0=e[0],n1=e[1];
    function word(x){return x.type==='H'?'high':'low';}
    var cur=T.curve||[],svg='';
    if(cur.length>1){
      var t0=+new Date(cur[0].t),t1=+new Date(cur[cur.length-1].t),mn=1e9,mx=-1e9,i,pts=[];
      for(i=0;i<cur.length;i++){mn=Math.min(mn,cur[i].ft);mx=Math.max(mx,cur[i].ft);}
      var W2=200,H2=56,pad=6;
      function X(t){return (t-t0)/(t1-t0)*W2;}function Y(v){return pad+(1-(v-mn)/Math.max(.1,mx-mn))*(H2-2*pad);}
      for(i=0;i<cur.length;i++)pts.push(X(+new Date(cur[i].t)).toFixed(1)+','+Y(cur[i].ft).toFixed(1));
      var nowT=HV.now().getTime(),nowFt=null;   // where "now" sits on the curve
      for(i=1;i<cur.length;i++){var a=+new Date(cur[i-1].t),b=+new Date(cur[i].t);if(nowT>=a&&nowT<=b){nowFt=cur[i-1].ft+(cur[i].ft-cur[i-1].ft)*(nowT-a)/(b-a);break;}}
      svg='<svg class="tc" viewBox="0 0 '+W2+' '+H2+'" preserveAspectRatio="none"><path d="M0,'+H2+' L'+pts.join(' L')+' L'+W2+','+H2+'Z" fill="rgba(255,255,255,.16)"/>'+
        '<polyline points="'+pts.join(' ')+'" fill="none" stroke="#dff4ff" stroke-width="2" vector-effect="non-scaling-stroke"/>'+
        (nowFt!==null?'<line x1="'+X(nowT).toFixed(1)+'" y1="0" x2="'+X(nowT).toFixed(1)+'" y2="'+H2+'" stroke="rgba(255,255,255,.45)" stroke-width="1" vector-effect="non-scaling-stroke"/>':'')+'</svg>'+
        (nowFt!==null?'<i class="td-dot" style="left:'+(X(nowT)/W2*100).toFixed(1)+'%;top:'+(Y(nowFt)/H2*100).toFixed(1)+'%"></i>':'');
    }
    var king=T.king?'<em class="kt">Very high tide '+esc(HV.dayWord(new Date(T.king.t),true))+' '+strTime(T.king.t)+' \u00b7 '+T.king.ft.toFixed(1)+' ft</em>':'';
    return '<div class="g wx-tl wx-tide"><h5>'+ic(I.wave)+'Tides'+(T.water_f!=null?'<span class="wt">Water '+R(T.water_f)+'\u00b0</span>':'')+'</h5>'+
      '<div class="td"><div class="tt"><b>'+(n0.type==='H'?'High':'Low')+' '+strTime(n0.t)+'</b>'+(king||'<span>'+n0.ft.toFixed(1)+' ft'+(n1?' \u00b7 then '+word(n1)+' '+strTime(n1.t):'')+'</span>')+'</div>'+
      '<div class="tg">'+svg+'</div></div></div>';
  }
  /* Hurricane watch (/api/storms): "Hurricane Milton · Cat 3"; tap for NHC's 5-day cone, with a QR for the phone */
  function moveWord(m){return m==='stationary'?'stationary':'moving '+m;}
  function stormTitle(s){return s.label+' '+s.name+(s.cat?' \u00b7 Cat '+s.cat:'');}
  function advTime(iso){if(!iso)return '';var d=new Date(iso);if(isNaN(d))return '';return HV.dayWord(d)+' '+HV.hm(d)+' '+HV.ampm(d);}
  var coneEl=null;
  function openCone(sid){
    var s=null,i,st=(D.storms&&D.storms.storms)||[];for(i=0;i<st.length;i++)if(st[i].id===sid)s=st[i];if(!s)return;
    if(!coneEl){coneEl=document.createElement('div');coneEl.className='hv-sheet wx-cone';document.body.appendChild(coneEl);
      coneEl.onclick=function(e){if(e.target.closest('.wx-cone-x'))closeCone();};}
    coneEl.innerHTML='<div class="cn-img"><img src="'+esc(s.cone)+'" alt="Forecast cone for '+esc(s.name)+'" onerror="this.parentNode.innerHTML=\'<span class=cn-none>The forecast map is not ready yet. Try again in a few minutes.</span>\'"></div>'+
      '<div class="cn-side"><h2>'+esc(stormTitle(s))+'</h2>'+
      '<div class="cn-l">'+s.wind_mph+' mph winds'+(s.pressure?' \u00b7 '+esc(s.pressure)+' mb':'')+'</div>'+
      '<div class="cn-l">'+s.dist_mi+' mi '+s.dir+' of '+esc(HV.cfg.place||'home')+'</div>'+
      '<div class="cn-l">'+esc(s.moving==='stationary'?'Stationary':'Moving '+s.moving)+'</div>'+
      '<div class="cn-s">Advisory '+esc(String(s.adv_num).replace(/^0+/,''))+(s.adv_time?' \u00b7 '+advTime(s.adv_time):'')+'</div>'+
      '<div class="cn-qr"><img src="/api/storms/qr/'+s.id+'.svg" alt=""><span>Full advisory and maps on your phone</span></div>'+
      '<button class="hv-pill wx-cone-x">Close</button></div>';
    coneEl.classList.add('on');
  }
  function closeCone(){if(coneEl)coneEl.classList.remove('on');}
  root.addEventListener('click',function(e){var c=e.target.closest('[data-storm]');if(c)openCone(c.getAttribute('data-storm'));});
  /* Tap a day in the 7-day forecast: a bottom sheet with that day's hours (temperature, rain chance, wind),
     a one-line summary, and arrows to step through the week. */
  var dayEl=null,dayShade=null,dayIx=0;
  function openDay(ix){
    var w=D.frame&&D.frame.weather,days=(w&&w.days)||[],d=days[ix];if(!d)return;dayIx=ix;
    if(!dayEl){
      dayShade=document.createElement('div');dayShade.className='wx-shade';document.body.appendChild(dayShade);dayShade.onclick=closeDay;
      dayEl=document.createElement('div');dayEl.className='hv-sheet wx-daysheet';document.body.appendChild(dayEl);
      dayEl.onclick=function(e){var b=e.target.closest('[data-go]');if(!b)return;var g=b.getAttribute('data-go');
        if(g==='x')closeDay();else openDay(dayIx+(+g));};
    }
    var hs=d.hours||[],nowKey=HV.local(),nk=nowKey.y+'-'+HV.pad(nowKey.mo)+'-'+HV.pad(nowKey.d)+'T'+HV.pad(nowKey.h)+':00';
    if(ix===0){var cut=[];for(var i=0;i<hs.length;i++)if(hs[i].t>=nk)cut.push(hs[i]);hs=cut.length?cut:hs;}   // today: from now on
    var strip='',windMax=0,windAt='',k=wk(d.code,1);
    for(i=0;i<hs.length;i++){var x=hs[i],h=+x.t.slice(11,13);
      if(x.wind!=null&&x.wind>windMax){windMax=x.wind;windAt=hr12(h);}
      strip+='<div class="wx-hc" data-h="'+h+'"><small>'+(ix===0&&i===0?'Now':hr12(h))+'</small>'+sym(wk(x.code,x.is_day)[0])+'<b>'+R(x.temp_f)+'\u00b0</b>'+
        '<i>'+(x.precip_pct>=10?R(x.precip_pct)+'%':'')+'</i><em>'+(x.wind!=null?R(x.wind):'')+'</em></div>';}
    var dt=new Date(d.date+'T12:00:00'),title=ix===0?'Today':ix===1?'Tomorrow':dayName(d.date);
    var sub=HV.MONTHS[dt.getMonth()].slice(0,3)+' '+dt.getDate();
    var line=k[1]+' \u00b7 H '+R(d.hi_f)+'\u00b0 L '+R(d.lo_f)+'\u00b0'+(d.precip_pct>=10?' \u00b7 '+R(d.precip_pct)+'% rain':'')+
      (windMax?' \u00b7 wind up to '+R(windMax)+' '+WUL+(windAt?' ('+windAt+')':''):'');
    dayEl.innerHTML='<div class="ds-top"><button class="ds-nav" data-go="-1"'+(ix<=0?' disabled':'')+' aria-label="Previous day">\u2039</button>'+
      '<div class="ds-t"><h2>'+esc(title)+' <span>'+esc(sub)+'</span></h2><div class="ds-s">'+esc(line)+'</div></div>'+
      '<button class="ds-nav" data-go="1"'+(ix>=days.length-1?' disabled':'')+' aria-label="Next day">\u203a</button>'+
      '<button class="hv-pill ds-x" data-go="x">Close</button></div>'+
      (strip?'<div class="wx-strip ds-strip">'+strip+'</div><div class="ds-k"><span>\u00b0F</span><span>rain</span><span>wind '+WUL+'</span></div>':'<div class="ds-s">No hourly forecast for this day</div>');
    dayEl.classList.add('on');dayShade.classList.add('on');
    var sc=dayEl.querySelector('.ds-strip'),six=dayEl.querySelector('.wx-hc[data-h="6"]');
    if(sc)sc.scrollLeft=ix>0&&six?six.offsetLeft-sc.offsetLeft:0;   // other days open at 6 AM
  }
  function closeDay(){if(dayEl){dayEl.classList.remove('on');dayShade.classList.remove('on');}}
  root.addEventListener('click',function(e){var r=e.target.closest('[data-day]');if(r)openDay(+r.getAttribute('data-day'));});
  function tileHtml(ico,lab,val,sub){return '<div class="g wx-tl"><h5>'+ic(ico)+lab+'</h5><div><b>'+val+'</b><span>'+esc(sub||'')+'</span></div></div>';}
  function windWord(m){return m<4?'Calm':m<12?'Light':m<20?'Breezy':m<30?'Windy':'Very windy';}

  /* headlines, most urgent first: storms (tap: cone), rain in the next 2 h, cooler outside, the week's highlights */
  function headList(w,days,hrs){
    var hl=highlights(days),nc=nowcastLine(w.nowcast),st=(D.storms&&D.storms.storms)||[],i;
    var cl=coolerLine(w,hrs);if(cl)hl=[cl].concat(hl);   // rain soon (nc) is the chip by the camera button now (HV.rainChip)
    for(i=Math.min(st.length,2)-1;i>=0;i--)hl.unshift({i:'storm',t:stormTitle(st[i]),s:st[i].dist_mi+' mi '+st[i].dir+' \u00b7 '+moveWord(st[i].moving),sid:st[i].id,cls:st[i].cat?' hu':st[i].cls==='TS'?' ts':''});   // nearest first
    return hl;
  }
  /* ---------- Modern style: one light card with the next 24 hours as a chart and the next 7 days ---------- */
  function uvNow(u){
    if(!u)return null;var t=HV.local(),key=t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d)+'T'+HV.pad(t.h)+':00',i;
    for(i=0;i<(u.hours||[]).length;i++)if(u.hours[i].t===key)return u.hours[i].uv;return null;
  }
  function drawModern(f,w){
    var k=wk(w.code,w.is_day),days=w.days||[],hrs=(w.hours24||w.hourly||[]).slice(0,24),i;
    var cond=w.is_day?({'Clear':'Sunny','Mostly clear':'Mostly sunny'}[k[1]]||k[1]):k[1];
    var hl=headList(w,days,hrs).filter(function(x){return x.i!=='rain';}),chips='';hl=hl.slice(0,hl.length&&hl[0].sid?2:3);   // no "Rain Sunday" here; a storm card keeps its full text
    for(i=0;i<hl.length;i++)chips+='<div class="wm-chip'+(hl[i].sid?' wm-storm'+hl[i].cls:'')+'"'+(hl[i].sid?' data-storm="'+hl[i].sid+'"':'')+'>'+ic(I[hl[i].i])+'<b>'+esc(hl[i].t)+'</b><span>'+esc(hl[i].s)+'</span></div>';
    var u=uvNow(w.uv),uvv=u!==null&&u>=0.5?Math.round(u):(w.uv?Math.round(w.uv.max):null);
    function pill(icon,val,unit,lab){return '<div class="wm-pill" title="'+lab+'">'+icon+'<b>'+val+'<small>'+unit+'</small></b><em>'+lab+'</em></div>';}
    var pills=pill('<svg viewBox="0 0 24 24" fill="none" stroke="#2f7de1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5z"/></svg>',R(w.precip_pct||0),'%','rain')+
      (uvv!==null?pill('<svg viewBox="0 0 24 24" fill="none" stroke="#f5a524" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',uvv,'',uvWord(uvv).toLowerCase()+' UV'):'')+
      pill('<svg viewBox="0 0 24 24" fill="none" stroke="#8a95a8" stroke-width="1.8" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/></svg>',R(w.wind_mph||0),' '+WUL,'wind');
    var top='<div class="wm-top"><div class="wm-ic">'+sym(k[0])+'</div><div class="wm-t tnum">'+R(w.temp_f)+'\u00b0</div>'+
      '<div class="wm-cs"><div class="wm-c">'+esc(cond)+'</div><div class="wm-s">'+esc(HV.cfg.place||'Home')+' \u00b7 High '+R(w.hi_f)+'\u00b0 \u00b7 Low '+R(w.lo_f)+'\u00b0'+(f.stale?' \u00b7 saved forecast':'')+'</div></div>'+
      '<div class="wm-pills">'+pills+'</div></div>';
    var hh='';
    for(i=0;i<hrs.length;i++){var x=hrs[i],h=+x.t.slice(11,13);
      var pp=Math.max(0,Math.min(100,R(x.precip_pct||0)));   // rain chance: a thin bar, its number from 10%
      hh+='<div'+(i===0?' class="now"':'')+'><i class="wm-rp'+(pp>=50?' hi':'')+'"><em>'+(pp>=10?pp+'%':'')+'</em><u style="height:'+(0.25+pp*0.0175).toFixed(2)+'vh"></u></i><span>'+sym(wk(x.code,x.is_day)[0])+'</span><small>'+(i===0?'Now':hr12(h))+'</small></div>';}
    var dd='';
    for(i=0;i<days.length;i++){var d=days[i],dt=d.date.split('-');
      dd+='<div class="wm-day'+(i===0?' today':'')+'" data-day="'+i+'"><div class="n">'+(i===0?'Today':dayName(d.date).slice(0,3)+' '+(+dt[2]))+'</div>'+
        '<span class="di">'+sym(wk(d.code,1)[0])+'</span><div class="hl tnum">'+R(d.hi_f)+'\u00b0 <span>'+R(d.lo_f)+'\u00b0</span></div>'+
        '<div class="p"><svg viewBox="0 0 24 24" fill="none" stroke="#2f7de1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5z"/></svg>'+R(d.precip_pct||0)+'%</div></div>';}
    var out='<section class="wm-card">'+top+(chips?'<div class="wm-chips">'+chips+'</div>':'')+
      '<div class="wm-plot"><i class="wm-nowcol" id="wmn"></i><div class="wm-chart" id="wmc"></div><div class="wm-hrs" style="grid-template-columns:repeat('+Math.max(1,hrs.length)+',minmax(0,1fr))">'+hh+'</div></div>'+
      '<div class="wm-days">'+dd+'</div></section>';
    if(out!==last){last=out;root.innerHTML=out;}
    drawChart(hrs,w);
  }
  /* the 24 h temperature curve, drawn at the box's real pixel size (labels never stretch) */
  var chartSig='';
  function drawChart(hrs,w){
    var el=document.getElementById('wmc');if(!el||!hrs.length)return;
    var Wd=el.clientWidth,Ht=el.clientHeight,n=hrs.length,i;if(!Wd||!Ht)return;
    var cw=Wd/n,nc=document.getElementById('wmn');
    if(nc){nc.style.left=(cw*0.08).toFixed(1)+'px';nc.style.width=(cw*0.84).toFixed(1)+'px';}     // the "now" column, through curve and hours
    var sig=Wd+'x'+Ht+':'+hrs.map(function(x){return x.t+R(x.temp_f)+x.is_day;}).join(',');if(sig===chartSig&&el.firstChild)return;chartSig=sig;
    var mn=1e9,mx=-1e9,imn=0,imx=0;for(i=0;i<n;i++){var v=hrs[i].temp_f;if(v<mn){mn=v;imn=i;}if(v>mx){mx=v;imx=i;}}
    var fs=Math.max(13,Math.round(innerHeight*0.024)),top=fs*2.6,bot=Ht*0.16;
    function X(j){return cw*(j+0.5);}function Y(v){return top+(1-(v-mn)/Math.max(3,mx-mn))*(Ht-top-bot);}
    var P=[[0,Y(hrs[0].temp_f)]];for(i=0;i<n;i++)P.push([X(i),Y(hrs[i].temp_f)]);P.push([Wd,Y(hrs[n-1].temp_f)]);
    var d='M'+P[0][0].toFixed(1)+','+P[0][1].toFixed(1);
    for(i=0;i<P.length-1;i++){var p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||p2;   // Catmull-Rom as cubic Béziers: a smooth curve through every hour
      d+=' C'+(p1[0]+(p2[0]-p0[0])/6).toFixed(1)+','+(p1[1]+(p2[1]-p0[1])/6).toFixed(1)+' '+(p2[0]-(p3[0]-p1[0])/6).toFixed(1)+','+(p2[1]-(p3[1]-p1[1])/6).toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);}
    var s='<svg width="'+Wd+'" height="'+Ht+'" viewBox="0 0 '+Wd+' '+Ht+'"><defs>'+
      '<linearGradient id="wmg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f29a1f" stop-opacity=".34"/><stop offset=".7" stop-color="#f6b44a" stop-opacity=".08"/><stop offset="1" stop-color="#f6b44a" stop-opacity="0"/></linearGradient>'+
      '<linearGradient id="wms" gradientUnits="userSpaceOnUse" x1="0" y1="'+Y(mx).toFixed(1)+'" x2="0" y2="'+Y(mn).toFixed(1)+'"><stop offset="0" stop-color="#ec7a12"/><stop offset="1" stop-color="#f6b13a"/></linearGradient></defs>';
    function tm(t){var h=+t.slice(11,13),m=+t.slice(14,16);return (h%12||12)+':'+pad(m)+(h<12?' AM':' PM');}
    /* night: a soft band from the first dark hour to the last, with sunset / sunrise times */
    var n0=-1,n1=-1;for(i=0;i<n;i++)if(!hrs[i].is_day){if(n0<0)n0=i;n1=i;}
    if(n0>=0){var bx=n0===0?0:cw*n0,bw=(n1===n-1?Wd:cw*(n1+1))-bx,lf=Math.round(fs*0.72);
      s+='<rect x="'+bx.toFixed(1)+'" y="0" width="'+bw.toFixed(1)+'" height="'+Ht+'" rx="'+(fs*0.6).toFixed(1)+'" fill="#4d6aa8" fill-opacity=".06"/>';
      if(n0>0&&w.sunset&&bw>cw*3)s+='<text x="'+(bx+fs*0.6).toFixed(1)+'" y="'+(fs*1.0).toFixed(1)+'" font-size="'+lf+'" class="wm-nl">Sunset '+tm(w.sunset)+'</text>';
      var sr=hrs[n1+1]&&w.sunrise&&w.sunrise.slice(0,10)===hrs[n1+1].t.slice(0,10)?w.sunrise:(w.next_sunrise||null);
      if(n1<n-1&&sr&&bw>cw*3)s+='<text x="'+(bx+bw-fs*0.6).toFixed(1)+'" y="'+(fs*1.0).toFixed(1)+'" font-size="'+lf+'" text-anchor="end" class="wm-nl">Sunrise '+tm(sr)+'</text>';}
    s+='<path d="'+d+' L'+Wd+','+Ht+' L0,'+Ht+'Z" fill="url(#wmg)"/><path d="'+d+'" fill="none" stroke="url(#wms)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
    /* labels: now, the high, the low and every third hour, never two side by side */
    var lab=[],cand=[0,imx,imn],j;for(i=0;i<n;i++)lab[i]=false;
    for(i=1;i<n-1;i++){var a0=R(hrs[i-1].temp_f),a1=R(hrs[i].temp_f),a2=R(hrs[i+1].temp_f);if((a1>a0&&a1>=a2)||(a1<a0&&a1<=a2))cand.push(i);}   // turning points
    for(i=3;i<n;i+=3)cand.push(i);cand.push(n-1);
    for(j=0;j<cand.length;j++){i=cand[j];if(lab[i]||(lab[i-1])||(lab[i+1]))continue;lab[i]=true;}
    for(i=0;i<n;i++){var cx=X(i).toFixed(1),cy=Y(hrs[i].temp_f);
      if(!lab[i])continue;
      if(i===0)s+='<circle cx="'+cx+'" cy="'+cy.toFixed(1)+'" r="'+(fs*0.62).toFixed(1)+'" fill="#f29a1f" fill-opacity=".18"/>';
      s+='<circle cx="'+cx+'" cy="'+cy.toFixed(1)+'" r="'+(fs*(i===0?0.36:0.27)).toFixed(1)+'" fill="'+(i===0?'#ec7a12':'#fff')+'" stroke="'+(i===0?'#fff':'#f29a1f')+'" stroke-width="'+(i===0?2.5:2.5)+'"/>'+
        '<text x="'+cx+'" y="'+(cy-fs*0.95).toFixed(1)+'" font-size="'+(i===0?Math.round(fs*1.12):fs)+'" text-anchor="middle" class="wm-tl'+(i===0?' now':(i===imx?' hi':(i===imn?' lo':'')))+'">'+R(hrs[i].temp_f)+'°</text>';}
    el.innerHTML=s+'</svg>';
  }
  window.addEventListener('resize',function(){chartSig='';if(MODERN){last='';draw();}});
  function draw(){
    var f=D.frame,w=f&&f.weather;
    if(!w||w.temp_f==null){var msg=f?'The forecast did not load. The server needs internet access to reach Open-Meteo.':'Loading the forecast';
      if(last!==msg){last=msg;root.innerHTML='<div class="hv-empty" style="padding-top:30vh;text-align:center;font-size:3.4vh">'+esc(msg)+'</div>';}return;}
    w=fixW(w);
    HV.rainChip(w.nowcast);
    if(MODERN)return drawModern(f,w);
    var k=wk(w.code,w.is_day),c=sky(k[0],w.is_day),i,days=w.days||[],hrs=w.hours24||w.hourly||[];
    root.style.setProperty('--s1',c[0]);root.style.setProperty('--s2',c[1]);
    var hl=headList(w,days,hrs).slice(0,3),hh='';
    for(i=0;i<hl.length;i++)hh+='<div class="g wx-h'+(hl[i].sid?' wx-storm'+hl[i].cls:'')+'"'+(hl[i].sid?' data-storm="'+hl[i].sid+'"':'')+'>'+ic(I[hl[i].i])+'<div><b>'+esc(hl[i].t)+'</b><span>'+esc(hl[i].s)+'</span></div></div>';
    var src=HV.cfg.place+' · Open-Meteo forecast';
    var top='<section class="wx-top"><div class="wx-hero"><div class="wx-ic">'+sym(k[0])+'</div><div><div class="wx-t tnum">'+R(w.temp_f)+'<sup>°</sup></div></div>'+
      '<div><div class="wx-c">'+k[1]+'</div><div class="wx-s">H '+R(w.hi_f)+'°  L '+R(w.lo_f)+'°<br>Feels like '+R(w.feels_f)+'°</div><div class="wx-src">'+esc(src)+(f.stale?' · saved forecast':'')+'</div></div></div>'+
      '<div class="wx-hl">'+hh+'</div></section>';

    /* hourly, with a sunrise/sunset marker where one falls */
    var sr=w.sunrise?mins(w.sunrise):null,ss=w.sunset?mins(w.sunset):null,hs='';
    for(i=0;i<hrs.length;i++){var x=hrs[i],hh2=+x.t.slice(11,13),xk=wk(x.code,x.is_day)[0];
      hs+='<div class="wx-hc"><small>'+(i===0?'Now':hr12(hh2))+'</small>'+sym(xk)+'<b>'+R(x.temp_f)+'°</b><i>'+(x.precip_pct>=10?R(x.precip_pct)+'%':'')+'</i></div>';
      var nx=hrs[i+1];
      if(nx&&nx.t.slice(0,10)===x.t.slice(0,10)){
        if(ss!=null&&w.sunset.slice(0,10)===x.t.slice(0,10)&&ss>hh2*60&&ss<(hh2+1)*60)hs+='<div class="wx-hc"><small>'+strTime(w.sunset).replace(' ','').toLowerCase()+'</small><span style="width:4.4vh;height:4.4vh">'+ic(I.set)+'</span><b style="font-size:2.3vh">Sunset</b><i></i></div>';
        if(sr!=null&&w.sunrise.slice(0,10)===x.t.slice(0,10)&&sr>hh2*60&&sr<(hh2+1)*60)hs+='<div class="wx-hc"><small>'+strTime(w.sunrise).replace(' ','').toLowerCase()+'</small><span style="width:4.4vh;height:4.4vh">'+ic(I.rise)+'</span><b style="font-size:2.3vh">Sunrise</b><i></i></div>';}}
    var hourly='<section class="g wx-hr"><h4>Hourly forecast</h4><div class="wx-strip">'+hs+'</div></section>';

    /* 7-day range bars */
    var lo=1e9,hi=-1e9;
    for(i=0;i<days.length;i++){if(days[i].lo_f<lo)lo=days[i].lo_f;if(days[i].hi_f>hi)hi=days[i].hi_f;}
    var span=Math.max(1,hi-lo),rows='';
    for(i=0;i<days.length;i++){var d=days[i],l=(d.lo_f-lo)/span*100,wd=Math.max(4,(d.hi_f-d.lo_f)/span*100),pt=(w.temp_f-d.lo_f)/Math.max(1,d.hi_f-d.lo_f)*100;
      rows+='<div class="wx-d" data-day="'+i+'"><span class="n">'+nm(d,i)+'</span><span class="ic">'+sym(wk(d.code,1)[0])+'</span><span class="p">'+(d.precip_pct>=20?R(d.precip_pct)+'%':'')+'</span><span class="lo tnum">'+R(d.lo_f)+'°</span>'+
        '<span class="bar"><u style="left:'+l+'%;width:'+Math.min(100-l,wd)+'%"></u>'+(i===0&&pt>=0&&pt<=100?'<i style="left:'+(l+Math.min(100-l,wd)*pt/100)+'%"></i>':'')+'</span><span class="hi tnum">'+R(d.hi_f)+'°</span></div>';}
    if(!days.length)rows='<div class="wx-s">Extended forecast unavailable</div>';
    var week='<section class="g wx-wk"><h4>7-day forecast</h4>'+rows+'</section>';

    /* conditions tiles */
    var nowS=HV.local(),nowM=nowS.h*60+nowS.mi,aq=f.aqi;
    var rise=w.sunrise?strTime(w.sunrise):'--',set=w.sunset?strTime(w.sunset):'--';
    var daylight=(sr!=null&&ss!=null)?dur(ss-sr)+' of daylight':'';
    var left=ss!=null?ss-nowM:0,toSet=(ss!=null&&nowM<ss)?'in '+(left>=60?Math.floor(left/60)+'h '+(left%60)+'m':left+' min'):(ss!=null?'down':'');
    function tile(ico,lab,val,sub){return '<div class="g wx-tl"><h5>'+ic(ico)+lab+'</h5><div><b>'+val+'</b><span>'+esc(sub||'')+'</span></div></div>';}
    var badAir=aq&&aq.us_aqi!=null&&aq.us_aqi>100;   // air quality only when it matters
    var pmax=0,pwhen='';   // the wettest hour left today, for the precipitation tile
    for(i=0;i<hrs.length;i++){if(hrs[i].t.slice(0,10)!==hrs[0].t.slice(0,10))break;if(hrs[i].precip_pct>pmax){pmax=hrs[i].precip_pct;pwhen=hr12(+hrs[i].t.slice(11,13));}}
    var tiles=tile(I.drop,'Precipitation',R(w.precip_pct||0)+'%',(w.precip_pct||0)<10?'chance today':pmax>=20?'most likely '+pwhen:'chance today')+
      tile(I.set,'Sunset',set.replace(' ','<small style="font-size:.5em"> ')+'</small>',toSet)+
      (badAir?tile(I.air,'Air quality',aq.us_aqi,String(aq.band||'')):
        tile(I.wind,'Wind',R(w.wind_mph||0)+'<small style="font-size:.5em"> '+WUL+'</small>',windWord(toMph(w.wind_mph||0))))+
      uvTile(w.uv)+tideTile(D.tides);
    var out=top+hourly+'<section class="wx-bot">'+week+'<div class="wx-tiles">'+tiles+'</div></section>';
    var sig=c[0]+out;
    if(sig===last)return;
    var sc=root.querySelector('.wx-strip'),keep=sc?sc.scrollLeft:0;
    last=sig;root.innerHTML=out;
    sc=root.querySelector('.wx-strip');if(sc)sc.scrollLeft=keep;
  }
  HV.chrome({light:MODERN});HV.back('Home');
  function loadF(){HVJson('/api/frame').then(function(d){D.frame=d;draw();},function(){});}
  function loadT(){HVJson('/api/tides').then(function(d){D.tides=d;draw();},function(){});}
  function loadH(){if(HV.cfg.ha)HVJson('/api/ha/state').then(function(d){D.ha=d;draw();},function(){});}
  // ?storm=<id> (the launcher's storm button) opens that storm's cone once the list is in; ?storm=1 the nearest
  var askStorm=(location.search.match(/[?&]storm=([^&]+)/)||[])[1];
  function loadS(){HVJson('/api/storms').then(function(d){D.storms=d;draw();
    if(askStorm){var st=(d&&d.storms)||[],id=decodeURIComponent(askStorm),i,hit=null;for(i=0;i<st.length;i++)if(st[i].id===id)hit=st[i].id;
      if(!hit&&st.length)hit=st[0].id;askStorm=null;if(hit)openCone(hit);}},function(){});}   // the server decides when NHC is asked
  loadF();loadT();loadS();loadH();setInterval(loadH,120000);setInterval(loadF,30000);setInterval(loadT,600000);setInterval(loadS,300000);setInterval(draw,60000);
})();
