const path=require('node:path');
const root=path.resolve(__dirname,'../..');
module.exports={
  appId:'com.pikachu.whatsappnumberfilter',
  productName:'Whatsapp号码筛选',
  executableName:'whatsapp-number-filter',
  buildVersion:'0.0.1',
  asar:true,
  npmRebuild:false,
  electronVersion:'43.1.0',
  electronDist:path.join(root,'node_modules/electron/dist'),
  directories:{app:path.join(root,'.package-staging/whatsapp-number-filter/app'),output:process.env.WNF_BUILD_OUTPUT?path.resolve(process.env.WNF_BUILD_OUTPUT):path.join(root,'release/whatsapp-number-filter/0.0.1')},
  files:['package.json','main.cjs','preload.cjs','data.cjs','permissions.cjs','page.cjs','index.html','styles.css','compact.css','renderer.js','icon.ico','!node_modules{,/**/*}'],
  afterPack:async context=>{
    const {flipFuses,FuseVersion,FuseV1Options:F}=require('@electron/fuses');
    await flipFuses(path.join(context.appOutDir,'whatsapp-number-filter.exe'),{version:FuseVersion.V1,strictlyRequireAllFuses:true,[F.RunAsNode]:false,[F.EnableCookieEncryption]:true,[F.EnableNodeOptionsEnvironmentVariable]:false,[F.EnableNodeCliInspectArguments]:false,[F.EnableEmbeddedAsarIntegrityValidation]:true,[F.OnlyLoadAppFromAsar]:true,[F.LoadBrowserProcessSpecificV8Snapshot]:false,[F.GrantFileProtocolExtraPrivileges]:false,[F.WasmTrapHandlers]:true});
  },
  win:{target:[{target:'nsis',arch:['x64']}],icon:path.join(root,'.package-staging/whatsapp-number-filter/app/icon.ico'),artifactName:'Whatsapp-Number-Filter-${version}-Setup.${ext}'},
  nsis:{oneClick:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'Whatsapp号码筛选',uninstallDisplayName:'Whatsapp号码筛选',language:'2052'}
};
