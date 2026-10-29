import { expect, it, vi } from 'vitest';
import { installInputReloadGuard, isReloadShortcut } from './inputReloadGuard';
it('blocks reload shortcuts but not ordinary typing',()=>{
  const event={key:'r',ctrlKey:false,metaKey:false};
  expect(isReloadShortcut(event)).toBe(false);
  expect(isReloadShortcut({...event,key:'F5'})).toBe(true);
  expect(isReloadShortcut({...event,ctrlKey:true})).toBe(true);
  expect(isReloadShortcut({...event,metaKey:true,key:'R'})).toBe(true);
});
it('registers refresh guard, requests browser confirmation and removes handlers',()=>{
  const listeners=new Map<string,(event:any)=>void>();
  const target={addEventListener:(name:string,handler:any)=>listeners.set(name,handler),removeEventListener:vi.fn()};
  const cleanup=installInputReloadGuard(target as unknown as Window);
  const event={key:'F5',ctrlKey:false,metaKey:false,preventDefault:vi.fn(),returnValue:undefined};
  listeners.get('keydown')!(event);expect(event.preventDefault).toHaveBeenCalledTimes(1);
  listeners.get('beforeunload')!(event);expect(event.returnValue).toBe('');
  cleanup();expect(target.removeEventListener).toHaveBeenCalledTimes(2);
});
