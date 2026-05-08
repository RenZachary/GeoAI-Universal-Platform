const mojibake = '榫欒吘涔濆ぉ灏忓尯';
const real = '龙腾九天小区';

console.log('Mojibake characters:');
let mojNonCjk = 0;
let mojCjk = 0;
[...mojibake].forEach((c, i) => {
  const code = c.charCodeAt(0);
  const isASCII = code >= 0x20 && code <= 0x7E;
  const isCJK = (code >= 0x4E00 && code <= 0x9FFF) || 
                (code >= 0x3400 && code <= 0x4DBF) ||
                (code >= 0x3000 && code <= 0x303F) ||
                (code >= 0xFF00 && code <= 0xFFEF);
  
  if (!isASCII) {
    if (isCJK) mojCjk++;
    else mojNonCjk++;
  }
  
  console.log(`  ${i + 1}. U+${code.toString(16).toUpperCase().padStart(4, '0')} (${c}) - ASCII:${isASCII} CJK:${isCJK}`);
});

console.log(`\nMojibake summary: CJK=${mojCjk}, Non-CJK=${mojNonCjk}, Ratio=${mojCjk > 0 ? (mojNonCjk / (mojCjk + mojNonCjk) * 100).toFixed(1) : 0}%`);

console.log('\nReal Chinese characters:');
let realNonCjk = 0;
let realCjk = 0;
[...real].forEach((c, i) => {
  const code = c.charCodeAt(0);
  const isASCII = code >= 0x20 && code <= 0x7E;
  const isCJK = (code >= 0x4E00 && code <= 0x9FFF) || 
                (code >= 0x3400 && code <= 0x4DBF) ||
                (code >= 0x3000 && code <= 0x303F) ||
                (code >= 0xFF00 && code <= 0xFFEF);
  
  if (!isASCII) {
    if (isCJK) realCjk++;
    else realNonCjk++;
  }
  
  console.log(`  ${i + 1}. U+${code.toString(16).toUpperCase().padStart(4, '0')} (${c}) - ASCII:${isASCII} CJK:${isCJK}`);
});

console.log(`\nReal summary: CJK=${realCjk}, Non-CJK=${realNonCjk}, Ratio=${realCjk > 0 ? (realNonCjk / (realCjk + realNonCjk) * 100).toFixed(1) : 0}%`);
