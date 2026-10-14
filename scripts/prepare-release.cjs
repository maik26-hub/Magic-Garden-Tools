'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'tests/main-upgrade.test.cjs');let s=fs.readFileSync(file,'utf8');
s=s.replace("source.replace('// @version      14.0.3',\n    '// @version      14.0.4')", "source.replace('// @version      15.0.0',\n    '// @version      15.0.1')");
s=s.replace("assert.equal(result.newer, '14.0.4')", "assert.equal(result.newer, '15.0.1')");
s=s.replace("'Aktuell: V14.0.3'", "'Aktuell: V15.0.0'");
s=s.replace("source.replace('// @version      14.0.3',\n    '// @version      14.0.1')", "source.replace('// @version      15.0.0',\n    '// @version      14.0.3')");
s=s.replace("assert.equal(item('version'), '14.0.3')", "assert.equal(item('version'), '15.0.0')");
s=s.replace("assert.equal(candidate, '14.0.3')", "assert.equal(candidate, '15.0.0')");
fs.writeFileSync(file,s);
// Room/player identities can change. Use a conservative browser-origin/day
// budget shared by all rooms, with one global Web Lock for purchase writes.
const core=path.join(root,'src/automation-core.js');let code=fs.readFileSync(core,'utf8');
code=code.replace(/LEDGER\s*\+\s*':'\s*\+\s*s\.actor\s*\+\s*':'\s*\+\s*day/g,"LEDGER+':'+day");
// The server's purchase count proves the action. Concurrent sales/pet income
// can raise wallet balance, so a balance decrease is not a required condition.
code=code.replace('&&s.own.coinsCount<=p.coinsBefore-p.price','');
fs.writeFileSync(core,code);
