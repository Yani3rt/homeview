/* Background picker (/frame/hv/background/). Saves per frame through HV.setWall / localStorage 'hv-look'.
   Swatches: "Auto" (time of day) + 12 hues x 3 shades, each turned into a soft gradient by HV.gradientFor.
   Wallpapers: images in the server's wallpapers folder, config.json wallpapers_dir (GET /api/hv/wallpapers). */
(function(){
  var HUES=[[28,'Amber'],[14,'Coral'],[350,'Rose'],[322,'Pink'],[285,'Purple'],[255,'Indigo'],[218,'Blue'],[195,'Sky'],[172,'Teal'],[145,'Green'],[95,'Lime'],[44,'Gold']];
  var SHADES=[[78,62],[72,48],[55,30]];   // [saturation, lightness]: light, base, deep
  function hex(h,s,l){s/=100;l/=100;var k=function(n){return (n+h/30)%12;},a=s*Math.min(l,1-l),
    f=function(n){return l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));},
    t=function(x){var v=Math.round(x*255).toString(16);return v.length<2?'0'+v:v;};return '#'+t(f(0))+t(f(8))+t(f(4));}
  var cur=HV.wall(),walls=[];

  function lookBar(){
    var h='';[['apple','Light'],['glass','Glass']].forEach(function(o){h+='<button data-look="'+o[0]+'" class="'+(HV.look===o[0]?'on':'')+'">'+o[1]+'</button>';});
    document.getElementById('look').innerHTML=h;
  }
  function swatches(){
    var h='';
    SHADES.forEach(function(sh,row){
      if(row===0)h+='<button class="auto'+(cur.t==='auto'?' on':'')+'" data-auto="1" aria-label="Automatic by time of day" title="Auto"></button>';
      else h+='<span></span>';
      HUES.forEach(function(hu){var c=hex(hu[0],sh[0],sh[1]);
        h+='<button style="background:'+HV.gradientFor(c)+'" data-c="'+c+'" class="'+(cur.t==='color'&&cur.c===c?'on':'')+'" aria-label="'+hu[1]+'"></button>';});
    });
    document.getElementById('sw').innerHTML=h;
  }
  function wallpapers(){
    var e=document.getElementById('wp');
    document.getElementById('wcount').textContent=walls.length?'· '+walls.length:'';
    if(!walls.length){e.innerHTML='<div class="none">No wallpapers yet. JPEG, PNG or WebP images put in the server\'s <b>wallpapers</b> folder show up here.</div>';return;}
    var h='';walls.forEach(function(w){h+='<button data-w="'+HV.esc(w.id)+'" class="'+(cur.t==='image'&&cur.id===w.id?'on':'')+'" style="background-image:url(\''+w.url+'\')"><span>'+HV.esc(w.name)+'</span></button>';});
    e.innerHTML=h;
  }
  function preview(){
    var p=document.getElementById('prev'),h=HV.local().h;
    if(cur.t==='color')p.style.background=HV.gradientFor(cur.c);
    else if(cur.t==='image')p.style.background='linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.28)),url("/frame/hv/wallpapers/'+encodeURIComponent(cur.id)+'") center/cover no-repeat';
    else p.style.background=h<5||h>=21?'linear-gradient(160deg,#1b2140,#07080f)':h<10?'linear-gradient(160deg,#f6b26b,#b04f2a)':h<17?'linear-gradient(160deg,#f3a942,#a8480f)':'linear-gradient(160deg,#c46a3c,#33224f)';
    document.getElementById('pclock').textContent=HV.hm();
  }
  function all(){lookBar();swatches();wallpapers();preview();}

  document.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    if(b.getAttribute('data-look')){var v=b.getAttribute('data-look');try{localStorage.setItem('hv-look',v);}catch(x){}location.replace('/frame/hv/background/?look='+v);return;}
    if(b.getAttribute('data-auto'))cur={t:'auto'};
    else if(b.getAttribute('data-c'))cur={t:'color',c:b.getAttribute('data-c')};
    else if(b.getAttribute('data-w'))cur={t:'image',id:b.getAttribute('data-w')};
    else return;
    HV.setWall(cur);all();
    if(HV.look!=='glass')HV.toast('Saved. Switch to Glass to see it on every screen.');
  });

  HV.chrome({light:HV.look!=='glass'});HV.back('Settings','/frame/hv/settings/');
  HVJson('/api/hv/wallpapers').then(function(d){walls=d.wallpapers||[];wallpapers();},function(){});
  all();setInterval(preview,30000);
})();
