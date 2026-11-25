import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveKey,encrypt,decrypt,newSalt} from '../crypto.mjs';
test('password encryption round trips, rejects a wrong password and detects tampering',async()=>{
 const salt=newSalt(),key=await deriveKey('test-only-password',salt),wrong=await deriveKey('wrong-password',salt);
 const input={tasks:[{title:'Private task',notes:'Unicode 中文 ✓'}]};const sealed=await encrypt(input,key);
 assert.deepEqual(await decrypt(sealed,key),input);assert(!JSON.stringify(sealed).includes('Private task'));
 await assert.rejects(decrypt(sealed,wrong));
 const bytes=Buffer.from(sealed.ciphertext,'base64');bytes[0]^=1;await assert.rejects(decrypt({...sealed,ciphertext:bytes.toString('base64')},key));
 const again=await encrypt(input,key);assert.notEqual(again.iv,sealed.iv);assert.notEqual(again.ciphertext,sealed.ciphertext);
});
test('published payload is an encrypted envelope',async()=>{
 const p=JSON.parse(await readFile('dist/payload.json','utf8'));
 assert.equal(p.version,1);assert.equal(Buffer.from(p.salt,'base64').length,16);assert.equal(Buffer.from(p.iv,'base64').length,12);assert(p.ciphertext.length>1000);assert.equal(p.tasks,undefined);
});

test('encrypts larger shared progress without exceeding the JavaScript call stack',async()=>{
 const key=await deriveKey('large-test',newSalt()),input={notes:'x'.repeat(250000)};assert.deepEqual(await decrypt(await encrypt(input,key),key),input);
});
