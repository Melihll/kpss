import {describe,expect,it,vi} from 'vitest';
import {weeklyStudyViewRoute} from '../supabase/functions/_shared/weekly-study-view';
const profile='12345678-1234-1234-1234-123456789abc',week='2026-10-12';
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
const read=(client:any,url='',method='GET')=>weeklyStudyViewRoute(new Request('http://127.0.0.1/week/view'+url,{method}),'/week/view',client,profile,week,json);
describe('weekly view narrow GET boundary',()=>{
 it('dispatches exactly the read RPC with server profile and week',async()=>{const rpc=vi.fn().mockResolvedValue({data:{contractVersion:'weekly-study-view-v1',profileId:profile,weekStart:week},error:null});expect((await read({rpc}))?.status).toBe(200);expect(rpc).toHaveBeenCalledExactlyOnceWith('weekly_study_view',{p_exam_profile_id:profile,p_week_start:week});});
 it.each(['PGRST202','42883','42P01'])('missing capability %s never falls back to any writer',async code=>{const rpc=vi.fn().mockResolvedValue({error:{code,message:'missing'}});expect((await read({rpc}))?.status).toBe(503);expect(rpc).toHaveBeenCalledTimes(1);});
 it.each(['?weekStart=2026-02-30','?weekStart=2026-10-11','?budget=9000','?weekStart=bad'])('invalid or authority input %s makes zero DB calls',async url=>{const rpc=vi.fn();expect((await read({rpc},url))?.status).toBe(422);expect(rpc).not.toHaveBeenCalled();});
 it('foreign profile and POST rejected before RPC',async()=>{const rpc=vi.fn();expect((await read({rpc},'?profileId=foreign'))?.status).toBe(404);expect((await read({rpc},'','POST'))?.status).toBe(405);expect(rpc).not.toHaveBeenCalled();});
 it('mismatched response profile or week cannot display another snapshot',async()=>{for(const delta of [{profileId:'foreign'},{weekStart:'2026-10-05'},{contractVersion:'old'}]){const rpc=vi.fn().mockResolvedValue({data:{contractVersion:'weekly-study-view-v1',profileId:profile,weekStart:week,...delta}});expect((await read({rpc}))?.status).toBe(503);}});
});
