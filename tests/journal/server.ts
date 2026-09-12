import express from 'express';
import { build } from 'esbuild';
const output=await build({stdin:{contents:`export * from './client/src/features/physical-draft/recoveryJournal';
export * from './shared/persistence/physicalSave';
export { basicPhysicalSaveDraft, richPhysicalSaveDraft, PHYSICAL_SAVE_TEST_AT } from './tests/fixtures/physicalSave';
export { editField, commitField } from './client/src/features/physical-draft/state';`,resolveDir:process.cwd()},
  bundle:true,platform:'browser',format:'esm',write:false,tsconfig:'tsconfig.json'});
const app=express();app.get('/journal-test.js',(_req,res)=>res.type('application/javascript').send(output.outputFiles[0].text));
app.get('*',(_req,res)=>res.type('html').send('<!doctype html><html><head><title>Isolated IndexedDB journal verification</title></head><body>Journal test fixture</body></html>'));
app.listen(4176,'127.0.0.1',()=>console.log('Isolated journal fixture on127.0.0.1:4176'));
