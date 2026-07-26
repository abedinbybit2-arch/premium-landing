/*! boot */(function(){
  var sc=document.currentScript;
  var page=(sc&&sc.getAttribute("data-p"))||"index";
  var KEY=73;
  function dec(b64){
    var bin=atob(b64);
    var out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i)^(KEY+(i%17));
    return new TextDecoder("utf-8").decode(out);
  }
  function paint(html){
    try{
      document.open();
      document.write(html);
      document.close();
    }catch(e){
      document.documentElement.innerHTML=html.replace(/^[^]*?<html[^>]*>/i,"").replace(/<\/html>[^]*$/i,"");
    }
  }
  var s=document.createElement("script");
  s.src="js/v/"+page+".js";
  s.async=false;
  s.onload=function(){
    try{
      var pack=window.__AG__;
      if(!pack||!pack.d)return;
      paint(dec(pack.d));
      try{ delete window.__AG__; }catch(_){ window.__AG__=null; }
    }catch(err){
      document.body.textContent="Load error";
    }
  };
  s.onerror=function(){ document.body.textContent="Load error"; };
  (document.head||document.documentElement).appendChild(s);
})();
