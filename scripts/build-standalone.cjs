'use strict';
// Build the single-file edition from the same sources; do not edit it by hand.
const fs=require('node:fs'),path=require('node:path');
function build(root=path.resolve(__dirname,'..')){
  let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  html=html.replace('<link rel="stylesheet" href="styles.css">',()=>'<style>\n'+css+'\n</style>');
  ['core.js','app.js'].forEach(name=>{
    const js=fs.readFileSync(path.join(root,name),'utf8').replace(/<\/script/gi,'<\\/script');
    html=html.replace('<script src="'+name+'" defer></script>',()=>'<script defer>\n'+js+'\n</script>');
  });
  // Inline scripts do not defer. Move them after the complete body instead.
  const scripts=[];
  html=html.replace(/<script defer>[\s\S]*?<\/script>/g,match=>{scripts.push(match.replace('<script defer>','<script>'));return '';});
  html=html.replace('</body>',()=>scripts.join('\n')+'\n</body>');
  const output=path.join(root,'TND_Seller_Workspace.html');
  fs.writeFileSync(output,html,'utf8');return output;
}
module.exports=build;
if(require.main===module)console.log(build());
