import type {ResolvedFace} from './face';

/** Canvas coordinates are internal to the SDK. No fonts, images or asynchronous assets. */
export function paintFace(ctx:CanvasRenderingContext2D,state:ResolvedFace,size:number,blend?:CanvasRenderingContext2D):void {
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,size,size);
  if(state.transition){
    if(!blend)throw new Error('Expression blending requires its owned scratch canvas');
    paintSingle(ctx,state,size,1);ctx.save();ctx.globalCompositeOperation='destination-in';ctx.globalAlpha=state.transition.weight;ctx.fillRect(0,0,size,size);ctx.restore();
    blend.setTransform(1,0,0,1,0,0);blend.clearRect(0,0,size,size);paintSingle(blend,state.transition.from,size,1);
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-state.transition.weight;ctx.drawImage(blend.canvas,0,0);ctx.restore();
  }
  else paintSingle(ctx,state,size,1);
}
function paintSingle(ctx:CanvasRenderingContext2D,state:ResolvedFace,size:number,alpha:number):void {
  ctx.save();ctx.globalAlpha=alpha;ctx.scale(size/256,size/256);
  ctx.lineCap='round';ctx.lineJoin='round';
  const isHighlight=state.style==='highlight';
  ctx.strokeStyle=isHighlight?'#ffffff':'#17121b';ctx.lineWidth=4.5;
  const a=state.intensity,e=a===0?'neutral':state.expression,blink=state.blink;
  const ellipse=(x:number,y:number,rx:number,ry:number,fill:string,stroke=true)=>{ctx.beginPath();ctx.ellipse(x,y,rx,Math.max(.01,ry),0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke)ctx.stroke();};
  if(state.blush>0){ctx.globalAlpha=alpha*state.blush*.65;ellipse(66,143,19,9,'#ef8e91',false);ellipse(190,143,19,9,'#ef8e91',false);ctx.globalAlpha=alpha;}
  // Eyes retain expressive proportions underneath an independently resolved blink.
  const open=e==='surprised'?1+.22*a:e==='happy'?1-.24*a:e==='angry'?1-.32*a:e==='sad'?1-.15*a:1;
  for(const sign of [-1,1]) {
    const x=128+sign*39,y=103,rx=isHighlight?19:25,ry=(isHighlight?27:28)*open*(1-blink);
    if(ry<2.8){ctx.beginPath();ctx.moveTo(x-20,y);ctx.quadraticCurveTo(x,y+5,x+20,y);ctx.stroke();}
    else if(isHighlight){
      if(e==='happy'){
        ctx.lineWidth=5.5;ctx.beginPath();ctx.arc(x,y+4,16,Math.PI*1.15,Math.PI*1.85);ctx.stroke();ctx.lineWidth=4.5;
      }else if(e==='angry'||e==='sad'){
        const tilt=(e==='angry'?7:-5)*a,top=y-ry*(e==='angry'?.55:.8);
        ctx.beginPath();ctx.moveTo(x-rx,top+sign*tilt);ctx.lineTo(x+rx,top-sign*tilt);
        ctx.bezierCurveTo(x+rx+3,y+ry,x-rx-3,y+ry,x-rx,top+sign*tilt);ctx.closePath();
        ctx.fillStyle='#ffffff';ctx.fill();
      }else{
        ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
      }
    }else {
      const eyePath=()=>{
        ctx.beginPath();
        if(e==='angry'||e==='sad'){
          const tilt=(e==='angry'?7:-5)*a,top=y-ry*(e==='angry'?.55:.8);
          ctx.moveTo(x-rx,top+sign*tilt);ctx.lineTo(x+rx,top-sign*tilt);
          ctx.bezierCurveTo(x+rx+3,y+ry,x-rx-3,y+ry,x-rx,top+sign*tilt);ctx.closePath();
        }else ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
      };
      eyePath();ctx.fillStyle='#fffdf4';ctx.fill();ctx.stroke();
      ctx.save();eyePath();ctx.clip();
      ellipse(x+state.pupil[0]*10,y-state.pupil[1]*Math.min(9,ry*.3),8.2,Math.min(12,ry*.61),'#17121b',false);
      if(ry>12)ellipse(x+state.pupil[0]*10-2,y-state.pupil[1]*Math.min(9,ry*.3)-4,2.6,2.6,'#ffffff',false);
      ctx.restore();
    }
    // Endpoints are mirrored; worried/sad inner brows rise, angry inner brows fall.
    const inner=(e==='worried'? -14:e==='sad'?-11:e==='angry'?14:e==='explaining'?(sign<0?-10:0):0)*a;
    const lift=(e==='surprised'?-9:e==='happy'?-4:0)*a;
    ctx.lineWidth=isHighlight?5.5:6;ctx.beginPath();ctx.moveTo(x-sign*22,61+inner+lift);
    if(e==='angry')ctx.lineTo(x+sign*22,61-inner*.5+lift);
    else ctx.quadraticCurveTo(x,53+lift,x+sign*22,61-inner*.25+lift);
    ctx.stroke();ctx.lineWidth=4.5;
  }
  let mouth=state.mouth;
  if(mouth==='auto')mouth=e==='happy'?'smile':e==='surprised'?'o':e==='sad'||e==='worried'?'frown':e==='explaining'?'open':'closed';
  if(isHighlight&&mouth==='closed'){}
  else if(isHighlight){
    ctx.strokeStyle='#ffffff';ctx.lineWidth=4;ctx.beginPath();
    if(mouth==='o'||e==='surprised')ctx.ellipse(128,172,8,11,0,0,Math.PI*2);
    else if(mouth==='smile'||e==='happy'){ctx.moveTo(104,168);ctx.quadraticCurveTo(128,185,152,168);}
    else if(mouth==='open'||e==='explaining'){
      ctx.moveTo(108,168);ctx.quadraticCurveTo(128,162,148,168);ctx.quadraticCurveTo(145,188,128,186);ctx.quadraticCurveTo(111,188,108,168);
    }else if(mouth==='frown'||e==='sad'||e==='worried'){
      if(e==='worried'){ctx.moveTo(106,177);ctx.quadraticCurveTo(117,169,128,175);ctx.quadraticCurveTo(139,169,150,177);}
      else{ctx.moveTo(108,180);ctx.quadraticCurveTo(128,166,148,180);}
    }else{ctx.moveTo(112,176);ctx.quadraticCurveTo(128,179,144,176);}
    ctx.stroke();
  }else if(mouth==='smile') {
    ctx.beginPath();ctx.moveTo(91,163);ctx.quadraticCurveTo(128,178,165,163);ctx.quadraticCurveTo(154,204,128,200);ctx.quadraticCurveTo(101,200,91,163);
    ctx.fillStyle='#40232d';ctx.fill();ctx.stroke();ctx.save();ctx.clip();ctx.fillStyle='#fffdf4';ctx.fillRect(91,160,74,16);ellipse(128,202,22,10,'#ef8c96',false);ctx.restore();
  }else if(mouth==='o')ellipse(128,179,15,22,'#40232d');
  else if(mouth==='open') {
    ctx.beginPath();ctx.moveTo(100,167);ctx.quadraticCurveTo(126,160,157,169);ctx.quadraticCurveTo(153,196,127,193);ctx.quadraticCurveTo(105,192,100,167);
    ctx.fillStyle='#40232d';ctx.fill();ctx.stroke();ctx.save();ctx.clip();ctx.fillStyle='#fffdf4';ctx.fillRect(102,160,55,13);ellipse(130,195,18,8,'#ef8c96',false);ctx.restore();
  }else {
    ctx.beginPath();if(mouth==='frown'){
      if(e==='worried'){ctx.moveTo(105,184);ctx.quadraticCurveTo(115,174,128,182);ctx.quadraticCurveTo(140,174,151,184);}
      else {ctx.moveTo(107,185);ctx.quadraticCurveTo(128,164,149,185);}}
    else if(e==='angry'){ctx.moveTo(106,181);ctx.lineTo(150,177);}
    else {ctx.moveTo(110,176);ctx.quadraticCurveTo(128,180,146,176);}ctx.stroke();
  }
  ctx.restore();
}
