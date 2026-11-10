const ts=require('typescript');
const asar=require('@electron/asar');
const path=require('node:path');
function extractLicenseManager(archive){
 const source=asar.extractFile(archive,path.normalize('dist-electron/main.js')).toString('utf8');
 const file=path.resolve('.tmp/upgrade-main-'+path.basename(path.dirname(path.dirname(archive)))+'.js');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const host=ts.createCompilerHost({allowJs:true,noResolve:true,noLib:true});
 host.getSourceFile=name=>path.resolve(name)===file?tree:undefined;
 host.fileExists=name=>path.resolve(name)===file;host.readFile=name=>path.resolve(name)===file?source:undefined;
 const program=ts.createProgram([file],{allowJs:true,noResolve:true,noLib:true},host);
 const checker=program.getTypeChecker();
 let manager;
 function find(node){
  if((ts.isClassExpression(node)||ts.isClassDeclaration(node))&&node.members.some(member=>member.name?.getText(tree)==='getRuntimeSecurityExpectation'))manager=node;
  ts.forEachChild(node,find);
 }find(tree);
 if(!manager)throw new Error('Actual packaged license manager was not found');
 function top(node){
  for(let item=node;item&&item.parent;item=item.parent){
   if(ts.isImportDeclaration(item))return item;
   if(ts.isVariableDeclaration(item)&&ts.isVariableDeclarationList(item.parent)&&ts.isVariableStatement(item.parent.parent)&&item.parent.parent.parent===tree)return item;
   if((ts.isFunctionDeclaration(item)||ts.isClassDeclaration(item))&&item.parent===tree)return item;
  }
 }
 const selected=new Set();
 function include(node){
  node=top(node);if(!node||selected.has(node))return;selected.add(node);
  if(ts.isImportDeclaration(node))return;
  function visit(item){
   if(ts.isIdentifier(item))for(const declaration of checker.getSymbolAtLocation(item)?.declarations||[])include(declaration);
   ts.forEachChild(item,visit);
  }visit(node);
 }
 include(manager);
 const target=top(manager);const name=target.name?.getText(tree);
 if(!name||!ts.isIdentifier(target.name))throw new Error('Packaged license manager binding is ambiguous');
 let code=[...selected].sort((a,b)=>a.pos-b.pos).map(node=>ts.isVariableDeclaration(node)?'let '+node.getText(tree)+';':node.getText(tree)).join('\n');
 code=code.replaceAll('import.meta.url',JSON.stringify(require('node:url').pathToFileURL(file).href));
 code+='\nmodule.exports={ClientLicenseManager:'+name+'};';
 return {code:ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,declarations:selected.size};
}
module.exports={extractLicenseManager};
