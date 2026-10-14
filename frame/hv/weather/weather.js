/* HomeView Weather. Source: /api/frame (weather from Open-Meteo: now, hours24, days, sunrise/sunset; aqi). ES5. */
(function(){
  var root=document.getElementById('root'),esc=HV.esc,pad=HV.pad,DOW=HV.DAYS;
  var D={frame:null},last='';
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
  function sky(kind,isDay){
    if(!isDay)return kind==='rain'||kind==='storm'?['#1b2433','#3b4658']:['#0d1a38','#2b4373'];
    if(kind==='sun'||kind==='partly')return ['#2f86de','#86c2f3'];
    if(kind==='rain')return ['#46576b','#7c8da0'];
    if(kind==='storm')return ['#2f3644','#5c6578'];
    if(kind==='snow')return ['#6c87a3','#aabdd0'];
    if(kind==='fog')return ['#7f8d99','#b2bcc4'];
    return ['#5f7993','#9db3c8'];
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
    therm:'<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>'
  };

  function fixW(w){
    if(w.hi_f==null||w.temp_f>w.hi_f)w.hi_f=w.temp_f;
    if(w.lo_f==null||w.temp_f<w.lo_f)w.lo_f=w.temp_f;
    var t=w.days&&w.days[0];if(t){if(t.hi_f==null||w.hi_f>t.hi_f)t.hi_f=w.hi_f;if(t.lo_f==null||w.lo_f<t.lo_f)t.lo_f=w.lo_f;}
    return w;
  }
  function nm(d,i){return i===0?'Today':dayName(d.date).slice(0,3);}
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
    if(hot&&hot.d.hi_f>=85)out.push({i:'sun',t:'Hot '+dn(hot),s:R(hot.d.hi_f)+'° high'});
    if(!out.length)out.push({i:'ok',t:'A steady week',s:'No big swings or storms in this forecast'});
    return out.slice(0,3);
  }
  function windWord(m){return m<4?'Calm':m<12?'Light':m<20?'Breezy':m<30?'Windy':'Very windy';}

  function draw(){
    var f=D.frame,w=f&&f.weather;
    if(!w||w.temp_f==null){var msg=f?'The forecast did not load. The server needs internet access to reach Open-Meteo.':'Loading the forecast';
      if(last!==msg){last=msg;root.innerHTML='<div class="hv-empty" style="padding-top:30vh;text-align:center;font-size:3.4vh">'+esc(msg)+'</div>';}return;}
    w=fixW(w);
    var k=wk(w.code,w.is_day),c=sky(k[0],w.is_day),i,days=w.days||[],hrs=w.hours24||w.hourly||[];
    root.style.setProperty('--s1',c[0]);root.style.setProperty('--s2',c[1]);
    var hl=highlights(days),hh='';
    for(i=0;i<hl.length;i++)hh+='<div class="g wx-h">'+ic(I[hl[i].i])+'<div><b>'+esc(hl[i].t)+'</b><span>'+esc(hl[i].s)+'</span></div></div>';
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
      rows+='<div class="wx-d"><span class="n">'+nm(d,i)+'</span><span class="ic">'+sym(wk(d.code,1)[0])+'</span><span class="p">'+(d.precip_pct>=20?R(d.precip_pct)+'%':'')+'</span><span class="lo tnum">'+R(d.lo_f)+'°</span>'+
        '<span class="bar"><u style="left:'+l+'%;width:'+Math.min(100-l,wd)+'%"></u>'+(i===0&&pt>=0&&pt<=100?'<i style="left:'+(l+Math.min(100-l,wd)*pt/100)+'%"></i>':'')+'</span><span class="hi tnum">'+R(d.hi_f)+'°</span></div>';}
    if(!days.length)rows='<div class="wx-s">Extended forecast unavailable</div>';
    var week='<section class="g wx-wk"><h4>7-day forecast</h4>'+rows+'</section>';

    /* conditions tiles */
    var nowS=HV.local(),nowM=nowS.h*60+nowS.mi,aq=f.aqi;
    var rise=w.sunrise?strTime(w.sunrise):'--',set=w.sunset?strTime(w.sunset):'--';
    var daylight=(sr!=null&&ss!=null)?dur(ss-sr)+' of daylight':'';
    var toSet=(ss!=null&&nowM<ss)?'in '+dur(ss-nowM):(ss!=null?'down':'');
    function tile(ico,lab,val,sub){return '<div class="g wx-tl"><h5>'+ic(ico)+lab+'</h5><div><b>'+val+'</b><span>'+esc(sub||'')+'</span></div></div>';}
    var tiles=tile(I.rise,'Sunrise',rise.replace(' ','<small style="font-size:.5em"> ')+'</small>',daylight.replace(' of daylight',''))+
      tile(I.set,'Sunset',set.replace(' ','<small style="font-size:.5em"> ')+'</small>',toSet)+
      tile(I.wind,'Wind',R(w.wind_mph||0)+'<small style="font-size:.5em"> '+WUL+'</small>',windWord(toMph(w.wind_mph||0)))+
      tile(I.drop,'Precip',R(w.precip_pct||0)+'%','chance today')+
      tile(I.air,'Air quality',aq&&aq.us_aqi!=null?aq.us_aqi:'--',aq?String(aq.band||'').replace(/_/g,' '):'no reading')+
      tile(I.therm,'Feels like',R(w.feels_f)+'°','actual '+R(w.temp_f)+'°');
    var out=top+hourly+'<section class="wx-bot">'+week+'<div class="wx-tiles">'+tiles+'</div></section>';
    var sig=c[0]+out;
    if(sig===last)return;
    var sc=root.querySelector('.wx-strip'),keep=sc?sc.scrollLeft:0;
    last=sig;root.innerHTML=out;
    sc=root.querySelector('.wx-strip');if(sc)sc.scrollLeft=keep;
  }
  HV.chrome();HV.back('Home');
  function loadF(){HVJson('/api/frame').then(function(d){D.frame=d;draw();},function(){});}
  loadF();setInterval(loadF,30000);setInterval(draw,60000);
})();
