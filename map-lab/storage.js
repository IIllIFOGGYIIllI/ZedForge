'use strict';
/* Map Lab browser-only IndexedDB cache. No remote services. */
(function(root){
 const DB_NAME='zedforge-nasdara-map-lab',VERSION=1,STORE='local-assets';
 let dbPromise=null;
 function open(){
   if(dbPromise)return dbPromise;
   if(!root.indexedDB)return Promise.reject(new Error('IndexedDB unavailable'));
   dbPromise=new Promise((resolve,reject)=>{
     const request=indexedDB.open(DB_NAME,VERSION);
     request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error||new Error('Unable to open local map storage'));
     request.onblocked=()=>reject(new Error('Map storage blocked by another tab'));
   }).catch(e=>{dbPromise=null;throw e});
   return dbPromise;
 }
 async function transact(method,key,value){
   const db=await open();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,method==='get'?'readonly':'readwrite'),store=tx.objectStore(STORE);
     const request=method==='get'?store.get(key):method==='put'?store.put(value,key):store.delete(key);
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error||new Error('Storage request failed'));
     tx.onerror=()=>reject(tx.error||new Error('Storage transaction failed'));
     tx.onabort=()=>reject(tx.error||new Error('Storage operation was aborted'));
   });
 }
 root.ZedForgeMapStorage={read:key=>transact('get',key),write:(key,value)=>transact('put',key,value),remove:key=>transact('delete',key)};
})(typeof window!=='undefined'?window:globalThis);
