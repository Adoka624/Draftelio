const {spawnSync}=require('node:child_process');
const tests=['layout','drawers','home','new-site','text-toolbar','workshop','workshop-layout','workshop-colors','ai-history','ai-live','image-picker'];
for(const name of tests){const run=spawnSync(process.execPath,['checks/'+name+'-test.cjs'],{stdio:'inherit',env:process.env});if(run.status!==0)process.exit(run.status||1);}
