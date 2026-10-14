import {describe,expect,it,vi} from 'vitest';
import {initialManualPlanRoute} from '../supabase/functions/_shared/initial-manual-plan';
const profile='12345678-1234-1234-1234-123456789abc';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
describe('initial plan fail-closed mixed backend capability',()=>{
 it.each(['PGRST202','42883','42P01'])('missing SQL capability %s returns unavailable with no legacy RPC fallback',async code=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code,message:'missing capability'}});
  const result=await initialManualPlanRoute(new Request(`http://127.0.0.1/initial-plan/readiness?profileId=${profile}&weekStartDate=2026-10-12`),'/initial-plan/readiness',{rpc} as any,json);
  expect(result?.status).toBe(503);expect((await result!.json()).error.code).toBe('INITIAL_PLAN_UNAVAILABLE');expect(rpc.mock.calls.map(c=>c[0])).toEqual(['initial_manual_plan_readiness']);
 });
 it('wrong response version cannot acknowledge creation success',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{contractVersion:'legacy',weeklyPlanId:'wrong'},error:null});
  const result=await initialManualPlanRoute(new Request('http://127.0.0.1/initial-plan/create',{method:'POST',body:JSON.stringify({profileId:profile})}),'/initial-plan/create',{rpc} as any,json);
  expect(result?.status).toBe(503);expect((await result!.json()).error.code).toBe('INITIAL_PLAN_UNAVAILABLE');expect(rpc).toHaveBeenCalledTimes(1);
 });
});
