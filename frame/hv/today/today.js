/* HomeView Today: the day at a glance. Sources: /api/frame (weather, calendar, air quality), /api/meals/plan
   (tonight), /api/meals/shopping, /api/ha/state (inside, AC, door; when Home Assistant is on), /api/storms,
   /api/frame/music (when Sonos is on), HV.state (timers). ES5 only.
   Layout: [ date + tags ][ weather ] over [ coming up (wide) ][ tonight ][ at home ]. */
(function(){
  var root=document.getElementById('root'),esc=HV.esc,pad=HV.pad;
  var D={frame:null,plan:null,shop:null,music:null,ha:null,storms:null};
  var shown={};
  var DOW=HV.DAYS,MON=HV.MONTHS;

  function key(o){return o.y+'-'+pad(o.mo)+'-'+pad(o.d);}
  function dk(d){return key(HV.local(d));}
  function dnum(k){var p=k.split('-');return Math.round(Date.UTC(+p[0],+p[1]-1,+p[2])/864e5);}
  function tm(d){return HV.hm(d)+' '+HV.ampm(d);}
  function hr12(h){return (h%12||12)+(h<12?'a':'p');}
  function R(n){return Math.round(n);}
  function nowStr(){var t=HV.local();return key(t)+'T'+pad(t.h)+':'+pad(t.mi);}
  function strTime(s){var h=+s.slice(11,13),m=+s.slice(14,16);return (h%12||12)+':'+pad(m)+' '+(h<12?'AM':'PM');}
  function put(id,html){if(shown[id]===html)return;shown[id]=html;var el=document.getElementById(id);if(el)el.innerHTML=html;}

  /* weather words, as in the old Today page */
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
  function ico(n){
    var p={
      washer:'<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M8 6.5h.01M11 6.5h2"/>',
      dryer:'<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M10 13c1-1.5 3 1.5 4 0"/>',
      car:'<path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/><path d="M7 18h.01M17 18h.01"/>',
      bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
      air:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
      therm:'<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>',
      warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v4.5M12 17.5h.01"/>',
      timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
      bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
      moon:'<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z"/>',
      cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      fork:'<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 21V3c-2 1-3 4-3 8h3"/>',
      cart:'<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
      door:'<path d="M5 21V4a1 1 0 0 1 1-1h9l3 1v17M3 21h18M13 12h.01"/>',
      win:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>',
      house:'<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
      note:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(p[n]||'')+'</svg>';
  }

  /* ---------- skeleton ---------- */
  root.innerHTML=
    '<section class="td-hero"><div class="td-date" id="date"></div><a class="td-wx tw" id="wx" href="/frame/hv/weather/"></a></section>'+
    '<section class="td-row"><a class="hv-card td-cal" id="ev" href="/frame/hv/calendar/"></a><a class="hv-card td-dn" id="dn" href="/frame/hv/dinner/"></a><div class="hv-card td-home" id="hs"></div></section>';

  /* ---------- weather helpers ---------- */
  function fixW(w){
    if(!w||w.temp_f==null)return w;
    if(w.hi_f==null||w.temp_f>w.hi_f)w.hi_f=w.temp_f;
    if(w.lo_f==null||w.temp_f<w.lo_f)w.lo_f=w.temp_f;
    return w;
  }
  function dayName(k){var p=k.split('-');return DOW[new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).getUTCDay()];}
  /* the next two hours first (server: weather.nowcast), then the week */
  function nowcast(n){
    if(!n)return '';
    if(n.state==='start')return n.mins<=5?'Rain starting now':'Rain around '+strTime(n.at)+' · in '+n.mins+' min';
    if(n.state==='stop')return 'Raining now, stopping around '+strTime(n.at);
    if(n.state==='rain')return 'Raining now, for the next two hours';
    return '';
  }
  function outlook(w){
    var days=w.days||[],t=days[0],i,d,prev;
    var kindOf=function(x){return wk(x.code,1)[0]==='snow'?'Snow':'Rain';};
    if(t&&t.precip_pct>=50)return kindOf(t)+' likely today, '+R(t.precip_pct)+'%';
    for(i=1;i<days.length&&i<4;i++){d=days[i];
      if(d.precip_pct>=50)return kindOf(d)+' likely '+(i===1?'tomorrow':dayName(d.date))+', '+R(d.precip_pct)+'%';}
    for(i=1;i<days.length&&i<5;i++){d=days[i];prev=days[i-1];
      if(prev.hi_f-d.hi_f>=10)return 'Cooler '+(i===1?'tomorrow':dayName(d.date))+', high '+R(d.hi_f)+'°';}
    for(i=0;i<days.length&&i<4;i++){if(days[i].lo_f<=32)return 'Freezing '+(i===0?'tonight':'on '+dayName(days[i].date))+', low '+R(days[i].lo_f)+'°';}
    return 'A steady week ahead';
  }

  /* ---------- Home Assistant bits: indoor temperature, humidity, AC, door ---------- */
  function haFind(test){var xs=(D.ha&&D.ha.items)||[],i;for(i=0;i<xs.length;i++)if(xs[i].avail!==false&&test(xs[i]))return xs[i];return null;}
  function num(x){var n=x?parseFloat(x.state):NaN;return isNaN(n)?null:n;}
  function indoorF(){var it=haFind(function(x){return x.kind==='sensor'&&(x.dc==='temperature'||/temp/i.test(x.id));}),v=num(it);
    return v==null?null:(/C/.test(it.state)?v*9/5+32:v);}
  /* same rule as the launcher chip and the Weather screen: 3°+ cooler out, 60°+ out, and dry */
  function cooler(){
    var w=D.frame&&D.frame.weather,inF=indoorF();if(!w||w.temp_f==null||inF==null)return null;
    var n=w.nowcast,wet=(n&&(n.state==='rain'||n.state==='stop'||(n.state==='start'&&n.mins<=120)))||w.code>=51;
    return !wet&&w.temp_f<=inF-3&&w.temp_f>=60?{out:w.temp_f,inF:inF}:null;
  }

  /* ---------- date and the day's tags (most important first, at most three) ---------- */
  function drawDate(){
    var t=HV.local(),f=D.frame,today=key(t),tags=[],i;
    var st=(D.storms&&D.storms.storms)||[];
    for(i=0;i<st.length&&i<1;i++)tags.push('<a class="td-tag '+(st[i].cat?'hu':'ts')+'" href="/frame/hv/weather/">'+ico('warn')+
      esc(st[i].label+' '+st[i].name)+' · '+st[i].dist_mi+' mi</a>');
    var c=cooler();
    if(c)tags.push('<a class="td-tag cool" href="/frame/hv/weather/">'+ico('win')+'Cooler outside · '+R(c.out)+'°</a>');
    var nxt=null,nd=1e9;
    if(f){var ev=f.calendar_events||[],e;
      for(i=0;i<ev.length;i++){e=ev[i];if(!HV.isHoliday(e.cal))continue;
        var dn=dnum(dk(new Date(e.start)))-dnum(today);
        if(dn===0)tags.push('<span class="td-tag hol">'+esc(e.title)+'</span>');
        else if(dn>0&&dn<nd){nd=dn;nxt=e;}}}
    var w=f&&f.weather;
    if(w&&w.sunrise){
      var ns=nowStr(),txt,up=ns>=w.sunrise.slice(0,16)&&ns<w.sunset.slice(0,16);
      if(ns<w.sunrise.slice(0,16))txt='Sunrise '+strTime(w.sunrise);
      else if(up)txt='Sunset '+strTime(w.sunset);
      else txt='Sunrise '+strTime(w.next_sunrise||w.sunrise);
      tags.push('<span class="td-tag">'+ico(up?'sun':'moon')+txt+'</span>');
    }
    if(nxt&&nd<=30)tags.push('<span class="td-tag">'+esc(nxt.title)+' in '+nd+(nd===1?' day':' days')+'</span>');
    put('date','<h1 class="td-dow">'+DOW[t.dow]+'</h1><div class="td-md">'+MON[t.mo-1]+' '+t.d+'</div><div class="td-tags" id="tags">'+tags.slice(0,3).join('')+'</div>');
    var tg=document.getElementById('tags');   // one line only: drop the least important tags that do not fit
    while(tg&&tg.children.length>1&&tg.scrollWidth>tg.clientWidth+1)tg.removeChild(tg.lastChild);
  }

  /* Modern weather card (same look as the Weather screen's Modern style): line icon, big temperature, the
     headline (rain soon or the week), then the next 12 hours as a smooth curve with rain bars and icons */
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
  var NH=13;   // now + the next 12 hours
  function drawWx(){
    var f=D.frame;
    if(!f||!f.weather||f.weather.temp_f==null){put('wx','<div class="tw-c">'+(f?'The forecast did not load':'Weather is loading')+'</div>');return;}
    var w=fixW(f.weather),k=wk(w.code,w.is_day),hrs=(w.hours24||w.hourly||[]).slice(0,NH),i,hh='';
    var cond=w.is_day?({'Clear':'Sunny','Mostly clear':'Mostly sunny'}[k[1]]||k[1]):k[1];
    for(i=0;i<hrs.length;i++){var x=hrs[i];
      hh+='<div'+(i===0?' class="now"':'')+'>'+(i%2?'':'<span>'+symL(wk(x.code,x.is_day)[0])+'</span><small>'+(i===0?'Now':hr12(+x.t.slice(11,13)))+'</small>')+'</div>';}
    var nc=nowcast(w.nowcast);
    put('wx','<div class="tw-top"><div class="tw-ic">'+symL(k[0])+'</div><div class="tw-t tnum">'+R(w.temp_f)+'°</div>'+
      '<div class="tw-cs"><div class="tw-c">'+esc(cond)+'<span>H '+R(w.hi_f)+'° L '+R(w.lo_f)+'°</span></div>'+
      '<div class="tw-o'+(nc?' rain':'')+'">'+esc(nc||outlook(w))+'</div></div></div>'+
      '<div class="tw-plot"><i class="tw-nowcol" id="twn"></i><div class="tw-chart" id="twc"></div>'+
      '<div class="tw-hrs" style="grid-template-columns:repeat('+Math.max(1,hrs.length)+',minmax(0,1fr))">'+hh+'</div></div>');
    drawCurve(hrs,w);
  }
  /* the curve, drawn at the box's real pixel size so labels never stretch (as drawChart in weather.js) */
  var curveSig='';
  function drawCurve(hrs,w){
    var el=document.getElementById('twc');if(!el||!hrs.length)return;
    var Wd=el.clientWidth,Ht=el.clientHeight,n=hrs.length,i;if(!Wd||!Ht)return;
    var cw=Wd/n,nc=document.getElementById('twn');
    if(nc){nc.style.left=(cw*0.04).toFixed(1)+'px';nc.style.width=(cw*0.92).toFixed(1)+'px';}
    var sig=Wd+'x'+Ht+':'+hrs.map(function(x){return x.t+R(x.temp_f)+x.is_day+R(x.precip_pct||0);}).join(',');if(sig===curveSig&&el.firstChild)return;curveSig=sig;
    var mn=1e9,mx=-1e9,imn=0,imx=0;for(i=0;i<n;i++){var v=hrs[i].temp_f;if(v<mn){mn=v;imn=i;}if(v>mx){mx=v;imx=i;}}
    var fs=Math.max(13,Math.round(innerHeight*0.021)),top=fs*1.9,bot=Math.max(4,Ht*0.12);
    function X(j){return cw*(j+0.5);}function Y(v){return top+(1-(v-mn)/Math.max(3,mx-mn))*(Ht-top-bot);}
    var P=[[0,Y(hrs[0].temp_f)]];for(i=0;i<n;i++)P.push([X(i),Y(hrs[i].temp_f)]);P.push([Wd,Y(hrs[n-1].temp_f)]);
    var d='M'+P[0][0].toFixed(1)+','+P[0][1].toFixed(1);
    for(i=0;i<P.length-1;i++){var p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||p2;   // Catmull-Rom as cubic Béziers
      d+=' C'+(p1[0]+(p2[0]-p0[0])/6).toFixed(1)+','+(p1[1]+(p2[1]-p0[1])/6).toFixed(1)+' '+(p2[0]-(p3[0]-p1[0])/6).toFixed(1)+','+(p2[1]-(p3[1]-p1[1])/6).toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);}
    var s='<svg width="'+Wd+'" height="'+Ht+'" viewBox="0 0 '+Wd+' '+Ht+'"><defs>'+
      '<linearGradient id="twg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f29a1f" stop-opacity=".34"/><stop offset=".7" stop-color="#f6b44a" stop-opacity=".08"/><stop offset="1" stop-color="#f6b44a" stop-opacity="0"/></linearGradient>'+
      '<linearGradient id="tws" gradientUnits="userSpaceOnUse" x1="0" y1="'+Y(mx).toFixed(1)+'" x2="0" y2="'+Y(mn).toFixed(1)+'"><stop offset="0" stop-color="#ec7a12"/><stop offset="1" stop-color="#f6b13a"/></linearGradient></defs>';
    /* night: a soft band over the dark hours */
    var n0=-1,n1=-1;for(i=0;i<n;i++)if(!hrs[i].is_day){if(n0<0)n0=i;n1=i;}
    if(n0>=0){var bx=n0===0?0:cw*n0,bw=(n1===n-1?Wd:cw*(n1+1))-bx;
      s+='<rect x="'+bx.toFixed(1)+'" y="0" width="'+bw.toFixed(1)+'" height="'+Ht+'" rx="'+(fs*0.5).toFixed(1)+'" fill="#4d6aa8" fill-opacity=".06"/>';}
    /* rain: a thin blue bar per hour from 10%, deeper from 50% */
    for(i=0;i<n;i++){var pp=hrs[i].precip_pct||0;if(pp<10)continue;var bh=(Ht-top)*0.45*pp/100;
      s+='<rect x="'+(X(i)-cw*0.14).toFixed(1)+'" y="'+(Ht-bh).toFixed(1)+'" width="'+(cw*0.28).toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="'+(cw*0.1).toFixed(1)+'" fill="#2a73d6" fill-opacity="'+(pp>=50?'.55':'.25')+'"/>';}
    s+='<path d="'+d+' L'+Wd+','+Ht+' L0,'+Ht+'Z" fill="url(#twg)"/><path d="'+d+'" fill="none" stroke="url(#tws)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    /* labels on the same hours as the icons under them (now, then every two hours) */
    for(i=0;i<n;i+=2){var cx=X(i).toFixed(1),cy=Y(hrs[i].temp_f);
      if(i===0)s+='<circle cx="'+cx+'" cy="'+cy.toFixed(1)+'" r="'+(fs*0.6).toFixed(1)+'" fill="#f29a1f" fill-opacity=".18"/>';
      s+='<circle cx="'+cx+'" cy="'+cy.toFixed(1)+'" r="'+(fs*(i===0?0.34:0.26)).toFixed(1)+'" fill="'+(i===0?'#ec7a12':'#fff')+'" stroke="'+(i===0?'#fff':'#f29a1f')+'" stroke-width="2.2"/>'+
        '<text x="'+cx+'" y="'+(cy-fs*0.8).toFixed(1)+'" font-size="'+(i===0?Math.round(fs*1.1):fs)+'" text-anchor="middle" class="tw-tl'+(i===0?' now':(i===imx?' hi':(i===imn?' lo':'')))+'">'+R(hrs[i].temp_f)+'°</text>';}
    el.innerHTML=s+'</svg>';
  }
  window.addEventListener('resize',function(){curveSig='';delete shown.wx;drawWx();});

  /* ---------- coming up: today, then the next days, one line per event; trimmed to what fits ---------- */
  function drawEv(){
    var f=D.frame;
    if(!f){put('ev','<h3>Coming up</h3><div class="hv-empty">Calendar is loading</div>');return;}
    var today=key(HV.local()),now=HV.now(),list=[],ev=f.calendar_events||[],i,e,s,dd,n=0;
    for(i=0;i<ev.length;i++){e=ev[i];if(HV.isHoliday(e.cal))continue;
      s=new Date(e.start);dd=dnum(dk(s))-dnum(today);
      if(e.all_day){if(dnum(dk(new Date(e.end)))<=dnum(today))continue;if(dd<0)dd=0;}
      else if(new Date(e.end||e.start)<=now)continue;
      if(dd>21)continue;
      if(dd===0)n++;
      list.push({e:e,s:s,dd:dd});}
    list.sort(function(a,b){return a.dd-b.dd||(a.e.all_day===b.e.all_day?0:a.e.all_day?-1:1)||a.s-b.s;});
    var h='<h3>Coming up</h3><div class="td-evl" id="evl">',last=-1,groups=0;
    if(!n)h+='<div class="td-day">Today</div><div class="td-ev none"><b>Nothing else today</b></div>';
    for(i=0;i<list.length&&i<9;i++){var x=list[i],ee=x.e,lt=HV.local(x.s),right,cls='';
      if(x.dd!==last){if(++groups>3)break;last=x.dd;
        h+='<div class="td-day">'+(x.dd===0?'Today':x.dd===1?'Tomorrow':DOW[lt.dow]+', '+MON[lt.mo-1].slice(0,3)+' '+lt.d)+'</div>';}
      if(ee.all_day){right='All day';cls=' ad';}
      else{right=tm(x.s);
        if(x.dd===0){var mins=Math.round((x.s-now)/60000);
          if(mins<=0)right='Now';else if(mins<120)right='in '+(mins<60?mins+' min':Math.floor(mins/60)+' h'+(mins%60?' '+(mins%60)+' m':''));
          if(mins<120)cls=' soon';}}
      h+='<div class="td-ev'+cls+'"><i style="background:'+HV.calColor(ee.cal)+'"></i><b>'+esc(ee.title)+'</b><em>'+esc(right)+'</em></div>';}
    if(!list.length)h+='<div class="td-ev none"><b>The calendar is clear for three weeks</b></div>';
    put('ev',h+'</div>');
    fit();
  }
  /* drop events from the end until the list fits, and never leave a day label with no event under it */
  function fit(){
    var l=document.getElementById('evl'),k;if(!l)return;
    while(l.scrollHeight>l.clientHeight+1&&l.children.length>2){l.removeChild(l.lastChild);
      for(k=l.lastChild;k&&k.className==='td-day';k=l.lastChild)l.removeChild(k);}
  }

  /* ---------- dinner ---------- */
  function mealFor(k){var P=D.plan;return P&&P.days?P.days[k]||null:null;}
  function drawDn(){
    var P=D.plan,el=document.getElementById('dn');
    if(!P){put('dn','<div class="td-dn-t"><em>Dinner</em><b>Loading the plan</b></div>');el.className='hv-card td-dn plain';return;}
    var t=HV.local(),today=key(t),tom=dk(new Date(HV.now().getTime()+864e5));
    var m=mealFor(today),m2=mealFor(tom),name,sub='';
    if(m){name=m.name;sub=[m.category,m.area].filter(Boolean).join(' · ');}
    else{name='Nothing planned';sub='Tap to pick a dinner';}
    var nxt=m2?'Tomorrow: '+m2.name:'';
    var src=m&&m.thumb?m.thumb+'/medium':'';
    el.className='hv-card td-dn'+(src?'':' plain');
    el.setAttribute('href',m?'/frame/hv/dinner/':'/frame/hv/meals/');
    var h=(src?'<img id="dn-img" alt="" src="'+esc(src)+'">':'')+
      '<div class="td-dn-t"><em>Tonight</em><b>'+esc(name)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'')+(nxt?'<span>'+esc(nxt)+'</span>':'')+'</div>';
    if(shown.dn===h)return;
    put('dn',h);
    var img=document.getElementById('dn-img');
    if(img)img.onerror=function(){img.parentNode.removeChild(img);el.className='hv-card td-dn plain';};
  }

  /* ---------- at home: running timers, an open door, inside, the shopping list, music, bad air.
     Each row opens its own screen. Rows that only say "nothing" fill in last. ---------- */
  function facts(){
    var out=[],i,tms=HV.state.timers||[],S=D.shop,aq=D.frame&&D.frame.aqi,M=D.music;
    for(i=0;i<tms.length&&i<2;i++)out.push({c:'warn',i:'timer',t:tms[i].label||'Timer',s:'Timer running',tm:tms[i].ends,u:'timer/',pri:1});
    if(HV.cfg.ha&&D.ha){
      var door=haFind(function(x){return x.kind==='sensor'&&/door|window|opening/.test(x.dc||'')&&x.on;});
      if(door)out.push({c:'warn',i:'door',t:door.name+' is open',s:'Since the last check',u:'ha/',pri:1});
      var inF=indoorF(),hum=num(haFind(function(x){return x.kind==='sensor'&&(x.dc==='humidity'||/humid/i.test(x.id));}));
      var ac=haFind(function(x){return x.kind==='climate';});
      if(inF!=null||hum!=null){
        var band=inF==null?'':inF<66?' t-cold':inF<71?' t-cool':inF<76?' t-comfy':inF<80?' t-warm':' t-hot';
        var acs=ac?ac.name+(ac.on?' on · '+String(ac.state).toLowerCase():' off'):'';
        out.push({c:'in'+band,i:'house',t:(inF!=null?'Inside '+(Math.round(inF*10)/10)+'°':'Inside')+(hum!=null?' · '+R(hum)+'%':''),
          s:acs||'Humidity',u:'ha/',pri:3});}
    }
    if(S){var todo=[];for(i=0;i<(S.items||[]).length;i++)if(!S.items[i].checked)todo.push(S.items[i].name);
      out.push(S.left?{c:'blue',i:'cart',t:S.left+' to buy',s:todo.slice(0,4).join(', '),u:'shopping/',pri:2}:
        {c:'',i:'cart',t:'Nothing on the list',s:'Tap to add something',u:'shopping/',pri:6});}
    var rs=(M&&M.rooms)||[],pl=null;for(i=0;i<rs.length;i++)if(!pl&&rs[i].ok&&rs[i].state==='PLAYING'&&rs[i].title)pl=rs[i];
    if(pl)out.push({c:'',i:'note',t:pl.title,s:(pl.artist?pl.artist+' · ':'')+pl.name,u:'music/',pri:4});
    if(aq&&aq.us_aqi!=null&&aq.us_aqi>50)out.push({c:aq.us_aqi>100?'bad':'warn',i:'air',t:'Air quality '+aq.us_aqi,s:String(aq.band||'')+(aq.us_aqi>100?' · keep the windows shut':''),u:'weather/',pri:2});
    if(!tms.length)out.push({c:'',i:'timer',t:'No timers running',s:'Tap to start one',u:'timer/',pri:7});
    out.sort(function(a,b){return a.pri-b.pri;});
    return out.slice(0,3);
  }
  function drawHs(){
    var fs=facts(),h='<h3>At home</h3>',i;
    for(i=0;i<fs.length;i++){var x=fs[i];
      h+='<a class="td-f '+x.c+'" href="/frame/hv/'+x.u+'"><span class="ic">'+ico(x.i)+'</span><div><b>'+esc(x.t)+'</b><span>'+esc(x.s)+'</span></div>'+
        (x.tm?'<u class="tnum tmv" data-e="'+x.tm+'"></u>':'')+'</a>';}
    put('hs',h);tickT();
  }
  function tickT(){
    var els=document.querySelectorAll('.tmv'),now=HV.now().getTime()/1000,i;
    for(i=0;i<els.length;i++){var l=(+els[i].getAttribute('data-e'))-now;els[i].textContent=l<=0?'Done':HV.mmss(l);}
  }

  function all(){drawDate();drawWx();drawEv();drawDn();drawHs();}
  function loadF(){HVJson('/api/frame').then(function(d){D.frame=d;all();},function(){});}
  function loadK(){HVJson('/api/meals/plan').then(function(d){if(d&&d.ok!==false){D.plan=d;drawDn();}},function(){});
    HVJson('/api/meals/shopping').then(function(d){if(d&&d.ok!==false){D.shop=d;drawHs();}},function(){});}
  function loadH(){
    if(HV.cfg.sonos)HVJson('/api/frame/music').then(function(d){D.music=d;drawHs();},function(){});
    if(HV.cfg.ha)HVJson('/api/ha/state').then(function(d){if(d&&d.ok!==false){D.ha=d;drawHs();drawDate();}},function(){});
    if(!HV.cfg.sonos&&!HV.cfg.ha)drawHs();
  }
  function loadS(){HVJson('/api/storms').then(function(d){if(d&&d.ok!==false){D.storms=d;drawDate();}},function(){});}   // the server decides when NHC is asked
  HV.chrome({light:true});HV.back('Home');
  loadF();loadK();loadH();loadS();
  setInterval(loadF,30000);setInterval(loadK,60000);setInterval(loadH,30000);setInterval(loadS,300000);
  setInterval(function(){drawDate();drawEv();drawWx();tickT();},20000);setInterval(tickT,1000);
  HV.on(function(){drawHs();});
})();
