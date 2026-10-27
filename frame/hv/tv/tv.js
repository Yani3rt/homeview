/* Remote control for the Google TV app (HomeViewTV in the user agent; hv.js loads this file).
   The screens are touch-first, so this adds spatial navigation: the arrows move a focus ring between
   tappable things (buttons, links, onclick elements, [data-*] targets the pages listen for),
   OK clicks it, and Back (from the app, through HVTV.back()) closes an open sheet or presses the
   page's back chip. While a sheet is open, only its contents are reachable. ES5 like the rest. */
(function(){
  var TARGETS='a[href],button,input,select,textarea,[tabindex],[role=button],.tile,.ph-t,.wx-cone-x,'+
    '[data-a],[data-act],[data-clear],[data-close],[data-day],[data-days],[data-ea],[data-eq],[data-eqt],[data-evol],'+
    '[data-fav],[data-gchk],[data-gdone],[data-gear],[data-go],[data-group],[data-k],[data-mode],[data-panel],[data-pick],'+
    '[data-playon],[data-pm],[data-poconn],[data-posonos],[data-pv],[data-q],[data-qclear],[data-qplay],[data-qrm],[data-rm],'+
    '[data-room],[data-rv],[data-skip],[data-sleep],[data-sp],[data-spclear],[data-spplay],[data-st],[data-storm],[data-t],'+
    '[data-tab],[data-tvgo],[data-tvother],[data-view],[data-vol]';
  var SHEETS='.hv-sheet,.sheet,.dn-sheet,.dn-cook,.ml-dt';
  var cur=null,last=null;
  function viewer(){var v=/\/photos\//.test(location.pathname)&&document.getElementById('view');return v&&!v.hidden?v:null;}   // photos.js owns ←/→/Escape there   // focused element; center of the last one (redraws replace elements)

  var css=document.createElement('style');
  css.textContent='.hv-tvf{outline:.7vh solid #ffd60a!important;outline-offset:-.7vh;box-shadow:inset 0 0 0 1.1vh rgba(0,0,0,.4)!important}';   // yellow: pages already use blue for "selected"
  (document.head||document.documentElement).appendChild(css);

  function openSheet(){var s=document.querySelectorAll(SHEETS),i;for(i=0;i<s.length;i++)if(s[i].classList.contains('on'))return s[i];return null;}
  function visible(el,r){
    if(r.width<4||r.height<4)return false;
    var st=getComputedStyle(el);if(st.visibility==='hidden'||st.display==='none'||+st.opacity===0)return false;
    if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return true;   // scrolled away: still reachable
    var h=document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));
    return !h||el===h||el.contains(h)||h.contains(el);
  }
  function candidates(){
    var root=openSheet()||document.body,out=[],all=root.querySelectorAll('*'),i,el,s,r;
    for(i=0;i<all.length;i++){el=all[i];
      if(!(el.onclick||el.matches(TARGETS))||el.disabled)continue;
      if(root===document.body&&(s=el.closest(SHEETS))&&!s.classList.contains('on'))continue;
      r=el.getBoundingClientRect();if(visible(el,r))out.push({el:el,r:r});}
    /* Nested targets: a button or link wins over what's inside it (e.g. a face tile's preview eye; OK on
       the tile toggles it), while any other wrapper gives way to the targets inside it. */
    return out.filter(function(a){return !out.some(function(b){if(b.el===a.el)return false;
      return (/^(BUTTON|A)$/.test(b.el.tagName)&&b.el.contains(a.el))||(a.el.contains(b.el)&&!/^(BUTTON|A)$/.test(a.el.tagName));});});
  }
  function center(r){return {x:r.left+r.width/2,y:r.top+r.height/2};}
  function focus(el){
    if(cur)cur.classList.remove('hv-tvf');cur=el;if(!el)return;
    el.classList.add('hv-tvf');last=center(el.getBoundingClientRect());
    if(el.scrollIntoView)el.scrollIntoView({block:'nearest',inline:'nearest'});
    if(/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))el.focus();else if(document.activeElement&&document.activeElement!==document.body)document.activeElement.blur();
  }
  function nearest(list,p){var best=null,bd=1e9;list.forEach(function(c){var q=center(c.r),d=Math.abs(q.x-p.x)+Math.abs(q.y-p.y);if(d<bd){bd=d;best=c.el;}});return best;}
  function move(dir){
    var list=candidates();if(!list.length)return;
    if(!cur||!document.body.contains(cur)||!list.some(function(c){return c.el===cur;})){focus(nearest(list,last||{x:0,y:0}));return;}
    var a=cur.getBoundingClientRect(),best=null,bs=1e9;
    list.forEach(function(c){if(c.el===cur)return;var b=c.r,main,side;
      if(dir==='right'){main=b.left-a.right;side=Math.max(0,a.top-b.bottom,b.top-a.bottom);if(b.left+b.width/2<=a.left+a.width/2+1)return;}
      else if(dir==='left'){main=a.left-b.right;side=Math.max(0,a.top-b.bottom,b.top-a.bottom);if(b.left+b.width/2>=a.left+a.width/2-1)return;}
      else if(dir==='down'){main=b.top-a.bottom;side=Math.max(0,a.left-b.right,b.left-a.right);if(b.top+b.height/2<=a.top+a.height/2+1)return;}
      else{main=a.top-b.bottom;side=Math.max(0,a.left-b.right,b.left-a.right);if(b.top+b.height/2>=a.top+a.height/2-1)return;}
      var s=Math.max(0,main)+side*2.5;if(s<bs){bs=s;best=c.el;}});
    if(best)focus(best);
  }
  function press(){
    if(cur&&document.body.contains(cur)){if(/^(INPUT|TEXTAREA)$/.test(cur.tagName)){cur.focus();return;}cur.click();return;}
    var list=candidates();
    if(list.length){focus(nearest(list,last||{x:0,y:0}));return;}
    var h=document.elementFromPoint(innerWidth/2,innerHeight/2);if(h)h.click();   // Standby/Night: OK wakes like a tap
  }
  /* Pages redraw their tiles every few seconds (innerHTML), which drops the ring: put it back on
     whatever now sits where the focused element was, without scrolling. */
  var fixT=null;
  new MutationObserver(function(){
    if(!cur||document.body.contains(cur)||fixT)return;
    fixT=setTimeout(function(){fixT=null;if(!cur||document.body.contains(cur))return;
      var list=candidates(),el=list.length&&nearest(list,last);cur=el||null;if(el)el.classList.add('hv-tvf');},0);
  }).observe(document.body,{childList:true,subtree:true});
  var KEYS={37:'left',38:'up',39:'right',40:'down',ArrowLeft:'left',ArrowUp:'up',ArrowRight:'right',ArrowDown:'down'};
  document.addEventListener('keydown',function(e){
    var d=KEYS[e.key]||KEYS[e.keyCode],t=e.target;
    if(t&&/^(INPUT|TEXTAREA)$/.test(t.tagName)&&(d==='left'||d==='right'))return;   // move the caret
    if(viewer()&&(d==='left'||d==='right'))return;
    if(/\/(standby|night)\//.test(location.pathname)){   // standby.js steps faces with ←/→; OK leaves like a tap
      if(e.key==='Enter'||e.keyCode===13||e.keyCode===23){e.preventDefault();var h=document.elementFromPoint(innerWidth/2,innerHeight/2);if(h)h.click();}
      return;}
    if(d){e.preventDefault();move(d);return;}
    if(e.key==='Enter'||e.keyCode===13||e.keyCode===23){if(t&&t.tagName==='TEXTAREA')return;e.preventDefault();press();}
  },true);

  /* Called by the app on Back: true when the page handled it, false to let the app go back/leave. */
  window.HVTV={back:function(){
    var s=openSheet(),b;
    if(viewer()){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return true;}
    if(s){b=s.querySelector('[data-close],.hv-alert-close,.wx-cone-x,.sh-x,.close');
      if(!b){var bs=s.querySelectorAll('button'),i;for(i=0;i<bs.length;i++)if(/^(done|close|cancel)$/i.test(bs[i].textContent.trim())){b=bs[i];break;}}
      if(b){b.click();return true;}
      var sh=document.querySelector('[class*=shade].on');if(sh){sh.click();return true;}
      s.classList.remove('on');return true;}
    b=document.querySelector('.hv-back');if(b){b.click();return true;}
    return false;
  }};
})();
