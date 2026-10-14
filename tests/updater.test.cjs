'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fetchReleaseSource}=require('../src/update-fetch.js');
const main=fs.readFileSync(path.join(__dirname,'..','MagicGardenAutoFarm.user.js'),'utf8');
const url='https://raw.githubusercontent.com/maik26-hub/Magic-Garden-Tools/main/MagicGardenAutoFarm.user.js';
test('GM privileged transport checks only allowed official URL anonymously and bypasses fetch',async()=>{
  let requested,fetchCalled=false;
  const source=await fetchReleaseSource(url,{
    now:()=>123,gmRequest:opts=>{requested=opts;opts.onload({status:200,responseText:'// valid script metadata'});},
    fetchImpl:async()=>{fetchCalled=true;throw Error('must not call browser fetch')}
  });
  assert.equal(source,'// valid script metadata');
  assert.equal(fetchCalled,false);
  assert.equal(requested.method,'GET');
  assert.equal(requested.url,url+'?check=123');
  assert.equal(requested.anonymous,true);
  assert.ok(requested.timeout<=10000);
});
test('network timeout gracefully falls back to normal fetch where allowed',async()=>{
  let options;
  const source=await fetchReleaseSource(url,{
    now:()=>456,gmRequest:opts=>opts.ontimeout(),
    fetchImpl:async(location,opts)=>{
      options=opts;assert.equal(location,url+'?check=456');
      return {ok:true,text:async()=>main};
    }
  });
  assert.equal(source,main);
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.mode,'cors');
});
test('GM HTTP 403 does not get falsely counted as an update',async()=>{
  await assert.rejects(()=>fetchReleaseSource(url,{
    gmRequest:opts=>opts.onload({status:403,responseText:'forbidden'}),
    fetchImpl:async()=>({ok:false,status:403})
  }),/Updater HTTP 403/);
});
test('GM callback onabort rejects when fallback also fails',async()=>{
  await assert.rejects(()=>fetchReleaseSource(url,{
    gmRequest:opts=>opts.onabort(),
    fetchImpl:async()=>{throw Error('CSP blocked')}
  }),/CSP blocked/);
});
test('updater does not execute remote source, only returns text',async()=>{
  const evil="globalThis.__SHOULD_NOT_RUN=true";
  const text=await fetchReleaseSource(url,{gmRequest:cb=>cb.onload({status:200,responseText:evil})});
  assert.equal(text,evil);assert.equal(globalThis.__SHOULD_NOT_RUN,undefined);
});
test('metadata enables GM transport while preserving original identity and update channel',()=>{
  assert.match(main,/^\/\/ @grant\s+GM_xmlhttpRequest$/m);
  assert.match(main,/^\/\/ @grant\s+unsafeWindow$/m);
  assert.match(main,/^\/\/ @connect\s+raw\.githubusercontent\.com$/m);
  assert.doesNotMatch(main,/^\/\/ @grant\s+none$/m);
  assert.match(main,/const window = typeof unsafeWindow !== "undefined" \? unsafeWindow : globalThis\.window/);
  assert.match(main,/^\/\/ @name\s+Magic Garden AutoFarm$/m);
  assert.match(main,/^\/\/ @namespace\s+mg-autofarm-local$/m);
  assert.match(main,/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/maik26-hub\/Magic-Garden-Tools\/main\/MagicGardenAutoFarm\.user\.js$/m);
});
test('script hooks the actual unsafe page window with GM granted, not the sandbox proxy',()=>{
  const tasks=[],Native=class Socket {
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;this.events=new Map()}
    addEventListener(type,fn){this.events.set(type,fn)}
  };
  const actualPage={WebSocket:Native,addEventListener(){}};
  const fakeSandbox={WebSocket:undefined,addEventListener(){}};
  const storage={getItem(){return null},setItem(){}};
  const ctx={
    window:fakeSandbox,unsafeWindow:actualPage,WebSocket:Native,
    document:{body:null,hidden:false,addEventListener(){}},
    localStorage:storage,sessionStorage:storage,navigator:{onLine:true},
    location:{reload(){}},console:{log(){},info(){},warn(){},error(){},table(){}},
    setInterval:fn=>tasks.push(fn),setTimeout:fn=>tasks.push(fn),clearTimeout(){},
    performance:{now:()=>0,getEntriesByType:()=>[]},
    crypto:{randomUUID:()=> 'mock'},
    AbortController,fetch:async()=>({ok:false,status:500}),
    GM_xmlhttpRequest(){throw Error('not reached until after page load')}
  };
  vm.runInNewContext(main,ctx,{timeout:5000});
  assert.equal(typeof actualPage.MGAutoFarmV13,'object');
  assert.notEqual(actualPage.WebSocket,Native);
  assert.equal(fakeSandbox.WebSocket,undefined);
});
