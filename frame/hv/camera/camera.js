/* Camera screen: the server relays each RTSP camera as MJPEG (camera_api.py), which the <img> shows natively,
   so the frame does no video decoding in JavaScript. ES5 on purpose (old WebView).
   - One chip per camera, bottom left; tap a chip to switch. The active chip shows the live dot.
   - The screen always opens on the default camera ("default": true in config.json, else the first one);
     /frame/hv/camera/?cam=<id> opens a given camera instead.
   - The stream only runs while this page is visible; leaving or hiding the page closes it.
   - /api/camera/status is polled every 3 s: it says whether the server is getting video, and why not.
   - If this frame's own stream dropped while the camera is fine, the image is reconnected.
   - Tap the picture to switch between the whole picture (fit) and filling the screen (fill). */
(function(){
  'use strict';
  var BLANK='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  var feed=document.getElementById('feed'),msg=document.getElementById('msg'),msgt=document.getElementById('msgt'),
      msgs=document.getElementById('msgs'),tags=document.getElementById('tags');
  var on=false,shown=false,opened=0,lastLive=0,timer=null;
  var cams=HV.cfg.cameras||[];
  if(!cams.length&&HV.cfg.camera)cams=[{id:'',name:HV.cfg.camera_name||'Camera'}];   // older server
  var cur=HV.cfg.camera_default||(cams[0]&&cams[0].id)||'';
  var want=(location.search.match(/[?&]cam=([^&]*)/)||[])[1];
  for(var k=0;k<cams.length;k++)if(want&&cams[k].id===decodeURIComponent(want))cur=cams[k].id;
  HV.chrome({camera:false});HV.back('Home');

  function say(t,sub){msgt.textContent=t;msgs.textContent=sub||'';msg.className='cam-msg';}
  function hideMsg(){msg.className='cam-msg off';}
  function q(){return cur?'cam='+encodeURIComponent(cur)+'&':'';}
  function nameOf(id){for(var i=0;i<cams.length;i++)if(cams[i].id===id)return cams[i].name;return 'Camera';}

  /* the chips */
  var chips=[];
  function paint(){
    for(var i=0;i<chips.length;i++){
      var c=chips[i];
      c.className='cam-tag'+(c.getAttribute('data-id')===cur?' cur':'')+(c.getAttribute('data-id')===cur&&shown?' live':'');
    }
  }
  function addChip(cam){
    var b=document.createElement('button');b.setAttribute('data-id',cam.id);
    b.innerHTML='<i></i><span></span>';b.lastChild.textContent=cam.name;
    b.onclick=function(){switchTo(cam.id);};
    tags.appendChild(b);chips.push(b);
  }
  for(var j=0;j<cams.length;j++)addChip(cams[j]);
  if(cams.length<2)tags.className='cam-tags one';

  function open(){
    if(document.hidden||!HV.cfg.camera)return;
    on=true;shown=false;opened=Date.now();paint();
    feed.src='/api/camera/stream.mjpg?'+q()+'t='+opened;
  }
  function close(){
    on=false;shown=false;feed.classList.remove('on');paint();
    feed.src=BLANK;                                // drops the stream connection
  }
  function switchTo(id){
    if(id===cur&&on)return;
    clearTimeout(timer);close();cur=id;lastLive=0;
    say('Connecting to '+nameOf(id),'');open();poll();
  }
  feed.onload=function(){
    if(!on||feed.src.indexOf('/api/camera/')<0)return;
    if(!shown){shown=true;feed.classList.add('on');hideMsg();paint();}
  };
  feed.onerror=function(){
    if(!on)return;
    shown=false;feed.classList.remove('on');paint();
    say('Reconnecting','');
    clearTimeout(timer);timer=setTimeout(open,3000);
  };
  feed.onclick=function(){feed.classList.toggle('fill');};

  function poll(){
    if(!HV.cfg.camera||document.hidden)return;
    var asked=cur;
    HVJson('/api/camera/status?'+q()+'watch=1').then(function(s){
      if(asked!==cur)return;                       // switched while this was on its way
      if(!s.enabled){close();say('No camera is set up','Add "cameras" to config.json on the server.');return;}
      var now=Date.now();
      if(s.live){
        lastLive=now;
        // the server has video but this frame shows none, or the server sees no viewer: reconnect
        if(!on||(!shown&&now-opened>4000)||(s.viewers===0&&now-opened>5000))open();
      }else{
        if(shown&&now-lastLive>4000){shown=false;feed.classList.remove('on');paint();}
        if(!shown)say(s.error?nameOf(cur)+' is not available':'Connecting to '+nameOf(cur),s.error||'');
        if(!on)open();
      }
    },function(){say('The server is not answering','');});
  }

  if(!HV.cfg.camera){say('No camera is set up','Add "cameras" to config.json on the server.');}
  else{say('Connecting to '+nameOf(cur),'');open();}
  setInterval(poll,3000);
  document.addEventListener('visibilitychange',function(){if(document.hidden)close();else{open();poll();}});
  window.addEventListener('pagehide',close);
})();
