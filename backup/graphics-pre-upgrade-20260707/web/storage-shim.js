// Storage-shim for web/desktop: samme API som Claude-artefakternes window.storage,
// bagt på localStorage. isLocal=true fortæller spillet, at delt (online) lager mangler.
(function(){
  if (window.storage) return;
  var P = "ks:";
  window.storage = {
    isLocal: true,
    get: async function(k){ var v = localStorage.getItem(P + k);
      if (v == null) throw new Error("not found"); return { key: k, value: v }; },
    set: async function(k, v){ localStorage.setItem(P + k, v); return { key: k, value: v }; },
    delete: async function(k){ localStorage.removeItem(P + k); return { key: k, deleted: true }; },
    list: async function(pre){ pre = pre || ""; var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var kk = localStorage.key(i);
        if (kk.indexOf(P + pre) === 0) keys.push(kk.slice(P.length));
      }
      return { keys: keys }; }
  };
})();
