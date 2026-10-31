import type {CastCode,CastDiagnostic} from './cast-types';
function detailText(value:unknown):string {
  if(value===undefined)return '';
  try{return ' '+(typeof value==='string'?value:JSON.stringify(value)).slice(0,2000);}
  catch{return ' [diagnostic details could not be serialized]';}
}
export class CastEvaluationError extends Error {
  constructor(readonly diagnostics:readonly CastDiagnostic[]) {
    super(diagnostics.map(d=>`${d.actor?d.actor+': ':''}${d.code}: ${d.message}${detailText(d.details)}`).join('\n'));
    this.name='CastEvaluationError';
  }
}
export function castFail(code:CastCode,message:string,actor?:string,details?:unknown):never {
  throw new CastEvaluationError([{code,severity:'error',message,...(actor?{actor}:{}),...(details===undefined?{}:{details})}]);
}
