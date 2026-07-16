//ea_fisheye_viewer.js
// VERSION: 2026-07-05-v1
// ----------------------------------------------------------------
// Экспортирует текущую диаграмму EA как PNG (нативный ProjectInterface.ExportDiagramToImage),
// затем генерирует автономный HTML с fisheye-линзой (алгоритм Дж. Фёрнаса, Xerox PARC 1986).
// PNG встраивается как base64 — итоговый HTML-файл не требует PNG рядом.
//
// Запуск: открой диаграмму → Specialize → Scripting → Run
// ----------------------------------------------------------------

(function() {

/* ── 1. Текущая диаграмма ──────────────────────────────────────── */
var diag = Repository.GetCurrentDiagram();
if (!diag) { Session.Prompt("Открой диаграмму!", 1); return; }

var fso   = new ActiveXObject("Scripting.FileSystemObject");
var conn  = Repository.ConnectionString;
var outDir = fso.GetParentFolderName(conn);
if (!outDir || outDir === "") { outDir = "C:\\Temp"; try{fso.CreateFolder(outDir);}catch(e){} }

function safeFn(s) {
    return (""+s).replace(/[\\\/:*?"<>|\r\n]/g,"_")
                 .replace(/\s+/g,"_").replace(/_{2,}/g,"_")
                 .replace(/^_+|_+$/g,"");
}
var base     = safeFn(diag.Name) + "_" + diag.DiagramID;
var pngPath  = outDir + "\\" + base + ".png";
var htmlPath = outDir + "\\" + base + "_fisheye.html";

/* ── 2. PNG: сначала проверяем, не лежит ли уже готовый файл ─── */
Session.Output("[fisheye] Ожидаемый PNG: " + pngPath);
var PNG_MIN = 2000; /* валидный PNG диаграммы — не меньше 2 KB */
var pngReady = fso.FileExists(pngPath) && fso.GetFile(pngPath).Size >= PNG_MIN;

if (pngReady) {
    Session.Output("[fisheye] PNG найден вручную (" + fso.GetFile(pngPath).Size + " bytes) — экспорт пропущен.");
} else {
    /* Файла нет (или он пустой от предыдущей попытки) — пробуем нативный API */
    /* Если API создаст пустой файл — он будет перезаписан при следующем запуске
       пользователем вручную, поэтому удаляем его перед попыткой              */
    if (fso.FileExists(pngPath)) {
        try { fso.DeleteFile(pngPath); } catch(e) {}
    }
    var proj = Repository.GetProjectInterface();
    var ok = false;
    try { ok = proj.ExportDiagramToImage(diag.DiagramID, pngPath, false); } catch(e) {}
    if (!ok) try { ok = proj.ExportDiagramToImage(diag.DiagramID, pngPath); } catch(e) {}
    /* Если API создал пустой/битый файл — удалим его, чтобы не мешал */
    if (fso.FileExists(pngPath) && fso.GetFile(pngPath).Size < PNG_MIN) {
        try { fso.DeleteFile(pngPath); } catch(e) {}
    }
    pngReady = fso.FileExists(pngPath) && fso.GetFile(pngPath).Size >= PNG_MIN;
}

if (!pngReady) {
    Session.Prompt(
        "PNG не создан.\n" +
        "ExportDiagramToImage не поддерживается в этой версии EA.\n\n" +
        "Что делать:\n" +
        "1. В EA: File → Save Image → выбери PNG\n" +
        "2. Сохрани ТОЧНО в папку:\n   " + outDir + "\\\n" +
        "3. Под ТОЧНЫМ именем:\n   " + base + ".png\n\n" +
        "4. Запусти этот скрипт ещё раз — он подхватит файл автоматически.", 1);
    return;
}
Session.Output("[fisheye] PNG готов (" + fso.GetFile(pngPath).Size + " bytes)");

/* ── 3. Читаем PNG как base64 (ADODB.Stream + MSXML) ─────────── */
var b64 = "";
try {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 1; // binary
    stream.Open();
    stream.LoadFromFile(pngPath);
    var bytes = stream.Read();
    stream.Close();
    var xd = new ActiveXObject("Microsoft.XMLDOM");
    var node = xd.createElement("b64");
    node.dataType = "bin.base64";
    node.nodeTypedValue = bytes;
    b64 = node.text.replace(/[\r\n\t ]/g,"");
    Session.Output("[fisheye] base64 length: " + b64.length);
} catch(e) {
    Session.Prompt("Не удалось прочитать PNG как base64: " + e.message, 1);
    return;
}

/* ── 4. Строим HTML и пишем по частям через ADODB.Stream (UTF-8) ─
   CreateTextFile(false) — ASCII-only, падает на кириллице и Unicode.
   ADODB.Stream с Charset="UTF-8" пишет любые символы корректно.     */
function esc(s){ return (""+s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
var title = esc(diag.Name);
var parts = buildHTMLParts(title);

var CHUNK = 16384; /* 16 KB за раз */
var adoStr = new ActiveXObject("ADODB.Stream");
try {
    adoStr.Type    = 2;        /* adTypeText  */
    adoStr.Charset = "UTF-8";
    adoStr.Open();
    adoStr.WriteText(parts.pre);
    for (var ci = 0; ci < b64.length; ci += CHUNK) {
        adoStr.WriteText(b64.substr(ci, Math.min(CHUNK, b64.length - ci)));
    }
    adoStr.WriteText(parts.post);
    adoStr.SaveToFile(htmlPath, 2); /* adSaveCreateOverWrite */
    adoStr.Close();
} catch(we) {
    try { adoStr.Close(); } catch(e2) {}
    Session.Prompt("Ошибка записи HTML:\n" + we.message + "\n\nПуть: " + htmlPath, 1);
    return;
}
Session.Output("[fisheye] HTML: " + htmlPath);

/* ── 5. Открываем в браузере ─────────────────────────────────── */
var sh = new ActiveXObject("WScript.Shell");
sh.Run('"' + htmlPath + '"');
Session.Output("[fisheye] ГОТОВО");

/* ================================================================
   buildHTMLParts — два куска HTML вокруг base64.
   Вызов: var p = buildHTMLParts(title);
   Запись: f.Write(p.pre) → b64 чанками → f.Write(p.post)
================================================================ */
function buildHTMLParts(t) {
    var pre = [], post = [];

    /* ── часть PRE (всё до base64) ── */
    pre.push('<!DOCTYPE html>');
    pre.push('<html lang="uk">');
    pre.push('<head>');
    pre.push('<meta charset="UTF-8">');
    pre.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    pre.push('<title>Fisheye \u2014 ' + t + '</title>');
    pre.push('<style>');
    pre.push('*{box-sizing:border-box;margin:0;padding:0}');
    pre.push('body{background:#141820;color:#c8ccd8;font:13px/1.5 Arial,sans-serif;');
    pre.push('     display:flex;flex-direction:column;height:100vh;overflow:hidden}');
    pre.push('#hdr{background:#1e2535;border-bottom:1px solid #2c3554;padding:7px 14px;');
    pre.push('     display:flex;align-items:center;gap:14px;flex-shrink:0;flex-wrap:wrap}');
    pre.push('h1{font-size:13px;font-weight:600;color:#dde2f2;flex:1;');
    pre.push('   white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:80px}');
    pre.push('.ctrl{display:flex;align-items:center;gap:7px;white-space:nowrap}');
    pre.push('.ctrl label{color:#7880a0;font-size:12px}');
    pre.push('input[type=range]{width:90px;accent-color:#4d7ef5;cursor:pointer}');
    pre.push('.val{font-size:12px;color:#a8b4cc;min-width:28px;text-align:right}');
    pre.push('button{padding:4px 11px;border:1px solid #3a4668;border-radius:4px;');
    pre.push('       background:#252e46;color:#8892b0;cursor:pointer;font-size:12px;transition:.15s}');
    pre.push('button:hover{border-color:#4d7ef5;color:#b0bef8}');
    pre.push('button.on{background:#243060;border-color:#4d7ef5;color:#8ab0f8}');
    pre.push('#wrap{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:10px}');
    pre.push('canvas{display:block;cursor:crosshair;box-shadow:0 4px 32px rgba(0,0,0,.6)}');
    pre.push('#status{position:fixed;bottom:7px;right:12px;font-size:11px;color:#40486a;pointer-events:none}');
    pre.push('</style>');
    pre.push('</head>');
    pre.push('<body>');
    pre.push('<div id="hdr">');
    pre.push('  <h1>\uD83D\uDC1F ' + t + '</h1>');
    pre.push('  <div class="ctrl">');
    pre.push('    <button id="btn-f" class="on" onclick="toggleFish()">\uD83D\uDC41 вкл</button>');
    pre.push('  </div>');
    pre.push('  <div class="ctrl"><label>Сила D</label>');
    pre.push('    <input type="range" id="sl-d" min="1" max="15" value="5"');
    pre.push('           oninput="FD=+this.value;document.getElementById(\'vd\').textContent=FD">');
    pre.push('    <span class="val" id="vd">5</span></div>');
    pre.push('  <div class="ctrl"><label>Радіус R</label>');
    pre.push('    <input type="range" id="sl-r" min="30" max="800" value="160"');
    pre.push('           oninput="FR=+this.value;document.getElementById(\'vr\').textContent=FR">');
    pre.push('    <span class="val" id="vr">160</span></div>');
    pre.push('  <div class="ctrl"><label>Зум</label>');
    pre.push('    <button onclick="zoom(-0.1)">\u2212</button>');
    pre.push('    <span class="val" id="vzm">100%</span>');
    pre.push('    <button onclick="zoom(+0.1)">+</button>');
    pre.push('    <button onclick="zoomFit()" style="margin-left:2px">fit</button>');
    pre.push('  </div>');
    pre.push('</div>');
    pre.push('<div id="wrap"><canvas id="c"></canvas></div>');
    pre.push('<div id="status"></div>');
    /* img tag split: pre ends just before base64 data, post starts after it */
    pre.push('<img id="src" src="data:image/png;base64,');
    /* ← здесь будет вставлен base64 чанками → */

    /* ── часть POST (всё после base64) ── */
    post.push('" style="display:none" onload="init()">');
    post.push('<script>');
    post.push('var FD=5, FR=160, fishOn=true, mx=-1, my=-1, zk=1.0;');
    post.push('var c=document.getElementById("c"), ctx=c.getContext("2d");');
    post.push('var img=document.getElementById("src");');
    post.push('var orig, origData, W, H, raf=null;');
    post.push('');
    post.push('function init(){');
    post.push('  W=img.naturalWidth; H=img.naturalHeight;');
    post.push('  c.width=W; c.height=H;');
    post.push('  orig=document.createElement("canvas");');
    post.push('  orig.width=W; orig.height=H;');
    post.push('  orig.getContext("2d").drawImage(img,0,0);');
    post.push('  origData=orig.getContext("2d").getImageData(0,0,W,H);');
    post.push('  document.getElementById("status").textContent="";');
    post.push('  zoomFit();');
    post.push('}');
    post.push('function zoomFit(){');
    post.push('  if(!W)return;');
    post.push('  var wrap=document.getElementById("wrap");');
    post.push('  var mw=wrap.clientWidth-20, mh=wrap.clientHeight-20;');
    post.push('  zk=Math.min(1,mw/W,mh/H);');
    post.push('  applyZoom();');
    post.push('}');
    post.push('function zoom(d){zk=Math.max(0.05,Math.min(8,zk+d));applyZoom();}');
    post.push('function applyZoom(){');
    post.push('  if(!W)return;');
    post.push('  c.style.width=(W*zk)+"px"; c.style.height=(H*zk)+"px";');
    post.push('  document.getElementById("vzm").textContent=Math.round(zk*100)+"%";');
    post.push('  schedule();');
    post.push('}');
    post.push('function toggleFish(){');
    post.push('  fishOn=!fishOn;');
    post.push('  var b=document.getElementById("btn-f");');
    post.push('  b.textContent=fishOn?"\uD83D\uDC41 вкл":"\uD83D\uDC41 выкл";');
    post.push('  b.className=fishOn?"on":"";');
    post.push('  schedule();');
    post.push('}');
    post.push('function schedule(){if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);}');
    post.push('function draw(){');
    post.push('  raf=null; if(!orig)return;');
    post.push('  ctx.drawImage(orig,0,0);');
    post.push('  if(fishOn&&mx>=0)applyLens();');
    post.push('  if(mx>=0)drawRing();');
    post.push('}');
    post.push('function applyLens(){');
    post.push('  var r=Math.ceil(FR)+2;');
    post.push('  var x0=Math.max(0,Math.floor(mx-r)),y0=Math.max(0,Math.floor(my-r));');
    post.push('  var x1=Math.min(W,Math.ceil(mx+r)),y1=Math.min(H,Math.ceil(my+r));');
    post.push('  var sw=x1-x0,sh=y1-y0;');
    post.push('  if(sw<=0||sh<=0)return;');
    post.push('  var dest=ctx.createImageData(sw,sh);');
    post.push('  var sd=origData.data;');
    post.push('  var D1=(FD+1)*FR;');
    post.push('  for(var j=0;j<sh;j++){');
    post.push('    for(var i=0;i<sw;i++){');
    post.push('      var px=x0+i,py=y0+j;');
    post.push('      var dx=px-mx,dy=py-my;');
    post.push('      var dist=Math.sqrt(dx*dx+dy*dy);');
    post.push('      var sx,sy;');
    post.push('      if(dist<0.01){sx=mx;sy=my;}');
    post.push('      else if(dist>=FR){sx=px;sy=py;}');
    post.push('      else{var dSrc=dist*FR/(D1-FD*dist);sx=mx+dx/dist*dSrc;sy=my+dy/dist*dSrc;}');
    post.push('      sx=Math.max(0,Math.min(W-1.001,sx));');
    post.push('      sy=Math.max(0,Math.min(H-1.001,sy));');
    post.push('      var ix=sx|0,iy=sy|0,fx=sx-ix,fy=sy-iy;');
    post.push('      var a0=(iy*W+ix)*4,a1=a0+4,b0=((iy+1)*W+ix)*4,b1=b0+4;');
    post.push('      var t=1-fx,u=1-fy,di=(j*sw+i)*4;');
    post.push('      dest.data[di  ]=sd[a0]*t*u+sd[a1]*fx*u+sd[b0]*t*fy+sd[b1]*fx*fy;');
    post.push('      dest.data[di+1]=sd[a0+1]*t*u+sd[a1+1]*fx*u+sd[b0+1]*t*fy+sd[b1+1]*fx*fy;');
    post.push('      dest.data[di+2]=sd[a0+2]*t*u+sd[a1+2]*fx*u+sd[b0+2]*t*fy+sd[b1+2]*fx*fy;');
    post.push('      dest.data[di+3]=255;');
    post.push('    }');
    post.push('  }');
    post.push('  ctx.putImageData(dest,x0,y0);');
    post.push('}');
    post.push('function drawRing(){');
    post.push('  ctx.save();');
    post.push('  ctx.strokeStyle="rgba(77,126,245,0.55)";');
    post.push('  ctx.lineWidth=Math.max(1,2/zk);');
    post.push('  ctx.setLineDash([6,4]);');
    post.push('  ctx.beginPath();ctx.arc(mx,my,FR,0,Math.PI*2);ctx.stroke();');
    post.push('  ctx.restore();');
    post.push('}');
    post.push('function getSVGCoords(e){');
    post.push('  var r=c.getBoundingClientRect();');
    post.push('  return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};');
    post.push('}');
    post.push('c.addEventListener("mousemove",function(e){var p=getSVGCoords(e);mx=p.x;my=p.y;schedule();});');
    post.push('c.addEventListener("mouseleave",function(){mx=-1;schedule();});');
    post.push('window.addEventListener("resize",function(){zoomFit();});');
    post.push('document.addEventListener("keydown",function(e){');
    post.push('  if(e.code==="Space"){e.preventDefault();toggleFish();}');
    post.push('  else if(e.key==="+"||e.key==="="){zoom(+0.15);}');
    post.push('  else if(e.key==="-"){zoom(-0.15);}');
    post.push('  else if(e.key==="0"||e.key==="f"){zoomFit();}');
    post.push('  else if(e.key==="["){FR=Math.max(30,FR-20);document.getElementById("sl-r").value=FR;document.getElementById("vr").textContent=FR;schedule();}');
    post.push('  else if(e.key==="]"){FR=Math.min(800,FR+20);document.getElementById("sl-r").value=FR;document.getElementById("vr").textContent=FR;schedule();}');
    post.push('});');
    post.push('<\/script>');
    post.push('</body>');
    post.push('</html>');

    return { pre: pre.join("\r\n"), post: post.join("\r\n") };
}

})();
