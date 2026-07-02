/**
 * Refined English-to-Tamil phonetic transliteration.
 * Handles common Tamil names, places, and address terms accurately.
 */

// Common Tamil words/names with known correct transliterations
const dictionary: Record<string, string> = {
  // Common names
  kumar: 'குமார்', raja: 'ராஜா', rajan: 'ராஜன்', lakshmi: 'லக்ஷ்மி',
  selvam: 'செல்வம்', murugan: 'முருகன்', ganesh: 'கணேஷ்', ganeshan: 'கணேஷன்',
  krishna: 'கிருஷ்ணா', ramesh: 'ரமேஷ்', suresh: 'சுரேஷ்', mahesh: 'மகேஷ்',
  priya: 'பிரியா', divya: 'திவ்யா', anand: 'ஆனந்த்', anandh: 'ஆனந்த்',
  muthu: 'முத்து', vel: 'வேல்', velu: 'வேலு', mari: 'மாரி',
  pandi: 'பாண்டி', pandian: 'பாண்டியன்', karthik: 'கார்த்திக்',
  senthil: 'செந்தில்', arun: 'அருண்', varun: 'வருண்',
  vijay: 'விஜய்', ajay: 'அஜய்', sanjay: 'சஞ்சய்',
  devi: 'தேவி', rani: 'ராணி', mani: 'மணி', vani: 'வாணி',
  saranya: 'சரண்யா', dharani: 'தரணி', bharathi: 'பாரதி',
  nandini: 'நந்தினி', revathi: 'ரேவதி', kavitha: 'கவிதா',
  sangeetha: 'சங்கீதா', meena: 'மீனா', deepa: 'தீபா',
  siva: 'சிவா', shiva: 'சிவா', shankar: 'சங்கர்', shanmugam: 'சண்முகம்',
  palani: 'பழனி', madurai: 'மதுரை', thanjavur: 'தஞ்சாவூர்',
  kalyani: 'கல்யாணி', athista: 'அதிஷ்ட', selvi: 'செல்வி',
  priyadharshini: 'பிரியதர்ஷினி', natrajan: 'நடராஜன்', jeeva: 'ஜீவா',
  rajamani: 'ராஜாமணி', ponraj: 'பொன்ராஜ்', arul: 'அருள்', arulanandham: 'அருளானந்தம்',
  
  // Biblical / Christian Names
  john: 'ஜான்', james: 'ஜேம்ஸ்', david: 'டேவிட்', mary: 'மேரி',
  joseph: 'ஜோசப்', peter: 'பீட்டர்', paul: 'பால்', thomas: 'தாமஸ்',
  daniel: 'டேனியல்', samuel: 'சாமுவேல்', abraham: 'ஆபிரகாம்',
  moses: 'மோசஸ்', solomon: 'சாலமன்', ruth: 'ரூத்',
  sarah: 'சாரா', esther: 'எஸ்தர்', rachel: 'ரேச்சல்',
  rebecca: 'ரெபேக்கா', elizabeth: 'எலிசபெத்', michael: 'மைக்கேல்',
  gabriel: 'கேப்ரியேல்', joshua: 'ஜோஷுவா', isaac: 'ஐசக்',
  jacob: 'ஜேக்கப்', matthew: 'மத்தேயு', mark: 'மார்க்',
  luke: 'லூக்கா', andrew: 'ஆண்ட்ரூ', philip: 'பிலிப்',
  stephen: 'ஸ்டீபன்', timothy: 'திமோதி', titus: 'தீத்து',
  ebenezer: 'எபினேசர்', immanuel: 'இம்மானுவேல்', azariah: 'அசரியா',
  vedakkan: 'வேதக்கன்', jebaraj: 'ஜெபராஜ்', jebakumar: 'ஜெபகுமார்',
  gnanaraj: 'ஞானராஜ்', gnanaprakasam: 'ஞானப்பிரகாசம்',
  devadhas: 'தேவதாஸ்', devasahayam: 'தேவசகாயம்', yesu: 'இயேசு', christu: 'கிறிஸ்து',

  // States
  tamilnadu: 'தமிழ்நாடு', tamil: 'தமிழ்', nadu: 'நாடு',
  kerala: 'கேரளா', karnataka: 'கர்நாடகா', andhra: 'ஆந்திரா',
  telangana: 'தெலங்கானா', maharashtra: 'மகாராஷ்டிரா',
  india: 'இந்தியா',

  // Districts / Cities / Specific Places
  chennai: 'சென்னை', coimbatore: 'கோயம்புத்தூர்',
  salem: 'சேலம்', trichy: 'திருச்சி', tiruchirappalli: 'திருச்சிராப்பள்ளி',
  erode: 'ஈரோடு', tirunelveli: 'திருநெல்வேலி', tuticorin: 'தூத்துக்குடி',
  kanyakumari: 'கன்னியாகுமரி', nagercoil: 'நாகர்கோவில்',
  vellore: 'வேலூர்', dindigul: 'திண்டுக்கல்', theni: 'தேனி',
  nellai: 'நெல்லை', palayapettai: 'பாளையம்பேட்டை', ambetkar: 'அம்பேத்கர்',
  sithan: 'சித்தன்', kudiyirupu: 'குடியிருப்பு', thenpathu: 'தென்பத்து',
  papa: 'பாப்பா', palayamkottai: 'பாளையங்கோட்டை', melapalayam: 'மேலப்பாளையம்',
  pettai: 'பேட்டை', thatchanallur: 'தச்சநல்லூர்', tachanallur: 'தச்சநல்லூர்',
  vannarpettai: 'வண்ணாரப்பேட்டை', kuruchi: 'குறிச்சி',
  
  // Common address terms
  nagar: 'நகர்', street: 'தெரு', road: 'சாலை',
  village: 'கிராமம்', town: 'டவுன்', city: 'நகரம்',
  district: 'மாவட்டம்', taluk: 'தாலுக்கா', puram: 'புரம்',
  colony: 'காலனி', layout: 'லேஅவுட்', garden: 'தோட்டம்',
  south: 'தெற்கு', north: 'வடக்கு', east: 'கிழக்கு', west: 'மேற்கு',
  cross: 'குறுக்கு', main: 'முக்கிய', kovil: 'கோவில்', koil: 'கோயில்',
  church: 'சர்ச்', palli: 'பள்ளி', valagam: 'வளாகம்'
};

// Consonant clusters (3-char, then 2-char, then 1-char)
const consonantMap: [string, string][] = [
  // 3-char
  ['thr', 'த்ர'], ['chr', 'க்ர'], ['str', 'ஸ்ட்ர'], ['ndr', 'ந்த்ர'],
  ['shr', 'ஸ்ர'],
  // 2-char
  ['kh', 'க'], ['gh', 'க'], ['ch', 'ச'], ['ng', 'ங்க'],
  ['nj', 'ஞ்ச'], ['nd', 'ண்ட'], ['nt', 'ண்ட'], ['nn', 'ண்ண'],
  ['th', 'த'], ['dh', 'த'], ['ph', 'ப'], ['bh', 'ப'],
  ['sh', 'ஷ'], ['zh', 'ழ'], ['tr', 'ட்ர'], ['dr', 'ட்ர'],
  ['pr', 'ப்ர'], ['br', 'ப்ர'], ['kr', 'க்ர'], ['gr', 'க்ர'],
  ['ll', 'ள்ள'], ['rr', 'ற்ற'], ['tt', 'ட்ட'], ['pp', 'ப்ப'],
  ['kk', 'க்க'], ['mm', 'ம்ம'], ['ss', 'ஸ்ஸ'],
  // 1-char
  ['k', 'க'], ['g', 'க'], ['c', 'க'],
  ['j', 'ஜ'], ['s', 'ச'], ['t', 'த'], ['d', 'ட'],
  ['n', 'ந'], ['p', 'ப'], ['b', 'ப'],
  ['m', 'ம'], ['y', 'ய'], ['r', 'ர'], ['l', 'ல'],
  ['v', 'வ'], ['w', 'வ'], ['h', 'ஹ'],
  ['f', 'ஃப'], ['z', 'ஸ'], ['x', 'க்ஸ'], ['q', 'க'],
];

// Vowels (standalone form) - longer patterns first
const vowelMap: [string, string][] = [
  ['aa', 'ஆ'], ['ai', 'ஐ'], ['au', 'ஔ'],
  ['ee', 'ஈ'], ['ei', 'ஏ'],
  ['oo', 'ஊ'], ['ou', 'ஔ'], ['oa', 'ஓ'],
  ['a', 'அ'], ['i', 'இ'], ['u', 'உ'], ['e', 'எ'], ['o', 'ஒ'],
];

// Vowel signs (after consonant) - longer patterns first
const vowelSignMap: [string, string][] = [
  ['aa', 'ா'], ['ai', 'ை'], ['au', 'ௌ'],
  ['ee', 'ீ'], ['ei', 'ே'],
  ['oo', 'ூ'], ['ou', 'ௌ'], ['oa', 'ோ'],
  ['a', ''], ['i', 'ி'], ['u', 'ு'], ['e', 'ெ'], ['o', 'ொ'],
];

const virama = '்';

function isVowelChar(ch: string): boolean {
  return 'aeiou'.includes(ch);
}

function matchConsAt(s: string, i: number): [string, number] | null {
  for (const [pat, tam] of consonantMap) {
    if (s.substring(i, i + pat.length) === pat) {
      return [tam, pat.length];
    }
  }
  return null;
}

function matchVowelSignAt(s: string, i: number): [string, number] | null {
  for (const [pat, tam] of vowelSignMap) {
    if (s.substring(i, i + pat.length) === pat) {
      // Ensure we don't partially match a longer vowel
      for (const [longerPat] of vowelSignMap) {
        if (longerPat.length > pat.length && s.substring(i, i + longerPat.length) === longerPat) {
          return [vowelSignMap.find(([p]) => p === longerPat)![1], longerPat.length];
        }
      }
      return [tam, pat.length];
    }
  }
  return null;
}

function matchVowelAt(s: string, i: number): [string, number] | null {
  for (const [pat, tam] of vowelMap) {
    if (s.substring(i, i + pat.length) === pat) {
      return [tam, pat.length];
    }
  }
  return null;
}

function transliterateWord(word: string): string {
  const lower = word.toLowerCase();

  // Check dictionary first
  if (dictionary[lower]) return dictionary[lower];

  let result = '';
  let i = 0;

  while (i < lower.length) {
    if (!/[a-z]/.test(lower[i])) {
      result += lower[i];
      i++;
      continue;
    }

    // Try consonant
    const cons = matchConsAt(lower, i);
    if (cons) {
      const [tamilCons, len] = cons;
      i += len;

      // Look for vowel sign after consonant
      if (i < lower.length && isVowelChar(lower[i])) {
        const vsign = matchVowelSignAt(lower, i);
        if (vsign) {
          result += tamilCons + vsign[0];
          i += vsign[1];
        } else {
          result += tamilCons;
        }
      } else {
        // No vowel follows → add virama
        result += tamilCons + virama;
      }
      continue;
    }

    // Try standalone vowel
    const vow = matchVowelAt(lower, i);
    if (vow) {
      result += vow[0];
      i += vow[1];
      continue;
    }

    // Fallback
    result += lower[i];
    i++;
  }

  return result;
}

/**
 * Transliterates an English string to Tamil script using phonetic mapping.
 * Uses a dictionary for common Tamil names/places, with fallback to phonetic rules.
 */
export function transliterateToTamil(input: string): string {
  if (!input) return '';
  // Preserve punctuation and spaces
  return input.replace(/[a-zA-Z]+/g, (match) => transliterateWord(match));
}
