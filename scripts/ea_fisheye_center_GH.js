//ea_fisheye_center.js
// VERSION: 2026-07-05-v1
// ----------------------------------------------------------------
// Фіксована лінза в центрі вьюпорту. Діаграма панується мишею
// (тягни будь-яку точку → вона притягується до центру де лінза).
// Це і є оригінальний формат Xerox PARC focus+context.
//
// Окремий скрипт від ea_fisheye_viewer.js (hover-follows-mouse).
// Запуск: відкрий діаграму → Specialize → Scripting → Run
// ----------------------------------------------------------------

(function() {

/* ── 1. Поточна діаграма ───────────────────────────────────────── */
var diag = Repository.GetCurrentDiagram();
if (!diag) { Session.Prompt("Відкрий діаграму!", 1); return; }

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
var htmlPath = outDir + "\\" + base + "_center.html";

/* ── 2. PNG: використовуємо вже існуючий або пробуємо нативний ── */
Session.Output("[center] PNG: " + pngPath);
var PNG_MIN = 2000;
var pngReady = fso.FileExists(pngPath) && fso.GetFile(pngPath).Size >= PNG_MIN;

if (pngReady) {
    Session.Output("[center] PNG знайдено (" + fso.GetFile(pngPath).Size + " bytes)");
} else {
    if (fso.FileExists(pngPath)) { try{ fso.DeleteFile(pngPath); }catch(e){} }
    var proj = Repository.GetProjectInterface();
    var ok = false;
    try { ok = proj.ExportDiagramToImage(diag.DiagramID, pngPath, false); } catch(e) {}
    if (!ok) try { ok = proj.ExportDiagramToImage(diag.DiagramID, pngPath); } catch(e) {}
    if (fso.FileExists(pngPath) && fso.GetFile(pngPath).Size < PNG_MIN) {
        try{ fso.DeleteFile(pngPath); }catch(e){}
    }
    pngReady = fso.FileExists(pngPath) && fso.GetFile(pngPath).Size >= PNG_MIN;
}

if (!pngReady) {
    Session.Prompt(
        "PNG не знайдено.\n\n" +
        "1. EA → File → Save Image → PNG\n" +
        "2. Збережи у папку:\n   " + outDir + "\\\n" +
        "3. Ім'я файлу:\n   " + base + ".png\n\n" +
        "4. Запусти скрипт ще раз.", 1);
    return;
}

/* ── 3. base64 ─────────────────────────────────────────────────── */
var b64 = "";
try {
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 1;
    stream.Open();
    stream.LoadFromFile(pngPath);
    var bytes = stream.Read();
    stream.Close();
    var xd = new ActiveXObject("Microsoft.XMLDOM");
    var nd = xd.createElement("b64");
    nd.dataType = "bin.base64";
    nd.nodeTypedValue = bytes;
    b64 = nd.text.replace(/[\r\n\t ]/g,"");
    Session.Output("[center] base64 length: " + b64.length);
} catch(e) {
    Session.Prompt("Помилка читання PNG: " + e.message, 1);
    return;
}

/* ── 4. Пишемо HTML через ADODB.Stream (UTF-8) ─────────────────── */
function esc(s){ return (""+s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
var parts = buildHTMLParts(esc(diag.Name));

var CHUNK = 16384;
var adoStr = new ActiveXObject("ADODB.Stream");
try {
    adoStr.Type = 2; adoStr.Charset = "UTF-8"; adoStr.Open();
    adoStr.WriteText(parts.pre);
    for (var ci = 0; ci < b64.length; ci += CHUNK)
        adoStr.WriteText(b64.substr(ci, Math.min(CHUNK, b64.length - ci)));
    adoStr.WriteText(parts.post);
    adoStr.SaveToFile(htmlPath, 2);
    adoStr.Close();
} catch(we) {
    try{ adoStr.Close(); }catch(e2){}
    Session.Prompt("Помилка запису HTML:\n" + we.message, 1);
    return;
}

/* ── 5. Відкриваємо ─────────────────────────────────────────────── */
var sh = new ActiveXObject("WScript.Shell");
sh.Run('"' + htmlPath + '"');
Session.Output("[center] ГОТОВО → " + htmlPath);

/* ================================================================
   buildHTMLParts — фіксована лінза, панування мишею
================================================================ */
function buildHTMLParts(title) {
    var pre = [], post = [];

    /* ── PRE (усе до base64) ── */
    pre.push('<!DOCTYPE html>');
    pre.push('<html lang="uk">');
    pre.push('<head>');
    pre.push('<meta charset="UTF-8">');
    pre.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
    pre.push('<title>Fisheye Center \u2014 ' + title + '</title>');
    pre.push('<style>');
    pre.push('*{box-sizing:border-box;margin:0;padding:0}');
    pre.push('body{background:#141820;color:#c8ccd8;font:13px/1.5 Arial,sans-serif;');
    pre.push('     display:flex;flex-direction:column;height:100vh;overflow:hidden;user-select:none}');
    pre.push('#hdr{background:#1e2535;border-bottom:1px solid #2c3554;padding:7px 14px;');
    pre.push('     display:flex;align-items:center;gap:14px;flex-shrink:0;flex-wrap:wrap}');
    pre.push('h1{font-size:13px;font-weight:600;color:#dde2f2;flex:1;');
    pre.push('   white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:80px}');
    pre.push('.ctrl{display:flex;align-items:center;gap:7px;white-space:nowrap}');
    pre.push('.ctrl label{color:#7880a0;font-size:12px}');
    pre.push('input[type=range]{width:90px;accent-color:#4d7ef5;cursor:pointer}');
    pre.push('.val{font-size:12px;color:#a8b4cc;min-width:34px;text-align:right}');
    pre.push('button{padding:4px 11px;border:1px solid #3a4668;border-radius:4px;');
    pre.push('       background:#252e46;color:#8892b0;cursor:pointer;font-size:12px}');
    pre.push('button:hover{border-color:#4d7ef5;color:#b0bef8}');
    pre.push('button.on{background:#243060;border-color:#4d7ef5;color:#8ab0f8}');
    pre.push('#cWrap{flex:1;overflow:hidden;position:relative}');
    pre.push('canvas{display:block;cursor:grab;position:absolute;top:0;left:0}');
    pre.push('canvas.dragging{cursor:grabbing}');
    pre.push('#hint{position:absolute;bottom:8px;left:0;right:0;text-align:center;');
    pre.push('      font-size:11px;color:#3a4560;pointer-events:none}');
    pre.push('</style>');
    pre.push('</head>');
    pre.push('<body>');
    pre.push('<div id="hdr">');
    pre.push('  <h1>&#128269; ' + title + '</h1>');
    pre.push('  <div class="ctrl">');
    pre.push('    <button id="btn-f" class="on" onclick="toggleFish()">&#128065; вкл</button>');
    pre.push('  </div>');
    pre.push('  <div class="ctrl"><label>Сила D</label>');
    pre.push('    <input type="range" id="sl-d" min="1" max="15" value="6"');
    pre.push('           oninput="FD=+this.value;document.getElementById(\'vd\').textContent=FD;schedule()">');
    pre.push('    <span class="val" id="vd">6</span></div>');
    pre.push('  <div class="ctrl"><label>Радіус R</label>');
    pre.push('    <input type="range" id="sl-r" min="60" max="600" value="200"');
    pre.push('           oninput="FR=+this.value;document.getElementById(\'vr\').textContent=FR;schedule()">');
    pre.push('    <span class="val" id="vr">200</span></div>');
    pre.push('  <div class="ctrl"><label>Зум</label>');
    pre.push('    <button onclick="zoom(-0.15)">&#8722;</button>');
    pre.push('    <span class="val" id="vzm">100%</span>');
    pre.push('    <button onclick="zoom(+0.15)">+</button>');
    pre.push('    <button onclick="zoomFit()" style="margin-left:2px">fit</button>');
    pre.push('  </div>');
    pre.push('</div>');
    pre.push('<div id="cWrap">');
    pre.push('  <canvas id="c"></canvas>');
    pre.push('  <div id="hint">тягни діаграму мишею &middot; колесо = зум &middot; пробіл = вкл/викл</div>');
    pre.push('</div>');
    pre.push('<img id="src" src="data:image/png;base64,');

    /* ── POST (усе після base64) ── */
    post.push('" style="display:none" onload="init()">');
    post.push('<script>');
    post.push('/* ── state ── */');
    post.push('var FD=6, FR=200, fishOn=true;');
    post.push('var panX=0, panY=0;   /* diagram coords at canvas top-left */');
    post.push('var viewScale=1.0;    /* canvas pixels per diagram pixel   */');
    post.push('var W=0, H=0;         /* diagram image dimensions           */');
    post.push('var CW=0, CH=0;       /* canvas dimensions                  */');
    post.push('var fw=0, fh=0;       /* fisheye center (canvas center)     */');
    post.push('var origData=null, offFull=null;');
    post.push('var raf=null;');
    post.push('var dragging=false, dsx=0, dsy=0, dpx=0, dpy=0;');
    post.push('');
    post.push('var c=document.getElementById("c");');
    post.push('var ctx=c.getContext("2d");');
    post.push('var img=document.getElementById("src");');
    post.push('');
    post.push('function init(){');
    post.push('  W=img.naturalWidth; H=img.naturalHeight;');
    post.push('  resize();');
    post.push('  /* off-screen full-res canvas for drawImage base */');
    post.push('  offFull=document.createElement("canvas");');
    post.push('  offFull.width=W; offFull.height=H;');
    post.push('  offFull.getContext("2d").drawImage(img,0,0);');
    post.push('  /* pixel data for bilinear sampling inside lens */');
    post.push('  origData=offFull.getContext("2d").getImageData(0,0,W,H);');
    post.push('  document.getElementById("hint").textContent=');
    post.push('    "тягни \u2022 колесо = зум \u2022 [ ] = радіус \u2022 пробіл = вкл/викл";');
    post.push('  zoomFit();');
    post.push('}');
    post.push('');
    post.push('function resize(){');
    post.push('  var wrap=document.getElementById("cWrap");');
    post.push('  CW=wrap.clientWidth; CH=wrap.clientHeight;');
    post.push('  c.width=CW; c.height=CH;');
    post.push('  c.style.width=CW+"px"; c.style.height=CH+"px";');
    post.push('  fw=CW/2; fh=CH/2;');
    post.push('}');
    post.push('');
    post.push('function zoomFit(){');
    post.push('  if(!W)return;');
    post.push('  viewScale=Math.min(1, (CW-40)/W, (CH-40)/H);');
    post.push('  panX=(W-CW/viewScale)/2; panY=(H-CH/viewScale)/2;');
    post.push('  document.getElementById("vzm").textContent=Math.round(viewScale*100)+"%";');
    post.push('  schedule();');
    post.push('}');
    post.push('');
    post.push('function zoom(d){');
    post.push('  if(!W)return;');
    post.push('  /* zoom toward canvas center */');
    post.push('  var cx=panX+fw/viewScale, cy=panY+fh/viewScale;');
    post.push('  viewScale=Math.max(0.05,Math.min(8,viewScale*Math.exp(d)));');
    post.push('  panX=cx-fw/viewScale; panY=cy-fh/viewScale;');
    post.push('  document.getElementById("vzm").textContent=Math.round(viewScale*100)+"%";');
    post.push('  schedule();');
    post.push('}');
    post.push('');
    post.push('function toggleFish(){');
    post.push('  fishOn=!fishOn;');
    post.push('  var b=document.getElementById("btn-f");');
    post.push('  b.textContent=fishOn?"\uD83D\uDC41 вкл":"\uD83D\uDC41 викл";');
    post.push('  b.className=fishOn?"on":"";');
    post.push('  schedule();');
    post.push('}');
    post.push('');
    post.push('function schedule(){');
    post.push('  if(raf)cancelAnimationFrame(raf);');
    post.push('  raf=requestAnimationFrame(draw);');
    post.push('}');
    post.push('');
    post.push('function draw(){');
    post.push('  raf=null;');
    post.push('  if(!origData)return;');
    post.push('');
    post.push('  /* ── base layer: whole canvas via GPU-accelerated drawImage ── */');
    post.push('  ctx.fillStyle="#141820";');
    post.push('  ctx.fillRect(0,0,CW,CH);');
    post.push('  /* draw diagram region [panX,panY, CW/vs, CH/vs] → canvas */');
    post.push('  ctx.drawImage(offFull, panX, panY, CW/viewScale, CH/viewScale, 0, 0, CW, CH);');
    post.push('');
    post.push('  /* ── fisheye lens: pixel-by-pixel only inside circle ── */');
    post.push('  if(fishOn){');
    post.push('    var r2=Math.ceil(FR)+1;');
    post.push('    var lx0=Math.max(0,Math.floor(fw-r2)), ly0=Math.max(0,Math.floor(fh-r2));');
    post.push('    var lx1=Math.min(CW,Math.ceil(fw+r2)), ly1=Math.min(CH,Math.ceil(fh+r2));');
    post.push('    var lw=lx1-lx0, lh=ly1-ly0;');
    post.push('    if(lw>0&&lh>0){');
    post.push('      var dest=ctx.createImageData(lw,lh);');
    post.push('      var sd=origData.data;');
    post.push('      var D1=(FD+1)*FR;');
    post.push('      for(var j=0;j<lh;j++){');
    post.push('        for(var i=0;i<lw;i++){');
    post.push('          var cx2=lx0+i, cy2=ly0+j;');
    post.push('          var dx=cx2-fw, dy=cy2-fh;');
    post.push('          var dist=Math.sqrt(dx*dx+dy*dy);');
    post.push('          if(dist>=FR) continue; /* skip — already drawn by drawImage */');
    post.push('          var sx2,sy2;');
    post.push('          if(dist<0.01){sx2=fw;sy2=fh;}');
    post.push('          else{');
    post.push('            /* inverse Furnas: d_src = dist*R/((D+1)*R - D*dist) */');
    post.push('            var dSrc=dist*FR/(D1-FD*dist);');
    post.push('            sx2=fw+dx/dist*dSrc; sy2=fh+dy/dist*dSrc;');
    post.push('          }');
    post.push('          /* canvas (sx2,sy2) → diagram coords */');
    post.push('          var diagX=panX+sx2/viewScale;');
    post.push('          var diagY=panY+sy2/viewScale;');
    post.push('          if(diagX<0||diagX>=W-0.999||diagY<0||diagY>=H-0.999){');
    post.push('            var di2=(j*lw+i)*4;');
    post.push('            dest.data[di2]=20;dest.data[di2+1]=24;dest.data[di2+2]=32;dest.data[di2+3]=255;');
    post.push('            continue;');
    post.push('          }');
    post.push('          var ix=diagX|0, iy=diagY|0;');
    post.push('          var rfx=diagX-ix, rfy=diagY-iy;');
    post.push('          var a0=(iy*W+ix)*4, a1=a0+4;');
    post.push('          var b0=((iy+1)*W+ix)*4, b1=b0+4;');
    post.push('          var tt=1-rfx, uu=1-rfy;');
    post.push('          var di=(j*lw+i)*4;');
    post.push('          dest.data[di  ]=sd[a0]*tt*uu+sd[a1]*rfx*uu+sd[b0]*tt*rfy+sd[b1]*rfx*rfy;');
    post.push('          dest.data[di+1]=sd[a0+1]*tt*uu+sd[a1+1]*rfx*uu+sd[b0+1]*tt*rfy+sd[b1+1]*rfx*rfy;');
    post.push('          dest.data[di+2]=sd[a0+2]*tt*uu+sd[a1+2]*rfx*uu+sd[b0+2]*tt*rfy+sd[b1+2]*rfx*rfy;');
    post.push('          dest.data[di+3]=255;');
    post.push('        }');
    post.push('      }');
    post.push('      ctx.putImageData(dest,lx0,ly0);');
    post.push('    }');
    post.push('    /* lens ring */');
    post.push('    ctx.save();');
    post.push('    ctx.strokeStyle="rgba(77,126,245,0.65)";');
    post.push('    ctx.lineWidth=1.5;');
    post.push('    ctx.setLineDash([5,4]);');
    post.push('    ctx.beginPath();ctx.arc(fw,fh,FR,0,Math.PI*2);ctx.stroke();');
    post.push('    /* crosshair at center */');
    post.push('    ctx.setLineDash([]);');
    post.push('    ctx.strokeStyle="rgba(77,126,245,0.35)";');
    post.push('    ctx.lineWidth=1;');
    post.push('    ctx.beginPath();ctx.moveTo(fw-12,fh);ctx.lineTo(fw+12,fh);');
    post.push('    ctx.moveTo(fw,fh-12);ctx.lineTo(fw,fh+12);ctx.stroke();');
    post.push('    ctx.restore();');
    post.push('  }');
    post.push('}');
    post.push('');
    post.push('/* ── drag to pan ── */');
    post.push('c.addEventListener("mousedown",function(e){');
    post.push('  if(e.button!==0)return;');
    post.push('  dragging=true; dsx=e.clientX; dsy=e.clientY;');
    post.push('  dpx=panX; dpy=panY;');
    post.push('  c.classList.add("dragging");');
    post.push('  e.preventDefault();');
    post.push('});');
    post.push('document.addEventListener("mousemove",function(e){');
    post.push('  if(!dragging)return;');
    post.push('  panX=dpx-(e.clientX-dsx)/viewScale;');
    post.push('  panY=dpy-(e.clientY-dsy)/viewScale;');
    post.push('  schedule();');
    post.push('});');
    post.push('document.addEventListener("mouseup",function(){');
    post.push('  dragging=false; c.classList.remove("dragging");');
    post.push('});');
    post.push('');
    post.push('/* ── scroll to zoom (at pointer position) ── */');
    post.push('c.addEventListener("wheel",function(e){');
    post.push('  e.preventDefault();');
    post.push('  var mx=e.clientX-c.getBoundingClientRect().left;');
    post.push('  var my=e.clientY-c.getBoundingClientRect().top;');
    post.push('  /* diagram point under mouse stays fixed */');
    post.push('  var diagMX=panX+mx/viewScale, diagMY=panY+my/viewScale;');
    post.push('  var d=e.deltaY>0?-0.15:0.15;');
    post.push('  viewScale=Math.max(0.05,Math.min(8,viewScale*Math.exp(d)));');
    post.push('  panX=diagMX-mx/viewScale; panY=diagMY-my/viewScale;');
    post.push('  document.getElementById("vzm").textContent=Math.round(viewScale*100)+"%";');
    post.push('  schedule();');
    post.push('},{passive:false});');
    post.push('');
    post.push('/* ── keyboard ── */');
    post.push('document.addEventListener("keydown",function(e){');
    post.push('  if(e.code==="Space"){e.preventDefault();toggleFish();}');
    post.push('  else if(e.key==="+"||e.key==="="){zoom(0.15);}');
    post.push('  else if(e.key==="-"){zoom(-0.15);}');
    post.push('  else if(e.key==="0"||e.key==="f"){zoomFit();}');
    post.push('  else if(e.key==="["){FR=Math.max(60,FR-20);document.getElementById("sl-r").value=FR;document.getElementById("vr").textContent=FR;schedule();}');
    post.push('  else if(e.key==="]"){FR=Math.min(600,FR+20);document.getElementById("sl-r").value=FR;document.getElementById("vr").textContent=FR;schedule();}');
    post.push('  else if(e.key==="ArrowLeft") {panX-=30/viewScale;schedule();}');
    post.push('  else if(e.key==="ArrowRight"){panX+=30/viewScale;schedule();}');
    post.push('  else if(e.key==="ArrowUp")   {panY-=30/viewScale;schedule();}');
    post.push('  else if(e.key==="ArrowDown") {panY+=30/viewScale;schedule();}');
    post.push('});');
    post.push('window.addEventListener("resize",function(){resize();schedule();});');
    post.push('<\/script>');
    post.push('</body>');
    post.push('</html>');

    return { pre: pre.join("\r\n"), post: post.join("\r\n") };
}

})();
