()=>{const re=/\b\d{4}-\d{2}(-\d{2})?\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(, \d{4})?\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b|\btoday\b|\byesterday\b|\/tmp\/\S+/g;
const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()) if(re.test(n.nodeValue)){re.lastIndex=0; n.nodeValue=n.nodeValue.replace(re,'••••');}
document.querySelectorAll('input[type=date],input[type=month]').forEach(i=>{if(i.value){i.type='text'; i.value='••••';}});
document.querySelectorAll('svg text').forEach(t=>{if(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/.test(t.textContent)) t.textContent='••';});}
