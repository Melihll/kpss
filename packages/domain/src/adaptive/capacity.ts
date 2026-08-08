import { calculateDayAvailableMinutes } from "../capacity";
import type { EffectiveCapacityContext } from "./types";

const dateOk=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
const minute=(value:string)=>{const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);if(!match)throw new Error("INVALID_TIME");return Number(match[1])*60+Number(match[2]);};
export function isoWeekday(date:string){if(!dateOk(date))throw new Error("INVALID_DATE");const day=new Date(`${date}T12:00:00Z`).getUTCDay();return day===0?7:day;}
function merged(intervals:Array<[number,number]>) {const sorted=intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const out:Array<[number,number]>=[];for(const item of sorted){const last=out.at(-1);if(last&&item[0]<=last[1])last[1]=Math.max(last[1],item[1]);else out.push([...item]);}return out;}
export function calculateEffectiveDayCapacity(context:EffectiveCapacityContext){
 const weekday=isoWeekday(context.date);const base=calculateDayAvailableMinutes(context.weeklyAvailability,weekday);
 const baseIntervals=merged(context.weeklyAvailability.filter(w=>w.is_active!==false&&w.weekday===weekday).map(w=>[minute(w.start_time),minute(w.end_time)] as [number,number]));
 const unavailable=merged(context.scheduleExceptions.filter(e=>e.date===context.date&&e.type==="unavailable"&&e.startTime&&e.endTime).map(e=>[minute(e.startTime!),minute(e.endTime!)] as [number,number]));
 let removed=0;for(const [start,end] of baseIntervals)for(const [uStart,uEnd] of unavailable)removed+=Math.max(0,Math.min(end,uEnd)-Math.max(start,uStart));
 const activeMultipliers=context.calendarPeriods.filter(p=>p.startDate<=context.date&&p.endDate>=context.date&&p.capacityMultiplier!=null).map(p=>p.capacityMultiplier!);const multiplier=activeMultipliers.length?Math.min(...activeMultipliers):1;
 const delta=context.scheduleExceptions.filter(e=>e.date===context.date&&((e.type==="extra_available"||e.type==="custom")&&e.minutesDelta!=null||e.type==="unavailable"&&e.minutesDelta!=null)).reduce((sum,e)=>sum+(e.minutesDelta??0),0);
 return Math.max(0,Math.round((base-removed)*Math.max(0,multiplier)+delta));
}
export function addCalendarDays(date:string,days:number){if(!dateOk(date))throw new Error("INVALID_DATE");const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function calculateEffectiveWeekCapacity(input:Omit<EffectiveCapacityContext,"date">&{weekStart:string}){return Array.from({length:7},(_,i)=>calculateEffectiveDayCapacity({...input,date:addCalendarDays(input.weekStart,i)})).reduce((a,b)=>a+b,0);}
