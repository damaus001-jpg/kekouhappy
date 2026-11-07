const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const signalRoot=path.join(root,'.tmp/signal-source/v8.18.0/Signal-Desktop-8.18.0');
const file=path.join(signalRoot,'ts/components/CompositionInput.dom.tsx');
const source=fs.readFileSync(file,'utf8');
const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let declaration;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='submit'&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(tree)==='useCallback')declaration=node;ts.forEachChild(node,visit);}
visit(tree);assert.ok(declaration,'native submit callback');
const code=ts.transpileModule('const '+declaration.getText(tree)+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const guardCode=ts.transpileModule(fs.readFileSync(path.join(signalRoot,'ts/maoyi/outgoingTextGuard.std.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const guard=new Function('exports',guardCode+';return exports;')({});
function fixture(initial){
 let text=initial,backendBlocks=0;const sent=[],events=[],canSendRef={current:true};
 const submit=new Function('useCallback','quillRef','canSendRef','getTextAndRanges','onSubmit','log','containsMaoyiBlockedChineseText','document','conversationId',code+';return submit;')(
  fn=>fn,{current:{}},canSendRef,()=>({text,bodyRanges:[]}),value=>{if(guard.containsMaoyiBlockedChineseText(value))backendBlocks++;else sent.push(value);return true;},{warn(){},info(){}},guard.containsMaoyiBlockedChineseText,{dispatchEvent:event=>events.push(event)},'11111111-1111-4111-8111-111111111111'
 );
 return {submit,canSendRef,sent,events,setText:value=>{text=value;},backendBlocks:()=>backendBlocks};
}
for(const chinese of ['测试中文','Hello 中文','𠀀']){
 const state=fixture(chinese);state.submit();
 assert.equal(state.canSendRef.current,true,'blocked Chinese submit must remain retryable');
 assert.equal(state.sent.length,0,'Chinese must not be sent');
 assert.equal(state.backendBlocks(),0,'UI rejection must precede the backend error toast');
 assert.equal(state.events[0]?.type,'df-signal-chinese-submit-blocked');
 assert.equal(JSON.parse(state.events[0].detail).text,chinese);
 state.setText('Translated English');state.submit();
 assert.deepEqual(state.sent,['Translated English'],'English retry works without resetting or relinking the account');
 state.submit();assert.equal(state.sent.length,1,'an accepted send still blocks duplicates until normal reset');
}
assert.match(fs.readFileSync(path.join(signalRoot,'ts/state/ducks/composer.preload.ts'),'utf8'),/containsMaoyiBlockedChineseText\(message\)/,'native pre-send protection stays enabled');
console.log('signal-submit-recovery: Chinese rejection stays retryable; translated English retries, duplicate prevention and native guard retained');
