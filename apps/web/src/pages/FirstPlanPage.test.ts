// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {FirstPlanPage} from './FirstPlanPage';
const api=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../lib/app-api',()=>({callAppApi:api.call,AppApiError:class extends Error{constructor(public code:string,message:string){super(message);}}}));
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({user:{id:'user'}})}));
vi.mock('../lib/supabase',()=>({supabase:{}}));
const ready={contractVersion:'initial-manual-plan-v1',capabilityVersion:1,profileId:'profile',weekStartDate:'2026-10-05',currentWeek:'2026-10-05',nextWeek:'2026-10-12',today:'2026-10-11',configurationRevision:'revision',mode:'daily_minutes',ready:true,reasons:[],resources:[{id:'resource',subjectId:'math',name:'My book',subjectName:'Matematik',workModes:['book','questions']}],subjectsWithoutSources:[{name:'Türkçe',subjectId:'turkish'}],days:{'2026-10-11':60},weeklyBudgetMinutes:60,existingPlan:null};
let container:HTMLDivElement,root:Root;
const button=(s:string)=>[...container.querySelectorAll('button')].find(e=>e.textContent===s)!;
async function click(s:string){await act(async()=>button(s).click());}
async function change(selector:string,value:string){await act(async()=>{const e=container.querySelector(selector)!;const prototype=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function mount(){await act(async()=>root.render(createElement(MemoryRouter,{initialEntries:['/first-plan?profileId=profile']},createElement(FirstPlanPage))));}
async function add(){
 // Labels, rather than DOM order, identify the three human choices.
 const select=async(label:string,value:string)=>{const e=[...container.querySelectorAll('label')].find(l=>l.textContent?.startsWith(label))!.querySelector('select')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(e,value);e.dispatchEvent(new Event('change',{bubbles:true}));});};
 await select('Hangi gün?','2026-10-11');await select('Hangi kaynakla?','resource');await select('Ne çalışacaksın?','book');await change('input[type=number]','30');await act(async()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
}
const posts=()=>api.call.mock.calls.filter(([,o])=>o?.method==='POST');
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');document.body.append(container);root=createRoot(container);api.call.mockReset();
 api.call.mockImplementation(async(path:string,o?:{body:any})=>{
  if(path.startsWith('/initial-plan/readiness'))return ready;
  if(path==='/initial-plan/preview')return {...ready,valid:true,blocks:o!.body.blocks,dayTotals:{'2026-10-11':30},totalMinutes:30,reviewedPayloadHash:'hash',errors:[]};
  throw Error('unhandled');
 });
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe('first manual plan review and ambiguous commit recovery',()=>{
 it('starts with no authored block, source/mode/day/minutes unset; source-less selected subject remains visible',async()=>{await mount();expect(container.querySelector('input[type=number]')?.getAttribute('value')).toBe('');expect(button('Planı incele').disabled).toBe(true);expect(container.textContent).toContain('Türkçe');expect(posts()).toHaveLength(0);});
 it('review cancellation preserves human block and never sends create',async()=>{await mount();await add();await click('Planı incele');expect(container.textContent).toContain('Seçtiğin çalışmalar sunucuda doğrulandı.');await click('Düzenlemeye dön');expect(container.textContent).toContain('30 dk');expect(posts().map(x=>x[0])).toEqual(['/initial-plan/preview']);expect(button('Planı incele').disabled).toBe(false);});
 it('stale commit retains authored blocks and requires another explicit review',async()=>{const {AppApiError}=await import('../lib/app-api');const normal=api.call.getMockImplementation()!;api.call.mockImplementation(async(p:string,o:any)=>{if(p==='/initial-plan/create')throw new AppApiError('FIRST_PLAN_STALE','');return normal(p,o);});await mount();await add();await click('Planı incele');await click('Planı oluştur');expect(container.textContent).toContain('yeniden incele');expect(container.textContent).toContain('30 dk');expect(button('Planı incele').disabled).toBe(false);expect(button('Planı oluştur')).toBeUndefined();});
 it('transport ambiguity locks editing and unknown receipt retries the exact same operation payload',async()=>{const normal=api.call.getMockImplementation()!;api.call.mockImplementation(async(p:string,o:any)=>{if(p==='/initial-plan/create')throw Error('lost socket');if(p.startsWith('/initial-plan/operation'))return {outcome:'unknown',result:null};return normal(p,o);});await mount();await add();await click('Planı incele');await click('Planı oluştur');expect(container.textContent).toContain('henüz kesinleşmedi');expect(button('Sonucu kontrol et')).toBeTruthy();expect(container.querySelector('form')).toBeNull();await click('Sonucu kontrol et');const creates=posts().filter(x=>x[0]==='/initial-plan/create');expect(creates).toHaveLength(2);expect(creates[1]![1].body).toEqual(creates[0]![1].body);});
 it('capability mismatch exposes recovery and never falls back to a legacy writer',async()=>{api.call.mockResolvedValue({...ready,capabilityVersion:2});await mount();expect(container.textContent).toContain('şu anda kullanılamıyor');expect(button('Planı incele')).toBeUndefined();expect(posts()).toHaveLength(0);});
 it('auth expiration keeps the reviewed blocks and operation for recovery in the open editor',async()=>{const {AppApiError}=await import('../lib/app-api');const normal=api.call.getMockImplementation()!;api.call.mockImplementation(async(p:string,o:any)=>{if(p==='/initial-plan/create')throw new AppApiError('UNAUTHORIZED','');return normal(p,o);});await mount();await add();await click('Planı incele');await click('Planı oluştur');expect(container.textContent).toContain('Oturumun sona erdi');expect(container.textContent).toContain('30 dk');expect(button('Sonucu kontrol et')).toBeTruthy();expect(container.querySelector('a[target=_blank]')?.getAttribute('href')).toBe('/login');});
 it('server field errors keep selected blocks, disable create and offer editing',async()=>{const normal=api.call.getMockImplementation()!;api.call.mockImplementation(async(p:string,o:any)=>{const r=await normal(p,o);return p==='/initial-plan/preview'?{...r,valid:false,errors:[{block:0,field:'estimatedMinutes',code:'OVER_DAY_CAPACITY'}]}:r;});await mount();await add();await click('Planı incele');expect(container.textContent).toContain('kullanılabilir zamanı aşıyor');expect(button('Planı oluştur').disabled).toBe(true);await click('Düzenlemeye dön');expect(container.textContent).toContain('30 dk');});
});
