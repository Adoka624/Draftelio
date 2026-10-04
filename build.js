'use strict';
// Run: node build.js <path-to-electron-dist>. No packaging dependency is required.
const fs=require('node:fs'),path=require('node:path');
const runtime=path.resolve(process.argv[2] || '');
if(!process.argv[2] || !fs.existsSync(path.join(runtime,'electron.exe'))) throw new Error('Укажите папку официального Electron 44.5.1 для Windows x64.');
const destination=path.join(__dirname,'Windows');
fs.mkdirSync(destination,{recursive:true});
fs.cpSync(runtime,destination,{recursive:true});
const executable=path.join(destination,'Draftelio.exe');
if(fs.existsSync(executable)) fs.unlinkSync(executable);
fs.renameSync(path.join(destination,'electron.exe'),executable);
fs.cpSync(path.join(__dirname,'app'),path.join(destination,'resources','app'),{recursive:true,filter:source=>!source.split(path.sep).includes('node_modules')});
fs.writeFileSync(path.join(destination,'Проверить.cmd'),'@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0Draftelio.exe" "%~dp0resources\\app\\test.js"\r\npause\r\n','utf8');
console.log('Готово: '+executable);
