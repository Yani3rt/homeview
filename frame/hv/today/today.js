/* HomeView Today: the day at a glance. Sources: /api/frame (weather, calendar, air quality), /api/meals/plan
   (tonight), /api/meals/shopping, /api/frame/music (when Sonos is on), HV.state (timers). ES5 only. */
(function(){
  var root=document.getElementById('root'),esc=HV.esc,pad=HV.pad;
  var D={frame:null,plan:null,shop:null,music:null};
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
  function sym(kind){
    var sun='<circle cx="12" cy="12" r="4" fill="#ffd36a" stroke="#ffd36a"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="#ffd36a"/>';
    var cloud='<path d="M6 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.6-1.4A4.7 4.7 0 1 1 18 18Z" fill="#f2f6ff" stroke="#f2f6ff"/>';
    var moon='<path d="M18.8 16.7A8 8 0 0 1 7.3 5.2a8.2 8.2 0 1 0 11.5 11.5Z" fill="#fff0bd" stroke="#fff0bd"/>';
    var b=kind==='sun'?sun:kind==='moon'?moon:(kind==='partly'||kind==='mooncloud')?'<g transform="translate(-1,-3) scale(.8)">'+(kind==='partly'?sun:moon)+'</g>'+cloud:
      kind==='fog'?cloud+'<path d="M3 21h18M6 24h12" stroke="#d7e6f5"/>':kind==='rain'?cloud+'<path d="m7 21-1 2m7-2-1 2m7-2-1 2" stroke="#8fd0ff"/>':
      kind==='snow'?cloud+'<path d="M6 21v3m-1.5-1.5h3M13 21v3m-1.5-1.5h3M20 21v3m-1.5-1.5h3" stroke="#fff"/>':
      kind==='storm'?cloud+'<path d="m13 17-4 6h4l-2 4 7-7h-5l3-3Z" fill="#ffd36a" stroke="#ffd36a"/>':cloud;
    return '<svg viewBox="0 0 24 28" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+b+'</svg>';
  }
  /* sky colors per condition and day/night */
  function sky(kind,isDay){
    if(!isDay)return kind==='rain'||kind==='storm'?['#1b2433','#3b4658']:['#0d1a38','#2b4373'];
    if(kind==='sun'||kind==='partly')return ['#2f86de','#86c2f3'];
    if(kind==='rain')return ['#46576b','#7c8da0'];
    if(kind==='storm')return ['#2f3644','#5c6578'];
    if(kind==='snow')return ['#6c87a3','#aabdd0'];
    if(kind==='fog')return ['#7f8d99','#b2bcc4'];
    return ['#5f7993','#9db3c8'];
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
      note:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(p[n]||'')+'</svg>';
  }

  /* ---------- skeleton ---------- */
  root.innerHTML=
    '<section class="td-hero"><div class="td-date" id="date"></div><a class="td-wx" id="wx" href="/frame/hv/weather/"></a></section>'+
    '<section class="td-row"><a class="hv-card" id="ev" href="/frame/hv/calendar/"></a><a class="hv-card td-dn" id="dn" href="/frame/hv/dinner/"></a><a class="hv-card" id="hs" href="/frame/hv/shopping/"></a></section>';

  /* ---------- weather helpers ---------- */
  function fixW(w){
    if(!w||w.temp_f==null)return w;
    if(w.hi_f==null||w.temp_f>w.hi_f)w.hi_f=w.temp_f;
    if(w.lo_f==null||w.temp_f<w.lo_f)w.lo_f=w.temp_f;
    return w;
  }
  function dayName(k){var p=k.split('-');return DOW[new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).getUTCDay()];}
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

  function drawDate(){
    var t=HV.local(),f=D.frame,tags='',today=key(t);
    var w=f&&f.weather;
    if(w&&w.sunrise){
      var ns=nowStr(),txt;
      if(ns<w.sunrise.slice(0,16))txt='Sunrise '+strTime(w.sunrise);
      else if(ns<w.sunset.slice(0,16))txt='Sunset '+strTime(w.sunset);
      else txt='Sunrise '+strTime(w.next_sunrise||w.sunrise)+' tomorrow';
      tags+='<span class="td-tag">'+ico(ns<w.sunset.slice(0,16)&&ns>=w.sunrise.slice(0,16)?'sun':'moon')+txt+'</span>';
    }
    if(f){
      var ev=f.calendar_events||[],i,e,nxt=null,nd=1e9,cnt=0;
      for(i=0;i<ev.length;i++){e=ev[i];if(!HV.isHoliday(e.cal))continue;
        var sk=dk(new Date(e.start)),dn=dnum(sk)-dnum(today);
        if(dn===0){tags='<span class="td-tag hol">'+esc(e.title)+'</span>'+tags;cnt++;}
        else if(dn>0&&dn<nd){nd=dn;nxt=e;}}
      if(nxt&&nd<=30)tags+='<span class="td-tag">'+esc(nxt.title)+' in '+nd+(nd===1?' day':' days')+'</span>';
    }
    put('date','<h1 class="td-dow">'+DOW[t.dow]+'</h1><div class="td-md">'+MON[t.mo-1]+' '+t.d+'</div><div class="td-tags">'+tags+'</div>');
  }

  function drawWx(){
    var f=D.frame,el=document.getElementById('wx');
    if(!f||!f.weather||f.weather.temp_f==null){put('wx','<div class="td-wx-c">Weather is loading</div>');return;}
    var w=fixW(f.weather),k=wk(w.code,w.is_day),c=sky(k[0],w.is_day);
    el.style.setProperty('--s1',c[0]);el.style.setProperty('--s2',c[1]);
    var hrs=w.hours24||w.hourly||[],h='',i;
    for(i=0;i<hrs.length&&i<12;i+=2){var x=hrs[i],xk=wk(x.code,x.is_day)[0];
      h+='<div class="td-h"><small>'+(i===0?'Now':hr12(+x.t.slice(11,13)))+'</small>'+sym(xk)+'<b>'+R(x.temp_f)+'°</b><i>'+(x.precip_pct>=20?R(x.precip_pct)+'%':'')+'</i></div>';}
    put('wx','<div class="td-wx-top"><div class="td-wx-ic">'+sym(k[0])+'</div><div class="td-wx-t tnum">'+R(w.temp_f)+'<sup>°</sup></div>'+
      '<div class="td-wx-m"><div class="td-wx-c">'+k[1]+'</div><div class="td-wx-s">Feels like '+R(w.feels_f)+'°<br>H '+R(w.hi_f)+'°  L '+R(w.lo_f)+'°</div></div></div>'+
      '<div class="td-wx-s" style="font-weight:700">'+esc(outlook(w))+'</div><div class="td-hrs">'+h+'</div>');
  }

  /* ---------- events ---------- */
  function drawEv(){
    var f=D.frame;
    if(!f){put('ev','<h3>Coming up</h3><div class="hv-empty">Calendar is loading</div>');return;}
    var t=HV.local(),today=key(t),now=HV.now(),list=[],ev=f.calendar_events||[],i,e,s,sk,n=0;
    for(i=0;i<ev.length;i++){e=ev[i];if(HV.isHoliday(e.cal))continue;
      s=new Date(e.start);sk=dk(s);var dd=dnum(sk)-dnum(today);
      if(e.all_day){var ek=dk(new Date(e.end));if(dnum(ek)<=dnum(today))continue;if(dd<0)dd=0;}
      else{if(new Date(e.end||e.start)<=now)continue;}
      if(dd>21)continue;
      if(dd<=0)n++;
      list.push({e:e,s:s,dd:dd});}
    list.sort(function(a,b){return a.dd-b.dd||(a.e.all_day===b.e.all_day?0:a.e.all_day?-1:1)||a.s-b.s;});
    var max=3,h='<h3>Coming up<span>'+n+' today</span></h3>';
    if(!n)h+='<div class="td-none">Nothing else today<small>'+(list.length?'Next up:':'Your calendar is clear for three weeks')+'</small></div>';
    for(i=0;i<list.length&&i<max;i++){var x=list[i],ee=x.e,when,right='';
      var dl=x.dd<=0?'Today':x.dd===1?'Tomorrow':DOW[HV.local(x.s).dow].slice(0,3)+' '+HV.local(x.s).d;
      if(ee.all_day)when=dl+' · All day';
      else{when=dl+' · '+tm(x.s);
        if(x.dd===0){var mins=Math.round((x.s-now)/60000);
          right=mins<=0?'Now':mins<60?'in '+mins+' min':'in '+Math.floor(mins/60)+' h'+(mins%60?' '+(mins%60)+' m':'');}}
      if(ee.location)when+=' · '+String(ee.location).split(',')[0];
      h+='<div class="td-ev"><i style="background:'+HV.calColor(ee.cal)+'"></i><div><b>'+esc(ee.title)+'</b><span>'+esc(when)+'</span></div>'+(right?'<em>'+right+'</em>':'')+'</div>';}
    put('ev',h);
  }

  /* ---------- dinner ---------- */
  function mealFor(k){var P=D.plan;return P&&P.days?P.days[k]||null:null;}
  function drawDn(){
    var P=D.plan,el=document.getElementById('dn');
    if(!P){put('dn','<div class="td-dn-t"><em>Dinner</em><b>Loading the plan</b></div>');el.className='hv-card td-dn plain';return;}
    var t=HV.local(),today=key(t),tom=dk(new Date(HV.now().getTime()+864e5));
    var m=mealFor(today),m2=mealFor(tom),chip='Tonight',name,sub='';
    if(m){name=m.name;sub=[m.category,m.area].filter(Boolean).join(' · ');}
    else{name='Nothing planned';sub='Tap to pick a dinner';}
    var nxt=m2?'Tomorrow: '+m2.name:'';
    var src=m&&m.thumb?m.thumb+'/medium':'';
    el.className='hv-card td-dn'+(src?'':' plain');
    el.setAttribute('href',m?'/frame/hv/dinner/':'/frame/hv/meals/');
    var h=(src?'<img id="dn-img" alt="" src="'+esc(src)+'">':'')+
      '<div class="td-dn-t"><em>'+chip+'</em><b>'+esc(name)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'')+(nxt?'<span>'+esc(nxt)+'</span>':'')+'</div>';
    if(shown.dn===h)return;
    put('dn',h);
    var img=document.getElementById('dn-img');
    if(img)img.onerror=function(){img.parentNode.removeChild(img);el.className='hv-card td-dn plain';};
  }

  /* ---------- in the kitchen: timers, the shopping list, air quality, music ---------- */
  function facts(){
    var out=[],i,tms=HV.state.timers||[],S=D.shop,aq=D.frame&&D.frame.aqi,M=D.music;
    for(i=0;i<tms.length&&i<2;i++)out.push({c:'warn',i:'timer',t:tms[i].label||'Timer',s:'Timer running',tm:tms[i].ends,pri:1});
    if(S){if(S.left)out.push({c:'blue',i:'cart',t:S.left+' to buy',s:S.meals.length?'For '+S.meals.length+' planned dinner'+(S.meals.length===1?'':'s'):'On the shopping list',pri:2});
      else out.push({c:'ok',i:'cart',t:S.items.length?'Shopping done':'No shopping list',s:S.items.length?'Everything is checked off':'Plan dinners and the list builds itself',pri:5});}
    if(aq&&aq.us_aqi!=null)out.push({c:aq.us_aqi>100?'bad':aq.us_aqi>50?'warn':'ok',i:'air',t:'Air quality '+aq.us_aqi,s:String(aq.band||'')+(aq.us_aqi>100?' · keep windows shut':aq.us_aqi<=50?' · windows are fine':''),pri:aq.us_aqi>50?2:6});
    var rs=(M&&M.rooms)||[],pl=null;for(i=0;i<rs.length;i++)if(!pl&&rs[i].ok&&rs[i].state==='PLAYING'&&rs[i].title)pl=rs[i];
    if(pl)out.push({c:'',i:'note',t:pl.title,s:(pl.artist?pl.artist+' · ':'')+pl.name,pri:3});
    if(!tms.length)out.push({c:'',i:'timer',t:'No timers running',s:'Start one from Timer',pri:7});
    out.sort(function(a,b){return a.pri-b.pri;});
    return out.slice(0,4);
  }
  function drawHs(){
    var fs=facts(),h='<h3>In the kitchen</h3>',i;
    for(i=0;i<fs.length;i++){var x=fs[i];
      h+='<div class="td-f '+x.c+'"><span class="ic">'+ico(x.i)+'</span><div><b>'+esc(x.t)+'</b><span>'+esc(x.s)+'</span></div>'+
        (x.tm?'<u class="tnum tmv" data-e="'+x.tm+'"></u>':'')+'</div>';}
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
  function loadH(){if(HV.cfg.sonos)HVJson('/api/frame/music').then(function(d){D.music=d;drawHs();},function(){});else drawHs();}
  HV.chrome({light:true});HV.back('Home');
  loadF();loadK();loadH();
  setInterval(loadF,30000);setInterval(loadK,60000);setInterval(loadH,30000);
  setInterval(function(){drawDate();drawEv();drawWx();tickT();},20000);setInterval(tickT,1000);
  HV.on(function(){drawHs();});
})();
