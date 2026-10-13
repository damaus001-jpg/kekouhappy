const path=require('node:path');const {spawn}=require('node:child_process');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
const child=spawn(require('electron'),[path.join(__dirname,'test-conversation-export-runtime.cjs'),...process.argv.slice(2)],{cwd:path.resolve(__dirname,'..'),env,windowsHide:true,stdio:'inherit'});
child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);
