import type {ResolvedAppearance} from './appearance';
export type FabricRole='torso'|'upperSleeve'|'lowerSleeve'|'thigh'|'shin'|'shoe'|'hair';
export function sleeveColor(color:string):string {return '#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*.86).toString(16).padStart(2,'0')).join('');}
/** Static sRGB maps on the existing solids; no overlay lapel, pocket or button planes. */
export function paintAppearance(ctx:CanvasRenderingContext2D,a:ResolvedAppearance,role:FabricRole):void {
  const {clothing:c}=a;ctx.fillStyle=role==='hair'?a.hair.color:role==='shoe'?a.shoes.color:role==='thigh'||role==='shin'?a.trousers.color:role==='upperSleeve'||role==='lowerSleeve'?sleeveColor(c.color):c.color;ctx.fillRect(0,0,256,256);
  const line=(points:number[][],color='#333342',width=3)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  const poly=(points:number[][],color:string)=>{ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
  if(role==='hair'){
    const highlight='#'+[1,3,5].map(i=>Math.round(parseInt(a.hair.color.slice(i,i+2),16)*.82+255*.18).toString(16).padStart(2,'0')).join('');
    if(a.hair.style==='swept')line([[20,205],[27,170],[31,132],[34,95]],highlight,1.8);
    if(a.hair.style==='beanie'){
      const shadow='#'+[1,3,5].map(i=>Math.round(parseInt(a.hair.color.slice(i,i+2),16)*.72).toString(16).padStart(2,'0')).join('');
      for(let x=0;x<256;x+=12){
        line([[x,0],[x,256]],shadow,2);
        line([[x+3,0],[x+3,256]],highlight,1.5);
      }
      line([[0,190],[256,190]],shadow,3);
      line([[0,192],[256,192]],highlight,2);
    }
    return;
  }
  if(role==='upperSleeve'){
    if(c.sleeves==='none'){ctx.fillStyle='#16131a';ctx.fillRect(0,0,256,256);}
    if(c.sleeves==='short'){ctx.fillStyle='#16131a';ctx.fillRect(0,112,256,144);}
    return;
  }
  if(role==='lowerSleeve'){
    if(c.sleeves!=='long'){ctx.fillStyle='#16131a';ctx.fillRect(0,0,256,256);}else{ctx.fillStyle=c.accent;ctx.fillRect(0,232,256,8);}return;
  }
  if(role==='shin'&&a.trousers.style==='shorts'){ctx.fillStyle='#16131a';ctx.fillRect(0,0,256,256);return;}
  if(role==='thigh'){
    if(a.trousers.style==='shorts'&&a.skin==='#171717'){
      ctx.fillStyle='#ffffff';
      for(const x of [56,66,184,194])ctx.fillRect(x,0,4,256);
    }
    return;
  }
  if(role==='shoe'){
    if(a.shoes.style==='sneakers'){
      ctx.fillStyle='#ede7da';ctx.fillRect(0,204,256,52);line([[0,204],[256,204]],'#554e50',3);
      for(let i=0;i<3;i++)line([[51,100+i*13],[77,106+i*13]],'#fff8e8',4);
    }return;
  }
  // Capsule front is u=.25 in the installed Three r187 geometry; back u=.75.
  if(c.style==='shirt') {line([[44,24],[51,42],[64,48],[77,42],[84,24]],c.accent,5);}
  if(c.style==='hoodie'){
    line([[43,24],[54,45],[64,49],[74,45],[85,24]],c.accent,4);
    line([[53,41],[52,100]],c.accent,3);line([[75,41],[76,95]],c.accent,3);
    line([[39,146],[31,168],[37,185],[91,185],[97,168],[89,146]],c.accent,2.5);
  }
  if(c.style==='lab-coat'||c.style==='jacket'){
    const edge=c.style==='lab-coat'?'#a1a0a0':'#7182a2';
    poly([[43,18],[64,38],[85,18],[64,112]],c.accent);
    poly([[41,20],[52,42],[46,70],[64,112],[34,66]],c.color);poly([[87,20],[76,42],[82,70],[64,112],[94,66]],c.color);
    line([[41,20],[52,42],[46,70],[64,112]],edge,1.8);line([[87,20],[76,42],[82,70],[64,112]],edge,1.8);
    line([[64,113],[64,220]],edge,1.5);
    ctx.fillStyle='#6b6570';for(const y of [132,159,186]){ctx.beginPath();ctx.arc(68,y,2.2,0,Math.PI*2);ctx.fill();}
    line([[31,147],[49,147],[49,174],[31,174]],edge,1.8);line([[79,147],[97,147],[97,174],[79,174]],edge,1.8);
  }
  if(a.accessories.includes('stethoscope')){
    line([[48,30],[42,67],[47,104],[62,112],[79,104],[85,67],[80,30]],'#28343e',3.5);
    line([[62,112],[62,135],[75,143]],'#28343e',3);ctx.fillStyle='#a7c3c4';ctx.beginPath();ctx.arc(76,144,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(a.accessories.includes('badge')){
    ctx.fillStyle='#d5b15c';ctx.fillRect(31,89,18,5);ctx.fillStyle='#fbf5dc';ctx.fillRect(30,94,20,22);
    ctx.fillStyle='#479ab0';ctx.fillRect(33,98,6,8);line([[41,100],[47,100]],'#777180',1);line([[33,111],[47,111]],'#777180',1);
  }
}
