(function(root){
'use strict';
const KEY='molecular-studio.project.v1',BACKUP=KEY+'.backup';
// Check for a newer draft before the atomic setItem; the UI also observes storage events.
function read(storage){return storage.getItem(KEY)}
function write(storage,raw,expected){if(read(storage)!==expected)throw new Error('CONFLICT');storage.setItem(KEY,raw);return raw}
function preserve(storage,raw){if(raw!==null)storage.setItem(BACKUP,raw)}
const api={KEY,BACKUP,read,write,preserve};if(typeof module!=='undefined')module.exports=api;else root.ProjectStore=api;
})(typeof window!=='undefined'?window:globalThis);
