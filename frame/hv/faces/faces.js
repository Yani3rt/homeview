/* Standby faces (/frame/hv/faces/): Apple-style gallery of the real faces (thumbnails rendered by
   scripts/make_face_thumbs.py into ./thumbs/). Tap a picture to open it full screen; the button under it
   puts the face in or takes it out of this frame's Standby rotation (HV.facesOn / HV.setFace). */
(function(){
  var CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var v=Math.floor(Date.now()/3600000);   // thumbnails refresh hourly at most
  function draw(){
    var on=HV.facesOn(),h='',n=0;
    HV.FACES.forEach(function(f){var k=f[0];if(on[k])n++;
      h+='<div class="fc'+(on[k]?'':' off')+'">'+
        '<a class="shot" href="/frame/hv/standby/?face='+(k==='photos'?'photo':k)+'" aria-label="Open '+HV.esc(f[1])+' full screen" style="background-image:url(\'/frame/hv/faces/thumbs/'+k+'.jpg?v='+v+'\')"></a>'+
        '<div class="nm"><b>'+HV.esc(f[1])+'</b></div><div class="sub">'+HV.esc(f[2])+'</div>'+
        '<button class="act '+(on[k]?'in':'out')+'" data-k="'+k+'">'+(on[k]?CHECK+'In Standby':PLUS+'Add to Standby')+'</button></div>';});
    document.getElementById('grid').innerHTML=h;
    document.getElementById('sub').textContent=n+' of '+HV.FACES.length+' faces in Standby on this frame. Tap a picture to see it full screen.';
  }
  document.addEventListener('click',function(e){var b=e.target.closest('.act');if(!b)return;
    var k=b.getAttribute('data-k'),on=HV.facesOn(),count=0;for(var x in on)if(on[x])count++;
    if(on[k]&&count===1){HV.toast('Keep at least one face in Standby');return;}
    HV.setFace(k,!on[k]);HV.toast(on[k]?'Taken out of Standby':'Added to Standby');draw();});
  HV.chrome({light:HV.look!=='glass'});HV.back('Settings','/frame/hv/settings/');
  draw();
})();
