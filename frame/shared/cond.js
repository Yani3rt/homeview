/* HVJson(url, signal): GET a JSON document, sending If-None-Match so an unchanged answer costs no body.
   The frames' old WebView keeps response bodies alive for a long time (the Today page grew ~1.5 MB per
   minute while polling ~150 KB/min), so polls that usually return the same document should not download it.
   On 304 the saved text is parsed again, so callers get a fresh object exactly as before. Rejects like fetch. */
(function(){
  'use strict';
  var seen = {};
  window.HVJson = function(url, signal){
    var e = seen[url], h = {};
    if (e) h['If-None-Match'] = e.etag;
    return fetch(url, {cache:'no-store', headers:h, signal:signal}).then(function(r){
      if (r.status === 304 && e) return JSON.parse(e.text);
      var tag = r.headers.get('ETag');
      return r.text().then(function(t){
        if (tag && r.ok) seen[url] = {etag:tag, text:t}; else delete seen[url];
        var d; try { d = JSON.parse(t); } catch (x) { d = {ok:false, error:'Bad response'}; }
        if (!r.ok) { var err = new Error(d && d.error || ('HTTP ' + r.status)); err.status = r.status; err.data = d; throw err; }
        return d;
      });
    });
  };
})();
