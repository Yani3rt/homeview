/* HomeView Night (while the Standby schedule has the Night clock; default 23:00-05:00 home): the dim red clock. One 1 s timer redraws the clock on the
   minute, moves the layout a few pixels every 4 minutes (burn-in), refreshes /api/frame every 10 min.
   Tap goes to Home. A page opened during the night returns to Home at 05:00; a daytime preview stays. */
(function(){
  var $=function(id){return document.getElementById(id);};
  var wx=null, cal=[], okAt=0, lastMin=-1, shiftN=-1, wasNight=false, fetchedAt=0;
  var STALE=3*3600000;
  var DX=[0,-14,12,-8,16,-16,6,10], DY=[0,10,-12,14,-6,8,-14,4];

  function isNight(){return HV.nightNow();}
  function dayStr(t){return t.y+'-'+HV.pad(t.mo)+'-'+HV.pad(t.d);}
  function addDay(s,n){var d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function hm12(iso){var h=+iso.slice(11,13),m=iso.slice(14,16);return ((h%12)||12)+':'+m+(h<12?' AM':' PM');}
  function svg(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';}
  var IC={
    cal:svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    temp:svg('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
    sun:svg('<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 5v4M5 9l2 2M19 9l-2 2"/>')
  };

  function draw(){
    var t=HV.local(), now=HV.now();
    $('clock').textContent=HV.hm(now);
    $('date').textContent=HV.DAYS[t.dow]+', '+HV.MONTHS[t.mo-1]+' '+t.d;
    var today=dayStr(t), tomorrow=addDay(today,1);
    var morning=t.h>=12?tomorrow:today;      /* after midnight "the morning" is today's date */
    var h='', ok=wx&&Date.now()-okAt<STALE;

    /* next up: first timed event that starts after now, else an all-day event covering the morning */
    var ev=null, nowIso=today+'T'+HV.pad(t.h)+':'+HV.pad(t.mi), best=null;
    cal.forEach(function(e){
      if(!e||!e.start||HV.isHoliday(e.cal))return;
      if(!e.all_day&&e.start.slice(0,16)>nowIso){if(!best||e.start<best.start)best=e;}
    });
    ev=best;
    if(!ev)cal.forEach(function(e){if(!ev&&e&&e.all_day&&!HV.isHoliday(e.cal)&&e.start.slice(0,10)<=morning&&e.end.slice(0,10)>morning)ev=e;});
    if(ev){
      var d0=ev.start.slice(0,10), when=ev.all_day?'All day':hm12(ev.start);
      var dn=d0===today?'Today':(d0===tomorrow?'Tomorrow':HV.DAYS[new Date(d0+'T12:00:00Z').getUTCDay()]);
      h+=card('cal','Next up',ev.title,dn+' · '+when);
    }else h+=card('cal','Next up','Nothing planned','The next two weeks are clear');

    if(ok){
      var lo=null,hi=null,day=null;
      (wx.days||[]).forEach(function(x){if(x&&x.date===morning)day=x;});
      var cut=today+'T'+HV.pad(t.h), rows=(wx.hours24||[]).filter(function(r){return r&&typeof r.t==='string'&&r.t.slice(0,13)>=cut&&r.temp_f!=null;}).slice(0,8);
      if(rows.length)lo=Math.min.apply(null,rows.map(function(r){return r.temp_f;}));
      else if(wx.lo_f!=null)lo=wx.lo_f;
      if(day&&day.hi_f!=null)hi=day.hi_f;
      var sub=[];
      if(lo!=null)sub.push('Low '+Math.round(lo)+'°');
      if(hi!=null)sub.push((morning===tomorrow?'Tomorrow':'Today')+' high '+Math.round(hi)+'°');
      h+=card('temp','Outside',Math.round(wx.temp_f)+'°',sub.join(' · ')||'Forecast unavailable');
      var sr=(wx.sunrise&&wx.sunrise.slice(0,10)===morning)?wx.sunrise:(wx.next_sunrise&&wx.next_sunrise.slice(0,10)===morning?wx.next_sunrise:null);
      var extra='';
      if(day&&day.precip_pct!=null)extra=day.precip_pct+'% chance of precipitation';
      if(sr)h+=card('sun','Sunrise',hm12(sr),extra);
      else h+=card('sun','Sunrise','--','Not in the forecast');
    }else h+=card('temp','Outside','--','Weather unavailable');
    $('row').innerHTML=h;
  }
  function card(ic,title,big,sub){return '<div class="nt-card"><h3>'+IC[ic]+HV.esc(title)+'</h3><b'+(ic==='cal'?' class="ev"':'')+'>'+HV.esc(big)+'</b><small>'+HV.esc(sub||' ')+'</small></div>';}

  function load(){
    fetchedAt=Date.now();
    HVJson('/api/frame').then(function(d){
      if(d&&d.weather&&d.weather.temp_f!=null){wx=d.weather;okAt=Date.now();}
      cal=(d&&d.calendar_events)||[];
      lastMin=-1;
    },function(){});
  }
  var BACK=/[?&]back=faces/.test(location.search)?'/frame/hv/faces/':'/frame/hv/';   // previews from the schedule page return there
  function leave(){location.href=BACK;}
  $('stage').addEventListener('click',leave);
  $('stage').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')leave();});

  function tick(){
    var t=HV.local(), mins=t.h*60+t.mi;
    if(wasNight&&!isNight(t)){leave();return;}
    if(mins!==lastMin){
      lastMin=mins;draw();
      var n=Math.floor(Date.now()/240000)%DX.length;     /* every 4 minutes */
      if(n!==shiftN){shiftN=n;$('shift').style.transform='translate('+DX[n]+'px,'+DY[n]+'px)';}
    }
    if(Date.now()-fetchedAt>=600000)load();
  }
  wasNight=isNight(HV.local());
  HV.chrome({clock:false,standby:false});
  load();tick();setInterval(tick,1000);
})();
