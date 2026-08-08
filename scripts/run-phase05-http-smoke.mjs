import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const EDITION="11000000-0000-0000-0000-000000000001",MATH="20000000-0000-0000-0000-000000000002",TOPIC="30000000-0000-0000-0000-000000000001";
const {url,anonKey}=readLocalSupabaseStatus();
async function user(label){const api=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const id=randomUUID();const signup=await api.auth.signUp({email:`p5-http-${label}-${id}@example.test`,password:`Safe-${id}`});if(signup.error)throw signup.error;const profile=await api.from("exam_profiles").insert({user_id:signup.data.user.id,exam_edition_id:EDITION,preparation_start_date:"2026-08-01",status:"active"}).select("id").single();if(profile.error)throw profile.error;await api.from("user_subjects").insert({user_id:signup.data.user.id,exam_profile_id:profile.data.id,subject_id:MATH,status:"active"});const initialized=await api.rpc("initialize_subject_progress",{p_exam_profile_id:profile.data.id,p_subject_id:MATH});if(initialized.error)throw initialized.error;return{api,profileId:profile.data.id,token:signup.data.session.access_token};}
const a=await user("a"),b=await user("b"),base=`${url}/functions/v1/app-api`;
async function http(actor,path,{method="GET",body}={}){const response=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${actor.token}`,apikey:anonKey,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json();return{response,payload};}
function ok(result,status=200){if(result.response.status!==status)throw new Error(`Expected ${status}, got ${result.response.status}: ${JSON.stringify(result.payload)}`);return result.payload;}
const resultBody=(correct,wrong,key)=>({subjectId:MATH,curriculumNodeId:TOPIC,correct,wrong,blank:0,total:correct+wrong,idempotencyKey:key});
const first=ok(await http(a,"/test-results",{method:"POST",body:resultBody(10,0,`p5-a-${randomUUID()}`)}),201);
if(first.mastery?.assessment?.resulting_mastery_level!=="unknown"||first.masteryPending)throw new Error("minimum evidence orchestration failed");
const second=ok(await http(a,"/test-results",{method:"POST",body:resultBody(8,2,`p5-b-${randomUUID()}`)}),201);
if(second.mastery?.assessment?.resulting_mastery_level!=="strong"||!second.mastery?.revision)throw new Error(`mastery chain failed: ${JSON.stringify(second)}`);
const performance=ok(await http(a,`/topics/${TOPIC}/performance`));
if(performance.topicProgress.mastery_level!=="strong"||performance.assessments.length!==2)throw new Error("topic performance failed");
const revisionId=second.mastery.revision.id;
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date());
const dueFixture=await a.api.rpc("apply_topic_mastery_assessment",{p_payload:{examProfileId:a.profileId,curriculumNodeId:TOPIC,triggerType:"manual_recalculation",sourceTestResultId:null,sourceResultUpdatedAt:null,sampleQuestionCount:20,sampleCorrectCount:18,sampleWrongCount:2,sampleBlankCount:0,previousMasteryLevel:"strong",resultingMasteryLevel:"strong",resultingTopicState:"learned",assessmentReason:"CONSISTENT_STRONG_RESULTS",revision:{shouldSchedule:true,scheduledFor:today,revisionType:"wrong_review",estimatedMinutes:20,reason:"HTTP_DUE_FIXTURE"}}});
if(dueFixture.error)throw dueFixture.error;
const due=ok(await http(a,"/revisions/due"));if(due.length!==1||due[0].urgency!=="due")throw new Error("due revision query failed");
const foreign=await http(b,`/revisions/${revisionId}/complete`,{method:"POST"});if(foreign.response.status!==404||foreign.payload.error?.code!=="REVISION_NOT_FOUND")throw new Error("cross-user completion was not isolated");
const completed=ok(await http(a,`/revisions/${revisionId}/complete`,{method:"POST"}));if(completed.status!=="completed")throw new Error("revision completion failed");
const corrected=ok(await http(a,`/test-results/${first.id}`,{method:"PATCH",body:{correct:0,wrong:10,blank:0,total:10}}));if(corrected.mastery?.assessment?.resulting_mastery_level!=="sufficient")throw new Error("correction mastery hysteresis failed");
const active=ok(await http(a,"/revisions"));if(active.length!==1)throw new Error("correction did not create exactly one next active revision");
await http(a,"/test-results",{method:"POST",body:resultBody(7,3,`p5-c-${randomUUID()}`)});
await http(a,"/test-results",{method:"POST",body:resultBody(7,3,`p5-d-${randomUUID()}`)});
const oldCorrection=ok(await http(a,`/test-results/${first.id}`,{method:"PATCH",body:{correct:1,wrong:9,blank:0,total:10}}));
if(oldCorrection.masteryPending||!oldCorrection.mastery?.assessment)throw new Error("old result correction was not recalculated from the recent window");
console.log(JSON.stringify({PHASE05_HTTP_SMOKE:"PASS",minimumEvidence:"unknown",mastery:"strong",topicState:performance.topicProgress.state,revisionCreated:true,dueQuery:true,completion:"completed",crossUserIsolation:true,correctedMastery:"sufficient",oldResultCorrectionRecalculated:true,activeRevisionCount:active.length},null,2));
