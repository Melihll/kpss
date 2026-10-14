// @vitest-environment jsdom
import {act,createElement} from 'react';import {createRoot} from 'react-dom/client';import {afterEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),session:vi.fn(),changed:vi.fn()}));
vi.mock('../lib/app-api',()=>({callAppApi:mocks.api,AppApiError:class extends Error{constructor(public code:string,m:string){super(m);}}}));
vi.mock('../lib/supabase',()=>({supabase:{auth:{getSession:mocks.session,onAuthStateChange:(cb:any)=>{mocks.changed.mockImplementation(cb);return {data:{subscription:{unsubscribe:vi.fn()}}};}}}}));
import {useWeeklyStudyView} from './useWeeklyStudyView';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const roots:any[]=[];function Component({week}:{week:string}){const s=useWeeklyStudyView(week);return createElement('output',null,s.data?.weekStart??s.error??'loading');}
afterEach(async()=>{for(const r of roots.splice(0))await act(()=>r.unmount());vi.clearAllMocks();});
describe('weekly hook authority and stale response safety',()=>{
 it('late old week cannot replace a newer selection',async()=>{mocks.session.mockResolvedValue({data:{session:{user:{id:'owner'}}}});const pending:any[]=[];mocks.api.mockImplementation(()=>new Promise(r=>pending.push(r)));const el=document.createElement('div'),root=createRoot(el);roots.push(root);await act(()=>root.render(createElement(Component,{week:'2026-10-05'})));await act(()=>root.render(createElement(Component,{week:'2026-10-12'})));await act(()=>pending[1]({contractVersion:'weekly-study-view-v1',weekStart:'2026-10-12'}));expect(el.textContent).toBe('2026-10-12');await act(()=>pending[0]({contractVersion:'weekly-study-view-v1',weekStart:'2026-10-05'}));expect(el.textContent).toBe('2026-10-12');});
 it('a user switch while a GET is pending never displays previous owner data',async()=>{let user='owner';mocks.session.mockImplementation(async()=>({data:{session:{user:{id:user}}}}));let done:any;mocks.api.mockImplementation(()=>new Promise(r=>done=r));const el=document.createElement('div'),root=createRoot(el);roots.push(root);await act(()=>root.render(createElement(Component,{week:'2026-10-05'})));user='new-owner';await act(()=>done({contractVersion:'weekly-study-view-v1',weekStart:'2026-10-05'}));expect(el.textContent).not.toBe('2026-10-05');expect(mocks.api.mock.calls[0]![1]).toEqual({method:'GET',expectedUserId:'owner'});});
});
