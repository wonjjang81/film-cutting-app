import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({data:new Map<string,string>(),fail:false}));
vi.mock('react-native',()=>({Platform:{OS:'web'}}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:vi.fn(),setItem:vi.fn()}}));
import { loadInputDraft, saveInputDraft, startInputBackup } from './inputDraftStorage';
import { inputDraftKey, type InputDraftBackup } from './inputDraftBackup';
const form={brand:'test',productNumber:'keep',rollWidth:'1220',pieceWidth:'',pieceLength:'',quantity:'1',gap:'0',sideMargin:'5',startEndMargin:'5',allowRotation:true};
const draft:InputDraftBackup={version:1,ownerId:'a',projectId:null,projectName:'새 프로젝트',updatedAt:'2026-10-29T00:00:00Z',groups:[{id:'g',displayId:'1',name:'g',form,pieces:[{id:'p',name:'p',form}],subgroups:[],filmName:'',materialCostPerM:'',constructionCostPerM2:'',patternFixed:false}],activeGroupId:'g',activePieceId:'p',useRemnants:false,diagramPart:'상부장',diagramTargets:{}};
beforeEach(()=>{
  fake.data.clear();fake.fail=false;
  vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>fake.data.get(key)??null,setItem:(key:string,value:string)=>{if(fake.fail)throw Error('quota');fake.data.set(key,value);}}});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('writes synchronously before the returned promise settles and restores after refresh',async()=>{
  const saved=saveInputDraft(draft);
  expect(fake.data.get(inputDraftKey('a',null))).toBe(JSON.stringify(draft));
  await saved;
  expect((await loadInputDraft('a')).draft).toEqual(draft);
  expect((await loadInputDraft('b')).draft).toBeNull();
});
it('recovers the latest minute backup when temporary input is damaged',async()=>{
  await saveInputDraft(draft);
  await saveInputDraft(draft,true);
  await saveInputDraft({...draft,projectName:'new'});
  const key=inputDraftKey('a',null);
  fake.data.set(key,'damaged');
  expect(await loadInputDraft('a')).toEqual({draft,recovered:true});
  await saveInputDraft(draft);
  expect(fake.data.get(key+':backup')).toBe(JSON.stringify(draft));
});
it('fails closed when both generations are damaged',async()=>{
  await saveInputDraft(draft);
  const key=inputDraftKey('a',null);
  fake.data.set(key,'bad');fake.data.set(key+':backup','also bad');
  await expect(loadInputDraft('a')).rejects.toThrow('덮어쓰지');
  expect(fake.data.get(key)).toBe('bad');
});
it('backs up exactly once per minute using latest input and cleans up the timer',async()=>{
  vi.useFakeTimers();
  await saveInputDraft(draft);
  let latest:InputDraftBackup|null=draft;
  const error=vi.fn();
  const stop=startInputBackup(()=>latest,error);
  const key=inputDraftKey('a',null)+':backup';
  await vi.advanceTimersByTimeAsync(59_999);
  expect(fake.data.has(key)).toBe(false);
  latest={...draft,projectName:'latest'};
  await vi.advanceTimersByTimeAsync(1);
  expect(JSON.parse(fake.data.get(key)!).projectName).toBe('latest');
  await saveInputDraft({...draft,projectName:'editing'});
  expect(JSON.parse(fake.data.get(key)!).projectName).toBe('latest');
  latest={...draft,projectName:'second minute'};
  await vi.advanceTimersByTimeAsync(60_000);
  expect(JSON.parse(fake.data.get(key)!).projectName).toBe('second minute');
  stop();latest=draft;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(JSON.parse(fake.data.get(key)!).projectName).toBe('second minute');
  expect(error).not.toHaveBeenCalled();
});
it('does not back up before hydration and reports scheduled write failures',async()=>{
  vi.useFakeTimers();
  let latest:InputDraftBackup|null=null;
  const error=vi.fn();const stop=startInputBackup(()=>latest,error);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fake.data.size).toBe(0);
  latest=draft;fake.fail=true;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(error).toHaveBeenCalledTimes(1);stop();
});
it('surfaces storage errors rather than pretending backup succeeded',async()=>{
  await saveInputDraft(draft);fake.fail=true;
  await expect(saveInputDraft({...draft,projectName:'changed'})).rejects.toThrow('quota');
  expect(fake.data.get(inputDraftKey('a',null))).toBe(JSON.stringify(draft));
});
it('retains separate project drafts while selecting the last active project',async()=>{
  await saveInputDraft(draft);
  await saveInputDraft({...draft,projectId:'second',projectName:'second'});
  expect((await loadInputDraft('a')).draft?.projectId).toBe('second');
  expect((await loadInputDraft('a',null)).draft?.projectName).toBe('새 프로젝트');
});
