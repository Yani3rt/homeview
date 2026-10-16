/* Standby schedule, per frame (localStorage 'hv-sched'). ES5 on purpose (old WebView).
   The week is split into day groups (default Weekdays Mon-Fri, Weekend Sat-Sun); every day is in exactly one
   group. Each group has time blocks; a block starts at its time (minutes after midnight, home time) and runs
   until the next block starts, past midnight into the next day if it is the last one. Each block lists the
   faces Standby rotates through, in order (the first one leads when the block begins). 'photos' is a face
   like any other. 'night' (the Night clock page) shows on its own: a block with it is a night block, where the
   frame goes to the night clock when idle instead of Standby. Severe weather and Now Playing are not scheduled: they still interrupt when they apply.

   { v:1, groups:[ {days:[1,2,3,4,5], blocks:[ {start:300, name:'Morning', faces:['weather','info','photos']}, ... ]}, ... ] }

   HVSched.load(on)        the saved schedule, or the default one built from the faces that are on (HV.facesOn)
   HVSched.save(s)         stores it (returns false when storage is unavailable)
   HVSched.at(s,dow,min)   {g, b, group, block, key} for that day (0 = Sunday) and minute
   HVSched.endOf(s,g,b)    the minute that block ends
   HVSched.isNight(s,dow,min) true when that block has the Night clock
   HVSched.normalize(s,keys) a clean copy: valid days and times, known faces only, no empty groups */
window.HVSched=(function(){
  var KEY='hv-sched', SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DEF={
    weekdays:[[300,['board','weather','info','photos','today','up'],'Morning'],
              [540,['photos','board','info','up','numerals','week','weather','today','minimal','analog','month'],'Day'],
              [900,['tomorrow','photos','info','up','week','analog','numerals'],'Evening'],
              [1380,['night'],'Night']],
    weekend: [[300,['board','weather','photos','info','today','up'],'Morning'],
              [540,['photos','board','info','up','numerals','week','weather','today','minimal','analog','month'],'Day'],
              [900,['week','tomorrow','up','month','info','numerals','photos'],'Evening'],
              [1380,['night'],'Night']]};
  function keysOf(on){var k=[];for(var x in on)if(x!=='alert')k.push(x);return k;}
  function defaults(on){
    on=on||{};var any=keysOf(on).filter(function(k){return on[k];});
    function blocks(list){return list.map(function(b){
      var f=b[1].filter(function(k){return on[k];});
      if(!f.length)f=on.photos?['photos']:any.slice(0,1);
      return {start:b[0],faces:f,name:b[2]};});}
    return {v:2,groups:[{days:[1,2,3,4,5],blocks:blocks(DEF.weekdays)},{days:[6,0],blocks:blocks(DEF.weekend)}]};
  }
  function normalize(s,keys){
    var known={};(keys||[]).forEach(function(k){known[k]=1;});
    var seen={},groups=[];
    ((s&&s.groups)||[]).forEach(function(g){
      var days=[];(g.days||[]).forEach(function(d){d=+d;if(d>=0&&d<7&&d===Math.floor(d)&&!seen[d]){seen[d]=1;days.push(d);}});
      if(!days.length)return;
      var starts={},blocks=[];
      (g.blocks||[]).forEach(function(b){var st=Math.round((+b.start||0)/15)*15;
        if(!(st>=0&&st<1440)||starts[st])return;starts[st]=1;
        var f=[],fs={};(b.faces||[]).forEach(function(k){if((!keys||known[k])&&!fs[k]){fs[k]=1;f.push(k);}});
        var o={start:st,faces:f};if(typeof b.name==='string'&&b.name&&b.name.length<=24)o.name=b.name;blocks.push(o);});
      if(!blocks.length)blocks.push({start:0,faces:[]});
      blocks.sort(function(a,b){return a.start-b.start;});
      groups.push({days:days,blocks:blocks});});
    if(!groups.length)groups.push({days:[],blocks:[{start:0,faces:[]}]});
    for(var d=0;d<7;d++)if(!seen[d])groups[0].days.push(d);   // a day nobody claims joins the first group
    groups.forEach(function(g){g.days.sort(function(a,b){return ((a+6)%7)-((b+6)%7);});});   // Monday first
    return {v:2,groups:groups};
  }
  function groupOf(s,dow){for(var i=0;i<s.groups.length;i++)if(s.groups[i].days.indexOf(dow)>=0)return i;return 0;}
  function at(s,dow,min){
    var g=groupOf(s,dow),bl=s.groups[g].blocks,b=-1;
    for(var i=0;i<bl.length;i++)if(bl[i].start<=min)b=i;
    if(b<0){g=groupOf(s,(dow+6)%7);b=s.groups[g].blocks.length-1;}   // before today's first block: yesterday's last one
    return {g:g,b:b,group:s.groups[g],block:s.groups[g].blocks[b],key:g+'-'+b};
  }
  function isNight(s,dow,min){return at(s,dow,min).block.faces.indexOf('night')>=0;}
  function endOf(s,g,b){var bl=s.groups[g].blocks;return b+1<bl.length?bl[b+1].start:bl[0].start;}
  function load(on){
    var keys=keysOf(on||{}),v=null;
    try{v=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
    if(v&&v.groups&&v.v!==2&&keys.indexOf('night')>=0)   // v1 schedules predate the Night clock face: their Night blocks get it
      v.groups.forEach(function(g){(g.blocks||[]).forEach(function(b){if(b.name==='Night')b.faces=['night'];});});
    return v&&v.groups?normalize(v,keys):normalize(defaults(on),keys);
  }
  function save(s){try{localStorage.setItem(KEY,JSON.stringify(s));return true;}catch(e){return false;}}
  function reset(){try{localStorage.removeItem(KEY);}catch(e){}}
  function saved(){try{return !!localStorage.getItem(KEY);}catch(e){return false;}}
  /* "Weekdays", "Weekend", "Every day", "Mon–Wed", "Tue, Thu", "Sunday" */
  function daysLabel(days){
    var set={};days.forEach(function(d){set[d]=1;});var n=days.length;
    if(n===7)return 'Every day';
    if(n===5&&!set[0]&&!set[6])return 'Weekdays';
    if(n===2&&set[0]&&set[6])return 'Weekend';
    if(n===1)return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][days[0]];
    var m=days.map(function(d){return (d+6)%7;}).sort(),run=true;
    for(var i=1;i<m.length;i++)if(m[i]!==m[i-1]+1)run=false;
    if(run&&n>2)return SHORT[(m[0]+1)%7]+'–'+SHORT[(m[n-1]+1)%7];
    return m.map(function(x){return SHORT[(x+1)%7];}).join(', ');
  }
  /* a block's name: the one it was given (the defaults have one), else from its start time */
  function blockName(b){if(b&&typeof b==='object'){if(b.name)return b.name;b=b.start;}var h=b/60;return h<5?'Night':h<12?'Morning':h<17?'Afternoon':h<21?'Evening':'Night';}
  function fmt(min){min=((min%1440)+1440)%1440;var h=Math.floor(min/60),m=min%60;
    return ((h%12)||12)+':'+(m<10?'0':'')+m+' '+(h<12?'AM':'PM');}
  return {KEY:KEY,SHORT:SHORT,defaults:defaults,normalize:normalize,groupOf:groupOf,at:at,endOf:endOf,isNight:isNight,load:load,save:save,
    reset:reset,saved:saved,daysLabel:daysLabel,blockName:blockName,fmt:fmt};
})();
