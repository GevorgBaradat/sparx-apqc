//ea_diagram_to_svg 2026-07-05-v37
// VERSION: 2026-07-05-v37 (class drill-down via t_diagram.ParentID; diamond fixed to END; no double-marker)
/**
 * ea_diagram_to_svg.js  (v37)
 * ==============================
 * Sparx EA — JScript/WSH
 *
 * Исправления v11:
 *   1. Ромбы: отдельные маркеры _end и _start с явным orient
 *      (auto-start-reverse не работает в Chrome/Edge для marker-start)
 *   2. Ортогональный рутинг через <path> с явными L-сегментами
 *   3. Диагностика Mode в логе
 *
 * Исправления v11.1 (линии — waypoints):
 *   ПРОБЛЕМА: скрипт читал c.PDATA1 из t_connector как источник waypoints.
 *   PDATA1 в t_connector — это поле статуса объекта, НЕ waypoints коннектора.
 *
 *   РЕШЕНИЕ: waypoints хранятся в t_diagramlinks.Path
 *   Формат c.PDATA1: "x1:y1:x2:y2:..." — EA-координаты (все через двоеточие)
 *   x и y пары через двоеточие, точки через точку с запятой.
 *
 *   Примечание: PDATA1 хранит waypoints коннектора в t_connector
 *   вручную переместил линию в EA. Для авто-линий Path=NULL,
 *   скрипт корректно использует Mode=3 (L-shape) как fallback.
 *
 *   Изменены 4 места: SQL запрос, извлечение поля,
 *   сигнатура buildPts, парсинг waypoints.
 */

var COL = "#444";
var SW  = 1.5;

/* ================================================================
   safeDiagName — очищаем имя для имени файла
================================================================ */
function safeDiagName(name) {
    return name.replace(/[\r\n]/g," ")
               .replace(/[\\\/:\*\?"<>|]/g,"_")
               .replace(/\s+/g," ")
               .replace(/^\s+|\s+$/g,"");
}

/* ================================================================
   Рекурсивный обход дерева диаграмм детализации (v36).
   VISITED: diagID -> имя файла. Служит и защитой от циклов/повторов,
   и гарантией, что ссылка и реальный файл имеют одно имя.
   Имя файла детерминировано и уникально по ID (одноимённые диаграммы
   не перезаписывают друг друга).
================================================================ */
var VISITED = {};
function svgFileFor(diagID, diagName) {
    return safeDiagName(diagName) + "_" + diagID + ".svg";
}

/* ================================================================
   generateSVG(diagID, diagName, outDir, depth)
   Строит SVG для одной диаграммы, рекурсивно строит дочерние (depth<=1).
   Возвращает имя выходного файла (без пути) или "" при ошибке.
================================================================ */
function generateSVG(diagID, diagName, outDir, depth) {

    /* Имя выходного файла этой диаграммы (детерминировано по ID).
       Помечаем ДО рекурсии в детей => циклы A->B->A не зациклятся. */
    var myFile = svgFileFor(diagID, diagName);
    VISITED[diagID] = myFile;
    var indent = ""; for(var _z=0;_z<(depth||0);_z++) indent+="  ";
    Session.Output(indent+"[build] "+diagName+" (ID="+diagID+") -> "+myFile);
    /* ---- Элементы ---- */
    var rowsElems = queryRows(
        "SELECT o.Object_ID, o.Name, o.Object_Type, o.Stereotype, o.Note AS ObjNote," +
        " o.ea_guid AS ObjGUID, o.NType AS ObjNType, o.PDATA1 AS ObjPDATA1," +
        " do.RectLeft, do.RectTop, do.RectRight, do.RectBottom," +
        " do.ObjectStyle" +
        " FROM t_diagramobjects do" +
        " JOIN t_object o ON o.Object_ID = do.Object_ID" +
        " WHERE do.Diagram_ID = " + diagID +
        "   AND (o.Stereotype IS NULL OR o.Stereotype <> 'SVGPreview')" +
        " ORDER BY do.RectTop, do.RectLeft");

    /* ---- Коннекторы ---- */
    /* v29: c.PDATA1 — waypoints коннектора, формат x1:y1:x2:y2:...
       Возврат к исходной логике v25 с исправлением >=2              */
    var rowsConns = queryRows(
        "SELECT c.Connector_ID, c.Connector_Type, c.SubType," +
        " c.SourceIsAggregate, c.DestIsAggregate," +
        " c.Start_Object_ID, c.End_Object_ID," +
        " c.Direction," +
        " c.PtStartX, c.PtStartY, c.PtEndX, c.PtEndY," +
        " dl.Geometry AS DiagGeometry, dl.Style AS DiagStyle," +
        " dl.Path AS ConnPath" +
        " FROM t_connector c" +
        " JOIN t_diagramlinks dl ON dl.ConnectorID = c.Connector_ID" +
        " WHERE dl.DiagramID = " + diagID);

    /* ---- Парсим элементы ---- */
    var elemMap={}, elements=[];
    var eaMinX=999999,eaMinY=999999,eaMaxX=-999999,eaMaxY=-999999;

    for (var i=0; i<rowsElems.length; i++) {
        var row=rowsElems[i];
        var rl=pf(cv(row,"RectLeft")), rr2=pf(cv(row,"RectRight"));
        var rt=pf(cv(row,"RectTop")),  rb=pf(cv(row,"RectBottom"));
        var xL=Math.min(rl,rr2), xR=Math.max(rl,rr2);
        var yB=Math.min(rt,rb),  yT=Math.max(rt,rb);
        var w=xR-xL, h=yT-yB;
        if (w<2||h<2) continue;
        var eid       = cv(row,"Object_ID");
        var stereo    = cv(row,"Stereotype");
        var objNote   = cv(row,"ObjNote")   || "";
        var objGUID   = cv(row,"ObjGUID")   || "";
        var objNType  = parseInt(cv(row,"ObjNType")||"0");
        var objPDATA1 = cv(row,"ObjPDATA1") || "";
        var hasDrill  = (objNType===8 && objPDATA1 && objPDATA1!=="0");
        var childDiagID = hasDrill ? objPDATA1 : "";
        var objStyle  = cv(row,"ObjectStyle") || "";
        var showNotes = false;
        var nm = /Notes=(\d+)/i.exec(objStyle);
        if (nm && parseInt(nm[1])>0) showNotes=true;
        var ucRect  = /UCRect=1/i.test(objStyle);
        var objType = cv(row,"Object_Type") || "";
        var el={id:eid, name:cv(row,"Name"), stereo:stereo,
                note:objNote, showNotes:showNotes,
                hasDrill:hasDrill, childDiagID:childDiagID,
                childSVGFile:"",          /* заполним ниже */
                ucRect:ucRect, objType:objType,
                guid:objGUID, eaX:xL, eaY:yB, w:w, h:h};
        elements.push(el);
        elemMap[eid]=el;
        if (xL    <eaMinX) eaMinX=xL;
        if (yB    <eaMinY) eaMinY=yB;
        if (xL+w  >eaMaxX) eaMaxX=xL+w;
        if (yB+h  >eaMaxY) eaMaxY=yB+h;
    }

    /* ---- CLASS drill-down: t_diagram.ParentID = element.Object_ID (v37) ----
       Два разных пути drill-down:
       1. Activity/BPMN — NType=8 + PDATA1 = ID дочерней диаграммы (уже выше).
       2. Class diagram — t_diagram.ParentID = element.Object_ID.
       Путь 2 подхватывает Contact-карточки, Category-элементы и любой Class,
       у которого в модели есть «своя» диаграмма (ParentID = OID).
       Если оба пути нашли что-то — приоритет у activity-пути (уже установлен). */
    var classChildRows = queryRows(
        "SELECT ParentID, MIN(Diagram_ID) AS DID FROM t_diagram" +
        " WHERE ParentID IS NOT NULL AND ParentID <> '0'" +
        " GROUP BY ParentID");
    var classChildMap = {};
    for (var _cc=0; _cc<classChildRows.length; _cc++) {
        var _ccp = cv(classChildRows[_cc], "ParentID");
        var _ccd = cv(classChildRows[_cc], "DID");
        if (_ccp && _ccd) classChildMap[_ccp] = _ccd;
    }
    for (var _ei=0; _ei<elements.length; _ei++) {
        var _el = elements[_ei];
        if (!_el.hasDrill && classChildMap[_el.id]) {
            _el.childDiagID = classChildMap[_el.id];
            _el.hasDrill    = true;
        }
    }

    /* ---- Рекурсивно строим дочерние диаграммы (весь путь до листьев) ---- */
    /* Тот же activity/BPMN-путь (NType=8 + PDATA1 = ID дочерней диаграммы),
       но без ограничения глубины: спускаемся до конца дерева. Ссылку
       (childSVGFile) проставляем всегда, а реально экспортируем ребёнка
       лишь если он ещё не в VISITED. */
    for (var di=0; di<elements.length; di++) {
        var del = elements[di];
        if (!del.hasDrill || !del.childDiagID) continue;
        var childID = parseInt(del.childDiagID);
        if (!childID || childID === diagID) continue;   /* self-link — пропускаем */
        var childRows = queryRows(
            "SELECT Name FROM t_diagram WHERE Diagram_ID = " + childID);
        if (childRows.length === 0) continue;            /* нет такой диаграммы */
        var childName = cv(childRows[0], "Name");
        /* ссылка навигируема всегда (одно имя и для файла, и для href) */
        del.childSVGFile = svgFileFor(childID, childName);
        /* экспортируем каждую диаграмму один раз */
        if (!VISITED[childID]) {
            generateSVG(childID, childName, outDir, (depth||0)+1);
        }
    }

    var PAD=50;
    var svgW=(eaMaxX-eaMinX)+PAD*2;
    var svgH=(eaMaxY-eaMinY)+PAD*2;

    function toSvgX(x){ return (x-eaMinX)+PAD; }
    function toSvgY(y){ return (eaMaxY-y)+PAD; }

    for (var k=0; k<elements.length; k++) {
        var ek=elements[k];
        ek.svgX = Math.round(toSvgX(ek.eaX));
        ek.svgY = Math.round(toSvgY(ek.eaY+ek.h));
        ek.svgW = Math.round(ek.w);
        ek.svgH = Math.round(ek.h);
        ek.cx   = ek.svgX + ek.svgW/2;
        ek.cy   = ek.svgY + ek.svgH/2;
        ek.top    = {x:ek.cx,            y:ek.svgY          };
        ek.bottom = {x:ek.cx,            y:ek.svgY+ek.svgH  };
        ek.left   = {x:ek.svgX,          y:ek.cy            };
        ek.right  = {x:ek.svgX+ek.svgW,  y:ek.cy            };
    }

    /* ── elemBoundaryIntersect ──────────────────────────────────────────────
       Finds where a ray from element CENTER in direction (dx,dy) exits the
       element bounding box. Used for Direct-style connectors.              */
    function elemBoundaryIntersect(el, dx, dy) {
        var cx=el.cx, cy=el.cy;
        var x0=el.svgX, y0=el.svgY, x1=x0+el.svgW, y1=y0+el.svgH;
        var bt=Infinity, bx=cx, by=cy;
        var t, px, py;
        if(Math.abs(dx)>0.001){
            t=(x0-cx)/dx; if(t>0){py=cy+t*dy; if(y0<=py&&py<=y1&&t<bt){bt=t;bx=x0;by=py;}}
            t=(x1-cx)/dx; if(t>0){py=cy+t*dy; if(y0<=py&&py<=y1&&t<bt){bt=t;bx=x1;by=py;}}
        }
        if(Math.abs(dy)>0.001){
            t=(y0-cy)/dy; if(t>0){px=cx+t*dx; if(x0<=px&&px<=x1&&t<bt){bt=t;bx=px;by=y0;}}
            t=(y1-cy)/dy; if(t>0){px=cx+t*dx; if(x0<=px&&px<=x1&&t<bt){bt=t;bx=px;by=y1;}}
        }
        return {x:Math.round(bx), y:Math.round(by)};
    }

    /* ── clipSeg (Liang-Barsky) ─────────────────────────────────────────────
       Returns {t0,t1}: the part of segment (px,py)->(qx,qy) that lies inside
       element rect, or null if it misses. Used for moved Direct connectors:
       the anchor->anchor segment is clipped to each element box.           */
    function clipSeg(px, py, qx, qy, el) {
        var dx=qx-px, dy=qy-py, t0=0.0, t1=1.0;
        var x0=el.svgX, y0=el.svgY, x1=x0+el.svgW, y1=y0+el.svgH;
        var P=[-dx, dx, -dy, dy];
        var Q=[px-x0, x1-px, py-y0, y1-py];
        for(var i=0;i<4;i++){
            if(P[i]===0){ if(Q[i]<0) return null; }
            else{
                var r=Q[i]/P[i];
                if(P[i]<0){ if(r>t0) t0=r; }
                else      { if(r<t1) t1=r; }
            }
        }
        return (t0<=t1)?{t0:t0,t1:t1}:null;
    }

    /* ── edgeAttachPt ───────────────────────────────────────────────────────
       Attachment point on a specific edge with offset.
       edge: 1=top,2=right,3=bottom,4=left
       sx/sy: EA-coordinate offsets along the edge (SX in Geometry).
       EA Y-axis is opposite to SVG Y-axis for Y offsets.                  */
    function edgeAttachPt(el, edge, sx, sy) {
        sx=sx||0; sy=sy||0;
        switch(edge){
            case 1: return {x:el.cx+sx,      y:el.svgY         };  /* top    */
            case 2: return {x:el.svgX+el.svgW, y:el.cy-sy       };  /* right  */
            case 3: return {x:el.cx+sx,      y:el.svgY+el.svgH  };  /* bottom */
            case 4: return {x:el.svgX,        y:el.cy-sy        };  /* left   */
        }
        return {x:el.cx, y:el.cy};
    }

    /* ── buildPts v31 ───────────────────────────────────────────────────────
       TWO line styles exist in this diagram:
         Direct:            no TREE= in Style string, no dl.Path
         Orthogonal-Square: TREE=OS in Style, dl.Path has waypoints

       For Direct: attachment = intersection of center-to-center line with
                   element boundary (Sparx EA algorithm).
       For Orthogonal: attachment from EDGE+SX/SY; route through dl.Path;
                       dst from last segment direction + EY/EX.
       PDATA1 in t_connector is IGNORED (stale from old Custom Line style). */
    function buildPts(ep, mode, connPath, sEl, eEl, geom, diagSt) {
        var src=ep.src, end=ep.end;
        var isOrtho = /TREE=/i.test(diagSt||"");

        if (!isOrtho) {
            /* ── DIRECT (v32): honour manual move via SX/SY/EX/EY ──
               EA stores a moved direct line as offsets of the attachment
               anchors from each element centre (not as waypoints):
                 srcAnchor = centre(src) + (SX, -SY)
                 tgtAnchor = centre(tgt) + (EX, -EY)   (EA Y is inverted)
               The drawn line is the anchor->anchor segment clipped to the
               element boxes: source = exit toward target (t1), target =
               entry from source (t0). With SX=SY=EX=EY=0 this reduces to
               the plain centre-to-centre crossing (unmoved line).         */
            var dsx=gvf(geom,"SX",0), dsy=gvf(geom,"SY",0);
            var dex=gvf(geom,"EX",0), dey=gvf(geom,"EY",0);
            var sax=sEl.cx+dsx, say=sEl.cy-dsy;
            var tax=eEl.cx+dex, tay=eEl.cy-dey;
            var adx=tax-sax, ady=tay-say;
            if(Math.abs(adx)<0.1&&Math.abs(ady)<0.1)
                return [{x:src.x,y:src.y},{x:end.x,y:end.y}];
            var cs=clipSeg(sax,say,tax,tay,sEl);
            var ct=clipSeg(sax,say,tax,tay,eEl);
            var st=cs?cs.t1:0.0;   /* source: leaves src box toward target */
            var tt=ct?ct.t0:1.0;   /* target: enters tgt box from source   */
            var sp ={x:Math.round(sax+st*adx), y:Math.round(say+st*ady)};
            var ep2={x:Math.round(sax+tt*adx), y:Math.round(say+tt*ady)};
            /* Fallback to centre-ray if a clip degenerated (overlapping boxes) */
            if(!cs||!ct){
                var dxc=eEl.cx-sEl.cx, dyc=eEl.cy-sEl.cy;
                if(!cs) sp =elemBoundaryIntersect(sEl, dxc,  dyc);
                if(!ct) ep2=elemBoundaryIntersect(eEl,-dxc, -dyc);
            }
            Session.Output("  Direct: ("+sp.x+","+sp.y+")->("+ep2.x+","+ep2.y+")"
                +" [SX/SY="+dsx+"/"+dsy+" EX/EY="+dex+"/"+dey+"]");
            return [sp, ep2];
        }

        /* ── ORTHOGONAL: parse dl.Path waypoints ── */
        var wps=[];
        if(connPath && connPath.length>2){
            var segs=connPath.split(";");
            for(var si=0;si<segs.length;si++){
                var seg=segs[si].replace(/^\s+|\s+$/g,"");
                if(!seg) continue;
                var pair=seg.split(":");
                if(pair.length>=2){
                    var wx=parseFloat(pair[0]),wy=parseFloat(pair[1]);
                    if(!isNaN(wx)&&!isNaN(wy))
                        wps.push({x:Math.round(toSvgX(wx)),y:Math.round(toSvgY(wy))});
                }
            }
        }

        if(wps.length===0){
            /* No stored path — fallback: single bend from src edge to dst center */
            var sE=ep.srcEdge||0;
            if(sE===1||sE===3){ /* vertical start */
                return [src,{x:src.x,y:end.y},end];
            } else {
                return [src,{x:end.x,y:src.y},end];
            }
        }

        /* Build full path: src → wps → dst_pt */
        /* Determine approach direction to destination (last segment H or V) */
        var prevPt = wps.length>1 ? wps[wps.length-2] : src;
        var lastWp = wps[wps.length-1];
        var gex=gvf(geom,"EX",0), gey=gvf(geom,"EY",0);

        var dstPt;
        if(Math.abs(lastWp.x-prevPt.x)<1){
            /* Last segment is VERTICAL (same x) → approach DST horizontally */
            /* dst_y = dst.center_y + (-EY_ea) because EA Y is opposite to SVG Y */
            var dst_y = Math.round(eEl.cy + (-gey));
            /* Approach from left or right */
            var dst_x = lastWp.x < eEl.cx ? eEl.svgX : eEl.svgX+eEl.svgW;
            dstPt = {x:dst_x, y:dst_y};
        } else {
            /* Last segment is HORIZONTAL (same y) → approach DST vertically */
            /* dst_x = dst.center_x + EX_ea (X same direction) */
            var dst_x2 = Math.round(eEl.cx + gex);
            /* Approach from top or bottom */
            var dst_y2 = lastWp.y < eEl.cy ? eEl.svgY : eEl.svgY+eEl.svgH;
            dstPt = {x:dst_x2, y:dst_y2};
        }

        var pts=[src];
        for(var wi=0;wi<wps.length;wi++) pts.push(wps[wi]);
        pts.push(dstPt);
        Session.Output("  Ortho wps:"+wps.length+" pts:"+pts.length
            +" dst=("+dstPt.x+","+dstPt.y+")");
        return pts;
    }


    function connStyle(ctype, subtype, srcAgg, dstAgg, dir) {
        var ct=ctype.toLowerCase();
        if(ct==="aggregation"||ct==="composition"||ct==="association"){
            var msId="",meId="";
            if(srcAgg==="2")msId="diaf-s"; else if(srcAgg==="1")msId="dia-s";
            if(dstAgg==="2")meId="diaf-e"; else if(dstAgg==="1")meId="dia-e";
            /* Fallback when neither end has explicit aggregate flag:
               put diamond at END (Destination = "whole" side), NOT at start.
               This also suppresses the nav arrow (line below) since meId becomes set. */
            if(msId===""&&meId===""){if(ct==="composition")meId="diaf-e";else if(ct==="aggregation")meId="dia-e";}
            if(dir==="Source -> Destination"&&meId==="")meId="open-e";
            else if(dir==="Destination -> Source"&&msId==="")msId="open-e";
            return {dash:false,me:meId,ms:msId};
        }
        if(ct==="dependency"||ct==="usage"||ct==="abstraction") return {dash:true, me:"open-e",ms:""};
        if(ct==="realization")   return {dash:true, me:"tri-e", ms:""};
        if(ct==="generalization") return {dash:false,me:"tri-e", ms:""};
        if(ct==="notelink")      return {dash:true, me:"",      ms:""};
        return                          {dash:false,me:"open-e",ms:""};
    }

    /* ---- Парсим связи ---- */
    var connectors=[];
    for(var ci=0;ci<rowsConns.length;ci++){
        var cr=rowsConns[ci];
        var ctype=cv(cr,"Connector_Type"),subtype=cv(cr,"SubType");
        var srcAgg=cv(cr,"SourceIsAggregate"),dstAgg=cv(cr,"DestIsAggregate");
        var startID=cv(cr,"Start_Object_ID"),endID=cv(cr,"End_Object_ID");
        var geom=cv(cr,"DiagGeometry"),cdir=cv(cr,"Direction");
        var connPath=cv(cr,"ConnPath"),diagSt=cv(cr,"DiagStyle");
        var ptSx=parseFloat(cv(cr,"PtStartX")||"0")||0;
        var ptSy=parseFloat(cv(cr,"PtStartY")||"0")||0;
        var ptEx=parseFloat(cv(cr,"PtEndX")  ||"0")||0;
        var ptEy=parseFloat(cv(cr,"PtEndY")  ||"0")||0;
        var sEl=elemMap[startID],eEl=elemMap[endID];
        if(!sEl||!eEl)continue;
        var edge=gvi(geom,"EDGE",0),mode=gvi(diagSt,"Mode",0);
        var gsx=gvf(geom,"SX",0),gsy=gvf(geom,"SY",0);
        var gex=gvf(geom,"EX",0),gey=gvf(geom,"EY",0);
        /* ep: fallback attachment points used in non-Direct mode when no Path */
        var _edge=gvi(geom,"EDGE",0);
        var ep={src:edgeAttachPt(sEl,_edge,gsx,gsy),
                end:edgeAttachPt(eEl,_edge,gex,gey),
                srcEdge:_edge, dstEdge:_edge,
                axis:(_edge===1||_edge===3)?"V":"H"};
        var pts=buildPts(ep,mode,connPath,sEl,eEl,geom,diagSt);
        var st=connStyle(ctype,subtype,srcAgg,dstAgg,cdir);
        /* LineColor from t_diagramlinks.Style "Color=N" (Windows COLORREF)
           t_connector.LineColor is per-model default; Style.Color is per-diagram */
        var _styleColor=gvf(diagSt,"Color",0);
        var _lcRaw=Math.round(_styleColor);
        var lineColor=COL;
        if(_lcRaw!==0&&_lcRaw!==-1){
            var _lcu=(_lcRaw<0)?(_lcRaw+4294967296):_lcRaw;
            var _lcr=(_lcu&255).toString(16);
            var _lcg=((_lcu>>8)&255).toString(16);
            var _lcb=((_lcu>>16)&255).toString(16);
            if(_lcr.length<2)_lcr="0"+_lcr;
            if(_lcg.length<2)_lcg="0"+_lcg;
            if(_lcb.length<2)_lcb="0"+_lcb;
            lineColor="#"+_lcr+_lcg+_lcb;
        }
        connectors.push({pts:pts,me:st.me,ms:st.ms,dash:st.dash,col:lineColor});
    }
    Session.Output("Связей: "+connectors.length);

    /* Расширяем canvas до фактического max Y/X коннекторов */
    for(var _cxi=0;_cxi<connectors.length;_cxi++){
        var _cpts=connectors[_cxi].pts;
        for(var _cpj=0;_cpj<_cpts.length;_cpj++){
            var _cpx=_cpts[_cpj].x, _cpy=_cpts[_cpj].y;
            if(_cpx+20>svgW) svgW=_cpx+20;
            if(_cpy+20>svgH) svgH=_cpy+20;
        }
    }
    svgW=Math.ceil(svgW); svgH=Math.ceil(svgH);

    /* ================================================================
       СТРОИМ SVG
    ================================================================ */
    var L=[];
    L.push('<?xml version="1.0" encoding="UTF-8"?>');
    L.push('<svg xmlns="http://www.w3.org/2000/svg"');
    L.push('     xmlns:xlink="http://www.w3.org/1999/xlink"');
    L.push('     width="'+svgW+'" height="'+svgH+'"');
    L.push('     viewBox="0 0 '+svgW+' '+svgH+'">');
    L.push('');
    L.push('<defs>');

    /* Открытая стрелка → (end) */
    L.push('  <marker id="open-e" viewBox="0 0 10 10"');
    L.push('          refX="9" refY="5" orient="auto"');
    L.push('          markerWidth="6" markerHeight="6" markerUnits="strokeWidth">');
    L.push('    <polyline points="0,0 10,5 0,10"');
    L.push('              fill="none" stroke="'+COL+'" stroke-width="1.5" stroke-linejoin="round"/>');
    L.push('  </marker>');

    /* Пустой треугольник △ (end) */
    L.push('  <marker id="tri-e" viewBox="0 0 10 10"');
    L.push('          refX="10" refY="5" orient="auto"');
    L.push('          markerWidth="7" markerHeight="7" markerUnits="strokeWidth">');
    L.push('    <polygon points="0,0 10,5 0,10"');
    L.push('             fill="white" stroke="'+COL+'" stroke-width="1.5"/>');
    L.push('  </marker>');

    /* Пустой ромб ◇ (start) */
    L.push('  <marker id="dia-s" viewBox="0 0 12 8"');
    L.push('          refX="0" refY="4" orient="auto"');
    L.push('          markerWidth="8" markerHeight="6" markerUnits="strokeWidth">');
    L.push('    <polygon points="0,4 6,0 12,4 6,8"');
    L.push('             fill="white" stroke="'+COL+'" stroke-width="1.2"/>');
    L.push('  </marker>');

    /* Закрашенный ромб ◆ (start) */
    L.push('  <marker id="diaf-s" viewBox="0 0 12 8"');
    L.push('          refX="0" refY="4" orient="auto"');
    L.push('          markerWidth="8" markerHeight="6" markerUnits="strokeWidth">');
    L.push('    <polygon points="0,4 6,0 12,4 6,8"');
    L.push('             fill="'+COL+'" stroke="'+COL+'" stroke-width="1"/>');
    L.push('  </marker>');

    /* Пустой ромб ◇ на КОНЦЕ (marker-end) */
    L.push('  <marker id="dia-e" viewBox="0 0 12 8"');
    L.push('          refX="12" refY="4" orient="auto"');
    L.push('          markerWidth="8" markerHeight="6" markerUnits="strokeWidth">');
    L.push('    <polygon points="0,4 6,0 12,4 6,8"');
    L.push('             fill="white" stroke="'+COL+'" stroke-width="1.2"/>');
    L.push('  </marker>');

    /* Закрашенный ромб ◆ на КОНЦЕ */
    L.push('  <marker id="diaf-e" viewBox="0 0 12 8"');
    L.push('          refX="12" refY="4" orient="auto"');
    L.push('          markerWidth="8" markerHeight="6" markerUnits="strokeWidth">');
    L.push('    <polygon points="0,4 6,0 12,4 6,8"');
    L.push('             fill="'+COL+'" stroke="'+COL+'" stroke-width="1"/>');
    L.push('  </marker>');

    L.push('</defs>');
    L.push('');
    L.push('<style>');
    L.push('  .ea-block   { fill:#FDFAF7; stroke:#9A8484; stroke-width:1; }');
    L.push('  .ea-divider { stroke:#9A8484; stroke-width:1; fill:none; }');
    L.push('  .ea-title   { font:bold 10px Calibri,Arial,sans-serif; fill:#595959; }');
    L.push('  .ea-diag    { font:bold 13px Calibri,Arial,sans-serif; fill:#222; }');
    L.push('  .ea-stereo  { font:italic 9px Calibri,Arial,sans-serif; fill:#777; }');
    L.push('  .ea-note    { font:italic 10px Calibri,Arial,sans-serif; fill:#595959; }');
    L.push('  .drill-icon { fill:white; stroke:#555; stroke-width:1.4; cursor:pointer; }');
    L.push('  .drill-link { opacity:0.9; }');
    L.push('  .drill-link:hover .drill-icon { fill:#EAF4FF; stroke:#3070B0; }');
    L.push('</style>');
    L.push('');
    L.push('<rect x="0" y="0" width="'+svgW+'" height="'+svgH+'" fill="white"/>');
    L.push('<text class="ea-diag" x="'+PAD+'" y="28">'+esc(diagName)+'</text>');
    L.push('');

    /* СВЯЗИ */
    L.push('<g id="ea-scene">');
    L.push('<!-- CONNECTORS -->');
    for(var ci2=0;ci2<connectors.length;ci2++){
        var con=connectors[ci2];
        var pts=con.pts;
        var connCol=con.col||COL;
        var attrs='fill="none" stroke="'+connCol+'" stroke-width="'+SW+'"';
        if(con.dash) attrs+=' stroke-dasharray="7,4"';
        if(con.me)   attrs+=' marker-end="url(#'+con.me+')"';
        if(con.ms)   attrs+=' marker-start="url(#'+con.ms+')"';
        if(pts.length===2){
            L.push('<line '+attrs);
            L.push('      x1="'+rd(pts[0].x)+'" y1="'+rd(pts[0].y)+'"');
            L.push('      x2="'+rd(pts[1].x)+'" y2="'+rd(pts[1].y)+'"/>');
        } else {
            var d="M "+rd(pts[0].x)+","+rd(pts[0].y);
            for(var pi=1;pi<pts.length;pi++) d+=" L "+rd(pts[pi].x)+","+rd(pts[pi].y);
            L.push('<path d="'+d+'" '+attrs+'/>');
        }
    }
    L.push('');

    /* БЛОКИ */
    L.push('<!-- ELEMENTS -->');
    for(var j=0;j<elements.length;j++){
        var el=elements[j];
        var ex=el.svgX, ey=el.svgY, ew=el.svgW, eh=el.svgH;

        var STEREO_H=13, LINE_H=13, PAD_TOP=4, PAD_BOT=5;
        var textW = el.ucRect ? (ew-10) : ew; /* Sparx EA fills full element width */
        var nameLines = wrapText(el.name, textW, 10);
        var titleH = PAD_TOP + (el.stereo?STEREO_H:0) + nameLines.length*LINE_H + PAD_BOT;
        if(titleH<22) titleH=22;

        var clipId='clip-'+el.id;
        /* v25: Class/Interface/Component → острые углы (rx=0) */
        var _ot=(el.objType||"").toLowerCase();
        var _sharp=el.ucRect||_ot==="class"||_ot==="interface"
            ||_ot==="datatype"||_ot==="enumeration"
            ||_ot==="component"||_ot==="artifact";
        var rr=_sharp?0:10;

        /* clipPath */
        L.push('<clipPath id="'+clipId+'">');
        if(rr>0) L.push('  <rect x="'+(ex+1)+'" y="'+ey+'" width="'+(ew-2)+'" height="'+eh+'" rx="'+rr+'" ry="'+rr+'"/>');
        else     L.push('  <rect x="'+(ex+1)+'" y="'+ey+'" width="'+(ew-2)+'" height="'+eh+'"/>');
        L.push('</clipPath>');

        var _hasNote = el.note && el.note.length>0;
        var _nmAttr = esc(el.name||"").replace(/"/g,"&quot;");
        L.push('<g class="ea-el" data-id="'+el.id+'" data-name="'+_nmAttr+'">');

        /* Основной прямоугольник */
        if(rr>0) L.push('  <rect class="ea-block" x="'+ex+'" y="'+ey+'" width="'+ew+'" height="'+eh+'" rx="'+rr+'" ry="'+rr+'"/>');
        else     L.push('  <rect class="ea-block" x="'+ex+'" y="'+ey+'" width="'+ew+'" height="'+eh+'"/>');

        /* Разделитель заголовка убран (v26): в Class-диаграммах
           внутренние секции не нужны, элементы — просто блоки с именем. */

        /* Стереотип */
        var ty=ey+PAD_TOP;
        if(el.stereo){
            ty+=STEREO_H;
            L.push('  <text class="ea-stereo" clip-path="url(#'+clipId+')"');
            L.push('        x="'+(ex+5)+'" y="'+ty+'" text-anchor="start">\u00ab'+esc(el.stereo)+'\u00bb</text>');
        }

        /* Имя */
        L.push('  <text class="ea-title" text-anchor="middle" clip-path="url(#'+clipId+'">');
        for(var li=0;li<nameLines.length;li++){
            ty+=LINE_H;
            L.push('    <tspan x="'+(ex+ew/2)+'" y="'+ty+'">'+esc(nameLines[li])+'</tspan>');
        }
        L.push('  </text>');

        /* Notes */
        if(el.showNotes && el.note && el.note.length>0){
            var NOTE_LH=14, NOTE_PAD=5;
            var noteW=ew-NOTE_PAD*2;
            var bodyH=eh-titleH-NOTE_PAD;
            var maxNL=Math.max(1,Math.floor(bodyH/NOTE_LH));
            var noteLines=wrapText(el.note,noteW,10);
            if(noteLines.length>maxNL) noteLines=noteLines.slice(0,maxNL);
            var noteY=ey+titleH+NOTE_PAD;
            L.push('  <text class="ea-note" text-anchor="start" clip-path="url(#'+clipId+'">');
            for(var ni=0;ni<noteLines.length;ni++){
                noteY+=NOTE_LH;
                L.push('    <tspan x="'+(ex+NOTE_PAD)+'" y="'+noteY+'">'+esc(noteLines[ni])+'</tspan>');
            }
            L.push('  </text>');
        }

        /* Иконка типа (только UCRect) */
        if(el.ucRect){
            var iW=18,iH=11,iX=ex+ew-iW-3,iY=ey+3;
            L.push('  <rect x="'+iX+'" y="'+iY+'" width="'+iW+'" height="'+iH+'"');
            L.push('        fill="white" stroke="#9A8484" stroke-width="1"/>');
            var tp=(el.objType||'').toLowerCase();
            if(tp==='activity'||tp==='action'){
                L.push('  <rect x="'+(iX+3)+'" y="'+(iY+2)+'" width="'+(iW-6)+'" height="'+(iH-4)+'" rx="2" ry="2"');
                L.push('        fill="none" stroke="#888" stroke-width="1"/>');
            } else if(tp==='usecase'){
                L.push('  <ellipse cx="'+(iX+iW/2)+'" cy="'+(iY+iH/2)+'" rx="'+(iW/2-3)+'" ry="'+(iH/2-2)+'"');
                L.push('        fill="none" stroke="#888" stroke-width="1"/>');
            } else if(tp==='class'){
                L.push('  <rect x="'+(iX+2)+'" y="'+(iY+1)+'" width="'+(iW-4)+'" height="'+(iH-2)+'"');
                L.push('        fill="none" stroke="#888" stroke-width="1"/>');
                L.push('  <line x1="'+(iX+2)+'" y1="'+(iY+4)+'" x2="'+(iX+iW-2)+'" y2="'+(iY+4)+'" stroke="#888" stroke-width="1"/>');
            }
        }

        /* Иконка drill-down — кликабельная ссылка */
        /* Не показываем иконку если дочерняя диаграмма = текущая (избегаем рекурсии) */
        if(el.hasDrill && parseInt(el.childDiagID) !== diagID){
            var lw=10,lh=6,lr=3;
            var lx2=ex+ew-lw-3;
            var lx1=lx2-lw+lr;
            var ly=ey+eh-lh-4;

            if(el.childSVGFile){
                /* Кликабельная ссылка на дочерний SVG */
                L.push('  <a href="'+el.childSVGFile+'" xlink:href="'+el.childSVGFile+'" class="drill-link">');
                L.push('    <title>Открыть: '+esc(el.childSVGFile)+'</title>');
            }
            /* Левое звено */
            L.push('  <rect class="drill-icon" x="'+lx1+'" y="'+ly+'" width="'+lw+'" height="'+lh+'" rx="'+lr+'" ry="'+lr+'"/>');
            /* Правое звено */
            L.push('  <rect class="drill-icon" x="'+lx2+'" y="'+ly+'" width="'+lw+'" height="'+lh+'" rx="'+lr+'" ry="'+lr+'"/>');
            /* Белая перемычка */
            L.push('  <rect x="'+(lx1+lw-lr)+'" y="'+(ly+1)+'" width="'+lr+'" height="'+(lh-2)+'"');
            L.push('        fill="white" stroke="none"/>');
            if(el.childSVGFile){
                L.push('  </a>');
            }
        }

        L.push('</g>');
    }

    /* FIRST RECT LINE — диагностика */
    var firstRect="(none)";
    for(var di2=0;di2<L.length;di2++){
        if(L[di2].indexOf('<rect class="ea-block"')>=0){
            firstRect=L[di2];
            break;
        }
    }
    Session.Output("=== FIRST RECT LINE: "+firstRect);

    L.push('</g>');  /* close ea-scene (scalable diagram content) */

    /* ================================================================
       OVERLAY LAYER (v34) — zoom controls, hover tooltip, and the
       reader-comment editor. All overlay UI lives OUTSIDE #ea-scene so
       it is independent of the diagram zoom; tooltip and window have
       their own scale. Works when the .svg is opened directly in a
       browser. Placed last => renders on top.
    ================================================================ */
    L.push('');
    L.push('<!-- TOOLTIP LAYER -->');
    L.push('<g id="ea-tip" style="display:none" pointer-events="none">');
    L.push('  <rect id="ea-tip-bg" x="0" y="0" width="10" height="10" rx="5" ry="5"');
    L.push('        fill="#2b2b2b" fill-opacity="0.96" stroke="#000" stroke-opacity="0.25"/>');
    L.push('  <text id="ea-tip-txt" x="0" y="0" font-family="Calibri,Arial,sans-serif" font-size="11" fill="#f4f4f4"></text>');
    L.push('</g>');

    /* ---- HTML overlay: zoom panel + editor modal (pointer-events gated) ---- */
    L.push('<foreignObject id="ea-ui" x="0" y="0" width="'+svgW+'" height="'+svgH+'" pointer-events="none">');
    L.push('  <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;pointer-events:none;font-family:Calibri,Arial,sans-serif;">');
    /* zoom / save panel (fixed top-right) */
    L.push('    <div id="ea-panel" style="position:fixed;top:10px;right:10px;transform-origin:top left;pointer-events:auto;background:rgba(255,255,255,0.94);border:1px solid #c8d0dc;border-radius:8px;padding:8px 10px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:11px;color:#333;">');
    L.push('      <div id="ea-panel-head" style="cursor:move;user-select:none;font-weight:700;color:#69738C;margin:-2px -4px 6px;padding:2px 4px;letter-spacing:0.4px;display:flex;justify-content:space-between;gap:12px;"><span>МАСШТАБ</span><span style="color:#b8c0cc;">\u283f</span></div>');
    L.push('      <div style="display:flex;align-items:center;gap:6px;margin:3px 0;"><span style="width:78px;">Диаграмма</span><button data-act="diag-" style="width:22px;height:20px;cursor:pointer;">\u2212</button><span id="ea-diag-v" style="width:40px;text-align:center;">100%</span><button data-act="diag+" style="width:22px;height:20px;cursor:pointer;">+</button></div>');
    L.push('      <div style="display:flex;align-items:center;gap:6px;margin:3px 0;"><span style="width:78px;">Тултип</span><button data-act="tip-" style="width:22px;height:20px;cursor:pointer;">\u2212</button><span id="ea-tip-v" style="width:40px;text-align:center;">100%</span><button data-act="tip+" style="width:22px;height:20px;cursor:pointer;">+</button></div>');
    L.push('      <div style="display:flex;align-items:center;gap:6px;margin:3px 0;"><span style="width:78px;">Окно</span><button data-act="edit-" style="width:22px;height:20px;cursor:pointer;">\u2212</button><span id="ea-edit-v" style="width:40px;text-align:center;">100%</span><button data-act="edit+" style="width:22px;height:20px;cursor:pointer;">+</button></div>');
    L.push('      <div style="margin-top:8px;border-top:1px solid #e0e4ea;padding-top:7px;"><button data-act="save" style="width:100%;padding:6px 8px;border-radius:5px;border:none;cursor:pointer;background:#1a2e5a;color:#fff;font-size:11px;">Сохранить с заметками…</button></div>');
    L.push('      <div id="ea-panel-grip" title="Изменить размер" style="position:absolute;right:2px;bottom:2px;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%,#9aa6b8 45%,#9aa6b8 100%);border-bottom-right-radius:7px;"></div>');
    L.push('    </div>');
    /* editor modal (hidden until an element is clicked) */
    L.push('    <div id="ea-modal" style="display:none;position:fixed;left:0;top:0;transform-origin:top left;pointer-events:auto;background:#fff;border:1px solid #b8c0cc;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.28);width:460px;max-width:94vw;overflow:hidden;">');
    L.push('      <div id="ea-modal-head" style="cursor:move;background:#1a2e5a;color:#fff;padding:9px 12px;font-weight:700;font-size:13px;user-select:none;"><span id="ea-modal-title">Примечания читателя</span></div>');
    L.push('      <div style="padding:12px 14px;max-height:80vh;overflow:auto;box-sizing:border-box;">');
    L.push('        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#69738C;letter-spacing:0.6px;margin-bottom:4px;">Ваши примечания (текст Notes скопирован сверху — можно править или удалить)</div>');
    L.push('        <textarea id="ea-modal-ta" rows="10" style="width:100%;box-sizing:border-box;border:1px solid #c8d0dc;border-radius:5px;padding:8px 10px;font-size:12px;line-height:1.5;font-family:Calibri,Arial,sans-serif;color:#333;resize:vertical;outline:none;background:#fafbfc;"></textarea>');
    L.push('        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;"><button data-act="msave" style="padding:7px 18px;border-radius:5px;border:none;cursor:pointer;font-size:12px;background:#1a2e5a;color:#fff;">Сохранить</button><button data-act="mclose" style="padding:7px 18px;border-radius:5px;border:none;cursor:pointer;font-size:12px;background:#e8ecf0;color:#444;">Закрыть</button></div>');
    L.push('      </div>');
    L.push('    </div>');
    L.push('  </div>');
    L.push('</foreignObject>');

    L.push('<script type="text/ecmascript"><![CDATA[');
    L.push('var EA_NOTES = {');
    var _tnFirst=true;
    for(var _tni=0;_tni<elements.length;_tni++){
        var _tne=elements[_tni];
        if(!_tne.note || _tne.note.length===0) continue;
        L.push((_tnFirst?'':',')+'"'+_tne.id+'":"'+jsEsc(_tne.note)+'"');
        _tnFirst=false;
    }
    L.push('};');
    L.push('var EA_RECTS = {');
    var _trFirst=true;
    for(var _tri=0;_tri<elements.length;_tri++){
        var _tre=elements[_tri];
        L.push((_trFirst?'':',')+'"'+_tre.id+'":{x:'+_tre.svgX+',y:'+_tre.svgY+',w:'+_tre.svgW+',h:'+_tre.svgH+'}');
        _trFirst=false;
    }
    L.push('};');
    L.push("(function(){");
    L.push("  var svg=document.documentElement, SVGNS='http://www.w3.org/2000/svg', XN='http://www.w3.org/1999/xhtml';");
    L.push("  var scene=document.getElementById('ea-scene');");
    L.push("  var tip=document.getElementById('ea-tip'), bg=document.getElementById('ea-tip-bg'), txt=document.getElementById('ea-tip-txt');");
    L.push("  var modal=document.getElementById('ea-modal'), ta=document.getElementById('ea-modal-ta'), mtitle=document.getElementById('ea-modal-title');");
    L.push("  var diagScale=1, tipScale=1, editScale=1, curId=null, EA_COMMENTS={}, baseW=0, baseH=0;");
    L.push("  var DIV='\\n'+Array(27).join('\\u2500')+'\\n';");
    L.push("  var FS=11,LH=14,PADX=8,PADY=6,MAXW=300,CHARW=FS*0.52;");
    L.push("  var maxChars=Math.max(12,Math.floor((MAXW-2*PADX)/CHARW));");
    L.push("  function wrap(s){var ps=(''+s).split('\\n'),out=[];");
    L.push("    for(var p=0;p<ps.length;p++){if(ps[p]===''){out.push('');continue;}");
    L.push("      var ws=ps[p].split(/\\s+/),cur='';");
    L.push("      for(var i=0;i<ws.length;i++){var w=ws[i];if(!w)continue;");
    L.push("        if(!cur){cur=w;continue;}");
    L.push("        if((cur+' '+w).length<=maxChars)cur+=' '+w;else{out.push(cur);cur=w;}}");
    L.push("      if(cur)out.push(cur);}");
    L.push("    if(!out.length)out.push('');return out;}");
    L.push("  function show(note){while(txt.firstChild)txt.removeChild(txt.firstChild);");
    L.push("    var lines=wrap(note),mx=0;");
    L.push("    for(var i=0;i<lines.length;i++){var ts=document.createElementNS(SVGNS,'tspan');");
    L.push("      ts.setAttribute('x',PADX);ts.setAttribute('dy',i===0?FS:LH);");
    L.push("      ts.appendChild(document.createTextNode(lines[i]));txt.appendChild(ts);");
    L.push("      if(lines[i].length>mx)mx=lines[i].length;}");
    L.push("    var w=Math.min(MAXW,mx*CHARW+2*PADX),h=lines.length*LH+2*PADY-(LH-FS);");
    L.push("    bg.setAttribute('width',w);bg.setAttribute('height',h);txt.setAttribute('y',PADY);");
    L.push("    tip.style.display='block';tip._w=w;tip._h=h;}");
    L.push("  function hide(){tip.style.display='none';}");
    L.push("  function toSvg(e){var p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;");
    L.push("    var m=svg.getScreenCTM();if(m)p=p.matrixTransform(m.inverse());return p;}");
    L.push("  function move(e){if(tip.style.display==='none')return;var p=toSvg(e);");
    L.push("    var vb=svg.viewBox.baseVal, CW=vb?vb.width:1e4, CH=vb?vb.height:1e4;");
    L.push("    var VW=window.innerWidth||CW, VH=window.innerHeight||CH;");
    L.push("    var es=Math.min(tipScale,(VW-12)/tip._w,(VH-12)/tip._h);if(es<0.3)es=0.3;");
    L.push("    var tw=tip._w*es,th=tip._h*es,x=p.x+14,y=p.y+16;");
    L.push("    if(x+tw>CW)x=p.x-tw-14;if(y+th>CH)y=p.y-th-8;if(x<2)x=2;if(y<2)y=2;");
    L.push("    tip.setAttribute('transform','translate('+x+','+y+') scale('+es+')');}");
    L.push("  function layout(){if(!baseW){var b=svg.viewBox.baseVal;baseW=(b&&b.width)?b.width:parseFloat(svg.getAttribute('width'));baseH=(b&&b.height)?b.height:parseFloat(svg.getAttribute('height'));}");
    L.push("    var iw=window.innerWidth||baseW, ih=window.innerHeight||baseH;");
    L.push("    var W=Math.max(baseW*diagScale,iw), H=Math.max(baseH*diagScale,ih);");
    L.push("    svg.setAttribute('width',W);svg.setAttribute('height',H);svg.setAttribute('viewBox','0 0 '+W+' '+H);");
    L.push("    scene.setAttribute('transform','scale('+diagScale+')');");
    L.push("    var fo=document.getElementById('ea-ui');if(fo){fo.setAttribute('width',W);fo.setAttribute('height',H);}");
    L.push("    var bgr=document.getElementById('ea-bg');if(bgr){bgr.setAttribute('width',W);bgr.setAttribute('height',H);}}");
    L.push("  function applyDiag(){layout();var v=document.getElementById('ea-diag-v');if(v)v.textContent=Math.round(diagScale*100)+'%';}");
    L.push("  function maxEdit(){var w=modal.offsetWidth||460,h=modal.offsetHeight||420;");
    L.push("    return Math.max(0.5,Math.min(3,(window.innerWidth*0.96)/w,(window.innerHeight*0.94)/h));}");
    L.push("  function applyEdit(){modal.style.transform='scale('+editScale+')';");
    L.push("    var v=document.getElementById('ea-edit-v');if(v)v.textContent=Math.round(editScale*100)+'%';");
    L.push("    if(modal.style.display!=='none'){var w=modal.offsetWidth*editScale,h=modal.offsetHeight*editScale;");
    L.push("      modal.style.left=Math.max(8,(window.innerWidth-w)/2)+'px';modal.style.top=Math.max(8,(window.innerHeight-h)/2)+'px';}}");
    L.push("  function setTipV(){var v=document.getElementById('ea-tip-v');if(v)v.textContent=Math.round(tipScale*100)+'%';}");
    L.push("  function nonEmpty(s){return s&&s.replace(/\\s/g,'').length>0;}");
    L.push("  function badge(g,on){var list=g.getElementsByClassName?g.getElementsByClassName('ea-badge'):[];");
    L.push("    var b=list&&list.length?list[0]:null;");
    L.push("    if(on){if(!b){var r=EA_RECTS[g.getAttribute('data-id')];if(!r)return;");
    L.push("      b=document.createElementNS(SVGNS,'path');b.setAttribute('class','ea-badge');");
    L.push("      var x=r.x+r.w,y=r.y,s=13;");
    L.push("      b.setAttribute('d','M '+(x-s)+' '+y+' L '+x+' '+y+' L '+x+' '+(y+s)+' Z');");
    L.push("      b.setAttribute('fill','#e8730c');b.setAttribute('stroke','#a8500a');b.setAttribute('stroke-width','0.7');");
    L.push("      g.appendChild(b);}}else if(b){g.removeChild(b);}}");
    L.push("  function openEditor(id){curId=id;");
    L.push("    var g=document.querySelector('.ea-el[data-id=\"'+id+'\"]');");
    L.push("    var nm=(g&&g.getAttribute('data-name'))||'';");
    L.push("    mtitle.textContent='Примечания: '+nm;");
    L.push("    var note=EA_NOTES[id]||'', prev=EA_COMMENTS[id]||'';");
    L.push("    ta.value = note + (prev? DIV+prev : (note? DIV : ''));");
    L.push("    modal.style.display='block';editScale=Math.min(editScale,maxEdit());applyEdit();");
    L.push("    try{ta.focus();}catch(_e){}}");
    L.push("  function closeEditor(){modal.style.display='none';curId=null;}");
    L.push("  function saveEditor(){if(curId==null)return;var val=ta.value;EA_COMMENTS[curId]=val;");
    L.push("    var g=document.querySelector('.ea-el[data-id=\"'+curId+'\"]');");
    L.push("    if(g){g.setAttribute('data-comment',val);badge(g,nonEmpty(val));}closeEditor();}");
    L.push("  function restore(){var gs=document.querySelectorAll('.ea-el');");
    L.push("    for(var i=0;i<gs.length;i++){var c=gs[i].getAttribute('data-comment');");
    L.push("      if(c!=null&&c!==''){EA_COMMENTS[gs[i].getAttribute('data-id')]=c;badge(gs[i],nonEmpty(c));}}}");
    L.push("  function saveFile(){var ser=new XMLSerializer().serializeToString(document);");
    L.push("    var blob=new Blob([ser],{type:'image/svg+xml'});");
    L.push("    if(window.showSaveFilePicker){window.showSaveFilePicker({suggestedName:'diagram_notes.svg',");
    L.push("      types:[{description:'SVG',accept:{'image/svg+xml':['.svg']}}]}).then(function(hh){return hh.createWritable();})");
    L.push("      .then(function(ww){return ww.write(blob).then(function(){return ww.close();});}).catch(function(){});}");
    L.push("    else{var a=document.createElementNS(XN,'a');a.setAttribute('href',URL.createObjectURL(blob));");
    L.push("      a.setAttribute('download','diagram_notes.svg');svg.appendChild(a);a.click();");
    L.push("      setTimeout(function(){if(a.parentNode)a.parentNode.removeChild(a);},1000);}}");
    L.push("  function onAct(act){");
    L.push("    if(act==='diag+'){diagScale=Math.min(4,diagScale*1.2);applyDiag();}");
    L.push("    else if(act==='diag-'){diagScale=Math.max(0.2,diagScale/1.2);applyDiag();}");
    L.push("    else if(act==='tip+'){tipScale=Math.min(3,tipScale*1.15);setTipV();}");
    L.push("    else if(act==='tip-'){tipScale=Math.max(0.5,tipScale/1.15);setTipV();}");
    L.push("    else if(act==='edit+'){editScale=Math.min(maxEdit(),editScale*1.15);applyEdit();}");
    L.push("    else if(act==='edit-'){editScale=Math.max(0.5,editScale/1.15);applyEdit();}");
    L.push("    else if(act==='save'){saveFile();}");
    L.push("    else if(act==='msave'){saveEditor();}");
    L.push("    else if(act==='mclose'){closeEditor();}}");
    L.push("  var btns=document.querySelectorAll('[data-act]');");
    L.push("  for(var b=0;b<btns.length;b++){(function(bt){bt.addEventListener('click',function(e){");
    L.push("    onAct(bt.getAttribute('data-act'));e.preventDefault();e.stopPropagation();});})(btns[b]);}");
    L.push("  var els=document.querySelectorAll('.ea-el');");
    L.push("  for(var i=0;i<els.length;i++){(function(g){var id=g.getAttribute('data-id');");
    L.push("    var note=EA_NOTES[id];g.style.cursor='pointer';");
    L.push("    if(note){g.addEventListener('mouseover',function(e){show(note);move(e);});");
    L.push("      g.addEventListener('mousemove',move);g.addEventListener('mouseout',hide);}");
    L.push("    g.addEventListener('click',function(e){hide();openEditor(id);e.stopPropagation();});})(els[i]);}");
    L.push("  (function(){var head=document.getElementById('ea-modal-head');if(!head)return;");
    L.push("    var drag=false,sx,sy,ox,oy;");
    L.push("    head.addEventListener('mousedown',function(e){drag=true;sx=e.clientX;sy=e.clientY;");
    L.push("      ox=parseFloat(modal.style.left)||0;oy=parseFloat(modal.style.top)||0;e.preventDefault();});");
    L.push("    document.addEventListener('mousemove',function(e){if(!drag)return;");
    L.push("      modal.style.left=(ox+e.clientX-sx)+'px';modal.style.top=(oy+e.clientY-sy)+'px';});");
    L.push("    document.addEventListener('mouseup',function(){drag=false;});})();");
    L.push("  (function(){var head=document.getElementById('ea-panel-head'),panel=document.getElementById('ea-panel'),grip=document.getElementById('ea-panel-grip');");
    L.push("    if(!panel)return;var pscale=1;");
    L.push("    function fixLT(){if(!panel.style.left){var r=panel.getBoundingClientRect();panel.style.left=r.left+'px';panel.style.top=r.top+'px';panel.style.right='auto';}}");
    L.push("    var pd=false,psx,psy,pox,poy;");
    L.push("    if(head)head.addEventListener('mousedown',function(e){pd=true;fixLT();psx=e.clientX;psy=e.clientY;pox=parseFloat(panel.style.left)||0;poy=parseFloat(panel.style.top)||0;e.preventDefault();e.stopPropagation();});");
    L.push("    var rz=false,rsx,rs0;");
    L.push("    if(grip)grip.addEventListener('mousedown',function(e){rz=true;rsx=e.clientX;rs0=pscale;e.preventDefault();e.stopPropagation();});");
    L.push("    document.addEventListener('mousemove',function(e){");
    L.push("      if(pd){panel.style.left=(pox+e.clientX-psx)+'px';panel.style.top=(poy+e.clientY-psy)+'px';}");
    L.push("      if(rz){pscale=Math.max(0.6,Math.min(2.6,rs0+(e.clientX-rsx)/160));panel.style.transform='scale('+pscale+')';}});");
    L.push("    document.addEventListener('mouseup',function(){pd=false;rz=false;});})();");
    L.push("  window.addEventListener('resize',function(){layout();if(modal.style.display!=='none'){editScale=Math.min(editScale,maxEdit());applyEdit();}});");
    L.push("  applyDiag();restore();");
    L.push("})();");
    L.push(']]></script>');

    L.push('</svg>');

    /* ---- Сохраняем ---- */
    var fso=new ActiveXObject("Scripting.FileSystemObject");
    var sn = myFile.replace(/\.svg$/i,"");   /* базовое имя для fallback-путей */
    var outPath = outDir + "\\" + myFile;
    var svgText = L.join("\n");
    var saved=false;
    try{var ts=fso.CreateTextFile(outPath,true,true);ts.Write(svgText);ts.Close();saved=true;}
    catch(e1){saved=false;}
    if(!saved){
        try{
            if(!fso.FolderExists("C:\\Temp"))fso.CreateFolder("C:\\Temp");
            outPath="C:\\Temp\\"+sn+".svg";
            var ts2=fso.CreateTextFile(outPath,true,true);ts2.Write(svgText);ts2.Close();saved=true;
        }catch(e2){saved=false;}
    }
    if(!saved){
        try{
            var shell=new ActiveXObject("WScript.Shell");
            var desktop=shell.SpecialFolders("Desktop");
            outPath=desktop+"\\"+sn+".svg";
            var ts3=fso.CreateTextFile(outPath,true,true);ts3.Write(svgText);ts3.Close();saved=true;
        }catch(e3){Session.Output("ОШИБКА сохранения: "+e3.message);}
    }
    var fileExists=false;
    try{fileExists=fso.FileExists(outPath);}catch(e){}
    Session.Output("SVG path: "+outPath);
    Session.Output("File exists: "+fileExists);

    /* Возвращаем только имя файла (без пути) — ссылки будут относительными */
    return myFile;
}

/* ================================================================
   main — точка входа
================================================================ */
function main() {
    var diag = Repository.GetCurrentDiagram();
    if(!diag){Session.Prompt("Нет открытой диаграммы!",1);return;}
    var diagID   = diag.DiagramID;
    var diagName = diag.Name;
    Session.Output("=== "+diagName+" (ID="+diagID+") ===");
    Session.Output("ConnectionString: "+Repository.ConnectionString);

    /* Определяем папку для файлов */
    var fso=new ActiveXObject("Scripting.FileSystemObject");
    var outDir="";
    try{
        var connStr=Repository.ConnectionString;
        var dir=fso.GetParentFolderName(connStr);
        if(dir&&fso.FolderExists(dir)) outDir=dir;
        Session.Output("ModelDir: "+outDir);
    }catch(e){outDir="";}
    if(!outDir){
        outDir="C:\\Temp";
        if(!fso.FolderExists(outDir))fso.CreateFolder(outDir);
    }

    /* Генерируем SVG (рекурсивно по всему дереву детализации) */
    VISITED = {};
    var mainFile = generateSVG(diagID, diagName, outDir, 0);
    var mainPath = outDir+"\\"+mainFile;
    var nDiag=0; for(var _k in VISITED){ if(VISITED.hasOwnProperty(_k)) nDiag++; }
    Session.Output("=== Экспортировано диаграмм дерева: "+nDiag+" ===");

    var fileExists=false;
    try{fileExists=fso.FileExists(mainPath);}catch(e){}
    if(fileExists){
        try{
            var sh=new ActiveXObject("WScript.Shell");
            sh.Run('cmd /c start "" "'+mainPath+'"',0,false);
        }catch(e){Session.Output("Ошибка открытия: "+e.message);}
        Session.Prompt("Готово!\nДиаграмм в дереве: "+nDiag+"\nСтартовый SVG:\n"+mainPath,1);
    } else {
        Session.Output("ОШИБКА: файл не найден!");
        Session.Prompt("ОШИБКА: файл не сохранился!\nПроверь Session Output.",1);
    }
}

function queryRows(sql){
    var doc=new ActiveXObject("MSXML2.DOMDocument.6.0");
    doc.async=false; doc.loadXML(Repository.SQLQuery(sql));
    var nl=doc.selectNodes("//Row"),arr=[];
    for(var i=0;i<nl.length;i++) arr.push(nl[i]);
    return arr;
}
function cv(row,tag){var n=row.selectSingleNode(tag);return n?n.text:"";}
function pf(s){var v=parseFloat(s);return isNaN(v)?0:v;}
function gvf(g,k,d){
    if(!g)return d;
    var m=(new RegExp(k+"=([^;]+)")).exec(g);
    if(!m)return d; var v=parseFloat(m[1]); return isNaN(v)?d:v;
}
function gvi(g,k,d){
    if(!g)return d;
    var m=(new RegExp(k+"=([^;]+)")).exec(g);
    if(!m)return d; var v=parseInt(m[1],10); return isNaN(v)?d:v;
}
function rd(v){return Math.round(v*10)/10;}
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
/* JS-string escape for embedding Notes text into the EA_NOTES map.
   Strips CR, escapes backslash/quote, encodes newlines and angle brackets. */
function jsEsc(s){
    return (""+s).replace(/\\/g,"\\\\").replace(/"/g,'\\"')
                 .replace(/\r\n/g,"\\n").replace(/\r/g,"\\n").replace(/\n/g,"\\n")
                 .replace(/\t/g," ")
                 .replace(/</g,"\\u003c").replace(/>/g,"\\u003e");
}

/* Разбить текст на строки по ширине (примерно 6px на символ при 10px шрифте) */
function wrapText(text, maxW, fontSize) {
    var charW   = fontSize * 0.50; /* Calibri avg char width ≈ 50% of fontSize */
    var maxChars= Math.max(8, Math.floor(maxW / charW));
    var words   = text.split(/\s+/);
    var lines   = [], cur = "";
    for (var i=0; i<words.length; i++) {
        var w = words[i];
        if (!cur) { cur = w; continue; }
        if ((cur+" "+w).length <= maxChars) { cur += " "+w; }
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length===0) lines.push("");
    return lines;
}


main();
