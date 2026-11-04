// สร้าง celeb-data.js: ดึงรูป (thumbnail 500px) ของคนดังจาก Wikipedia — รันครั้งเดียวตอนพัฒนา
// node build-celebs.js <path ของ celeb-data.js>
const fs = require('fs');
const OUT = process.argv[2];

// [ชื่อหน้า en.wikipedia, ชื่อที่แสดง, กลุ่ม th/intl, เพศ m/f, ประเภท]
const LIST = [
  // ---- ไทย: นักแสดง
  ['Mario Maurer', 'มาริโอ้ เมาเร่อ', 'th', 'm', 'นักแสดง'],
  ['Nadech Kugimiya', 'ณเดชน์ คูกิมิยะ', 'th', 'm', 'นักแสดง'],
  ['Urassaya Sperbund', 'ญาญ่า อุรัสยา', 'th', 'f', 'นักแสดง'],
  ['Davika Hoorne', 'ใหม่ ดาวิกา', 'th', 'f', 'นักแสดง'],
  ['Pimchanok Luevisadpaibul', 'ใบเฟิร์น พิมพ์ชนก', 'th', 'f', 'นักแสดง'],
  ['Tony Jaa', 'จา พนม', 'th', 'm', 'นักแสดง'],
  ['Vachirawit Chivaaree', 'ไบร์ท วชิรวิชญ์', 'th', 'm', 'นักแสดง'],
  ['Metawin Opas-iamkajorn', 'วิน เมธวิน', 'th', 'm', 'นักแสดง'],
  ['Ananda Everingham', 'อนันดา เอเวอริ่งแฮม', 'th', 'm', 'นักแสดง'],
  ['Araya A. Hargate', 'ชมพู่ อารยา', 'th', 'f', 'นักแสดง'],
  ['Khemanit Jamikorn', 'แพนเค้ก เขมนิจ', 'th', 'f', 'นักแสดง'],
  ['Chermarn Boonyasak', 'พลอย เฌอมาลย์', 'th', 'f', 'นักแสดง'],
  ['Sukollawat Kanarot', 'เวียร์ ศุกลวัฒน์', 'th', 'm', 'นักแสดง'],
  ['Jirayu La-ongmanee', 'เจมส์ จิรายุ', 'th', 'm', 'นักแสดง'],
  ['Kimberley Anne Woltemas', 'คิมเบอร์ลี่', 'th', 'f', 'นักแสดง'],
  ['Petchtai Wongkamlao', 'หม่ำ จ๊กมก', 'th', 'm', 'นักแสดง'],
  ['Chutavuth Pattarakampol', 'มาร์ช จุฑาวุฒิ', 'th', 'm', 'นักแสดง'],
  ['Thanapob Leeratanakachorn', 'ต่อ ธนภพ', 'th', 'm', 'นักแสดง'],
  ['Sarocha Watittapan', 'เกรซ สโรชา', 'th', 'f', 'นักแสดง'],
  ['Chutimon Chuengcharoensukying', 'ออกแบบ ชุติมณฑน์', 'th', 'f', 'นักแสดง'],
  ['Cris Horwang', 'คริส หอวัง', 'th', 'f', 'นักแสดง'],
  ['Sornram Teppitak', 'ศรราม เทพพิทักษ์', 'th', 'm', 'นักแสดง'],
  ['Pakorn Chatborirak', 'บอย ปกรณ์', 'th', 'm', 'นักแสดง'],
  ['Tanapol Jarujitranon', 'ภณ ณวัสน์', 'th', 'm', 'นักแสดง'],
  ['Engfa Waraha', 'อิงฟ้า วราหะ', 'th', 'f', 'นักร้อง'],
  // ---- ไทย: นักร้อง / ศิลปิน
  ['Lisa (rapper)', 'ลิซ่า ลลิษา', 'th', 'f', 'นักร้อง'],
  ['Thongchai McIntyre', 'เบิร์ด ธงไชย', 'th', 'm', 'นักร้อง'],
  ['Palmy (singer)', 'ปาล์มมี่', 'th', 'f', 'นักร้อง'],
  ['Tata Young', 'ทาทา ยัง', 'th', 'f', 'นักร้อง'],
  ['Putthipong Assaratanakul', 'บิวกิ้น พุฒิพงศ์', 'th', 'm', 'นักร้อง'],
  ['Krit Amnuaydechkorn', 'พีพี กฤษฏ์', 'th', 'm', 'นักร้อง'],
  ['BamBam (rapper)', 'แบมแบม กันต์พิมุกต์', 'th', 'm', 'K-pop'],
  ['Ten (singer)', 'เตนล์ ชิตพล', 'th', 'm', 'K-pop'],
  ['Nichkhun', 'นิชคุณ', 'th', 'm', 'K-pop'],
  ['Minnie (singer)', 'มินนี่ ณิชา', 'th', 'f', 'K-pop'],
  ['Sorn (singer)', 'ซอน ชลธร', 'th', 'f', 'K-pop'],
  ['Jennifer Kim (singer)', 'เจนนิเฟอร์ คิ้ม', 'th', 'f', 'นักร้อง'],
  ['Pongsit Kamphee', 'พงษ์สิทธิ์ คำภีร์', 'th', 'm', 'นักร้อง'],
  ['Sek Loso', 'เสก โลโซ', 'th', 'm', 'นักร้อง'],
  ['Ad Carabao', 'แอ๊ด คาราบาว', 'th', 'm', 'นักร้อง'],
  ['Milli (rapper)', 'มิลลิ', 'th', 'f', 'นักร้อง'],
  ['Jeff Satur', 'เจฟ ซาเตอร์', 'th', 'm', 'นักร้อง'],
  ['Pumpuang Duangjan', 'พุ่มพวง ดวงจันทร์', 'th', 'f', 'นักร้อง'],
  ['Udom Taephanich', 'โน้ส อุดม', 'th', 'm', 'อื่น ๆ'],
  // ---- ไทย: นักกีฬา
  ['Ratchanok Intanon', 'เมย์ รัชนก', 'th', 'f', 'นักกีฬา'],
  ['Buakaw Banchamek', 'บัวขาว บัญชาเมฆ', 'th', 'm', 'นักกีฬา'],
  ['Paradorn Srichaphan', 'ภราดร ศรีชาพันธุ์', 'th', 'm', 'นักกีฬา'],
  ['Chanathip Songkrasin', 'ชนาธิป สรงกระสินธ์', 'th', 'm', 'นักกีฬา'],
  ['Teerasil Dangda', 'ธีรศิลป์ แดงดา', 'th', 'm', 'นักกีฬา'],
  ['Panipak Wongpattanakit', 'เทนนิส พาณิภัค', 'th', 'f', 'นักกีฬา'],
  ['Kunlavut Vitidsarn', 'วิว กุลวุฒิ', 'th', 'm', 'นักกีฬา'],
  ['Kiradech Aphibarnrat', 'จีรเดช อภิบาลรัตน์', 'th', 'm', 'นักกีฬา'],
  ['Ariya Jutanugarn', 'โปรเม เอรียา', 'th', 'f', 'นักกีฬา'],
  ['Atthaya Thitikul', 'โปรจีน อาฒยา', 'th', 'f', 'นักกีฬา'],
  ['Somluck Kamsing', 'สมรักษ์ คำสิงห์', 'th', 'm', 'นักกีฬา'],
  ['Kiatisuk Senamuang', 'ซิโก้ เกียรติศักดิ์', 'th', 'm', 'นักกีฬา'],
  ['Khaosai Galaxy', 'เขาทราย แกแล็คซี่', 'th', 'm', 'นักกีฬา'],
  ['Supachok Sarachat', 'สุภโชค สารชาติ', 'th', 'm', 'นักกีฬา'],
  ['Pornanong Phatlum', 'โปรเม้ง พรอนงค์', 'th', 'f', 'นักกีฬา'],
  ['Sopita Tanasan', 'โสภิตา ธนสาร', 'th', 'f', 'นักกีฬา'],
  // ---- ต่างประเทศ: นักร้อง
  ['Taylor Swift', 'Taylor Swift', 'intl', 'f', 'นักร้อง'],
  ['Beyoncé', 'Beyoncé', 'intl', 'f', 'นักร้อง'],
  ['Rihanna', 'Rihanna', 'intl', 'f', 'นักร้อง'],
  ['Lady Gaga', 'Lady Gaga', 'intl', 'f', 'นักร้อง'],
  ['Ed Sheeran', 'Ed Sheeran', 'intl', 'm', 'นักร้อง'],
  ['Justin Bieber', 'Justin Bieber', 'intl', 'm', 'นักร้อง'],
  ['Billie Eilish', 'Billie Eilish', 'intl', 'f', 'นักร้อง'],
  ['Ariana Grande', 'Ariana Grande', 'intl', 'f', 'นักร้อง'],
  ['Bruno Mars', 'Bruno Mars', 'intl', 'm', 'นักร้อง'],
  ['Adele', 'Adele', 'intl', 'f', 'นักร้อง'],
  ['Michael Jackson', 'Michael Jackson', 'intl', 'm', 'นักร้อง'],
  ['Elvis Presley', 'Elvis Presley', 'intl', 'm', 'นักร้อง'],
  ['Freddie Mercury', 'Freddie Mercury', 'intl', 'm', 'นักร้อง'],
  ['John Lennon', 'John Lennon', 'intl', 'm', 'นักร้อง'],
  ['Madonna', 'Madonna', 'intl', 'f', 'นักร้อง'],
  ['Dua Lipa', 'Dua Lipa', 'intl', 'f', 'นักร้อง'],
  ['The Weeknd', 'The Weeknd', 'intl', 'm', 'นักร้อง'],
  ['Harry Styles', 'Harry Styles', 'intl', 'm', 'นักร้อง'],
  ['Shakira', 'Shakira', 'intl', 'f', 'นักร้อง'],
  ['Eminem', 'Eminem', 'intl', 'm', 'นักร้อง'],
  ['Selena Gomez', 'Selena Gomez', 'intl', 'f', 'นักร้อง'],
  ['Katy Perry', 'Katy Perry', 'intl', 'f', 'นักร้อง'],
  // ---- ต่างประเทศ: K-pop / เอเชีย
  ['Jennie (singer)', 'Jennie (BLACKPINK)', 'intl', 'f', 'K-pop'],
  ['Jisoo', 'Jisoo (BLACKPINK)', 'intl', 'f', 'K-pop'],
  ['Rosé (singer)', 'Rosé (BLACKPINK)', 'intl', 'f', 'K-pop'],
  ['V (singer)', 'V (BTS)', 'intl', 'm', 'K-pop'],
  ['Jungkook', 'Jungkook (BTS)', 'intl', 'm', 'K-pop'],
  ['Jimin', 'Jimin (BTS)', 'intl', 'm', 'K-pop'],
  ['RM (rapper)', 'RM (BTS)', 'intl', 'm', 'K-pop'],
  ['IU (singer)', 'IU', 'intl', 'f', 'K-pop'],
  ['Psy (entertainer)', 'PSY', 'intl', 'm', 'K-pop'],
  ['Jackson Wang', 'Jackson Wang', 'intl', 'm', 'K-pop'],
  ['Lee Min-ho', 'Lee Min-ho', 'intl', 'm', 'นักแสดง'],
  ['Song Joong-ki', 'Song Joong-ki', 'intl', 'm', 'นักแสดง'],
  ['Hyun Bin', 'Hyun Bin', 'intl', 'm', 'นักแสดง'],
  ['Gong Yoo', 'Gong Yoo', 'intl', 'm', 'นักแสดง'],
  ['Son Ye-jin', 'Son Ye-jin', 'intl', 'f', 'นักแสดง'],
  ['Jackie Chan', 'Jackie Chan', 'intl', 'm', 'นักแสดง'],
  ['Bruce Lee', 'Bruce Lee', 'intl', 'm', 'นักแสดง'],
  ['Jet Li', 'Jet Li', 'intl', 'm', 'นักแสดง'],
  ['Stephen Chow', 'Stephen Chow', 'intl', 'm', 'นักแสดง'],
  ['Andy Lau', 'Andy Lau', 'intl', 'm', 'นักแสดง'],
  ['Michelle Yeoh', 'Michelle Yeoh', 'intl', 'f', 'นักแสดง'],
  // ---- ต่างประเทศ: นักแสดง
  ['Leonardo DiCaprio', 'Leonardo DiCaprio', 'intl', 'm', 'นักแสดง'],
  ['Tom Cruise', 'Tom Cruise', 'intl', 'm', 'นักแสดง'],
  ['Brad Pitt', 'Brad Pitt', 'intl', 'm', 'นักแสดง'],
  ['Angelina Jolie', 'Angelina Jolie', 'intl', 'f', 'นักแสดง'],
  ['Johnny Depp', 'Johnny Depp', 'intl', 'm', 'นักแสดง'],
  ['Keanu Reeves', 'Keanu Reeves', 'intl', 'm', 'นักแสดง'],
  ['Will Smith', 'Will Smith', 'intl', 'm', 'นักแสดง'],
  ['Dwayne Johnson', 'Dwayne Johnson (The Rock)', 'intl', 'm', 'นักแสดง'],
  ['Robert Downey Jr.', 'Robert Downey Jr.', 'intl', 'm', 'นักแสดง'],
  ['Scarlett Johansson', 'Scarlett Johansson', 'intl', 'f', 'นักแสดง'],
  ['Emma Watson', 'Emma Watson', 'intl', 'f', 'นักแสดง'],
  ['Daniel Radcliffe', 'Daniel Radcliffe', 'intl', 'm', 'นักแสดง'],
  ['Tom Holland', 'Tom Holland', 'intl', 'm', 'นักแสดง'],
  ['Zendaya', 'Zendaya', 'intl', 'f', 'นักแสดง'],
  ['Morgan Freeman', 'Morgan Freeman', 'intl', 'm', 'นักแสดง'],
  ['Meryl Streep', 'Meryl Streep', 'intl', 'f', 'นักแสดง'],
  ['Margot Robbie', 'Margot Robbie', 'intl', 'f', 'นักแสดง'],
  ['Chris Hemsworth', 'Chris Hemsworth', 'intl', 'm', 'นักแสดง'],
  ['Hugh Jackman', 'Hugh Jackman', 'intl', 'm', 'นักแสดง'],
  ['Jennifer Lawrence', 'Jennifer Lawrence', 'intl', 'f', 'นักแสดง'],
  ['Rowan Atkinson', 'Rowan Atkinson (Mr. Bean)', 'intl', 'm', 'นักแสดง'],
  ['Jim Carrey', 'Jim Carrey', 'intl', 'm', 'นักแสดง'],
  ['Charlie Chaplin', 'Charlie Chaplin', 'intl', 'm', 'นักแสดง'],
  ['Marilyn Monroe', 'Marilyn Monroe', 'intl', 'f', 'นักแสดง'],
  ['Audrey Hepburn', 'Audrey Hepburn', 'intl', 'f', 'นักแสดง'],
  ['Arnold Schwarzenegger', 'Arnold Schwarzenegger', 'intl', 'm', 'นักแสดง'],
  ['Jennifer Aniston', 'Jennifer Aniston', 'intl', 'f', 'นักแสดง'],
  ['Natalie Portman', 'Natalie Portman', 'intl', 'f', 'นักแสดง'],
  ['Gal Gadot', 'Gal Gadot', 'intl', 'f', 'นักแสดง'],
  ['Timothée Chalamet', 'Timothée Chalamet', 'intl', 'm', 'นักแสดง'],
  // ---- ต่างประเทศ: นักกีฬา
  ['Lionel Messi', 'Lionel Messi', 'intl', 'm', 'นักกีฬา'],
  ['Cristiano Ronaldo', 'Cristiano Ronaldo', 'intl', 'm', 'นักกีฬา'],
  ['Neymar', 'Neymar', 'intl', 'm', 'นักกีฬา'],
  ['Kylian Mbappé', 'Kylian Mbappé', 'intl', 'm', 'นักกีฬา'],
  ['David Beckham', 'David Beckham', 'intl', 'm', 'นักกีฬา'],
  ['Erling Haaland', 'Erling Haaland', 'intl', 'm', 'นักกีฬา'],
  ['Mohamed Salah', 'Mohamed Salah', 'intl', 'm', 'นักกีฬา'],
  ['Son Heung-min', 'Son Heung-min', 'intl', 'm', 'นักกีฬา'],
  ['Michael Jordan', 'Michael Jordan', 'intl', 'm', 'นักกีฬา'],
  ['LeBron James', 'LeBron James', 'intl', 'm', 'นักกีฬา'],
  ['Stephen Curry', 'Stephen Curry', 'intl', 'm', 'นักกีฬา'],
  ['Usain Bolt', 'Usain Bolt', 'intl', 'm', 'นักกีฬา'],
  ['Serena Williams', 'Serena Williams', 'intl', 'f', 'นักกีฬา'],
  ['Roger Federer', 'Roger Federer', 'intl', 'm', 'นักกีฬา'],
  ['Rafael Nadal', 'Rafael Nadal', 'intl', 'm', 'นักกีฬา'],
  ['Novak Djokovic', 'Novak Djokovic', 'intl', 'm', 'นักกีฬา'],
  ['Tiger Woods', 'Tiger Woods', 'intl', 'm', 'นักกีฬา'],
  ['Muhammad Ali', 'Muhammad Ali', 'intl', 'm', 'นักกีฬา'],
  ['Lewis Hamilton', 'Lewis Hamilton', 'intl', 'm', 'นักกีฬา'],
  ['Maria Sharapova', 'Maria Sharapova', 'intl', 'f', 'นักกีฬา'],
  ['Simone Biles', 'Simone Biles', 'intl', 'f', 'นักกีฬา'],
  ['Naomi Osaka', 'Naomi Osaka', 'intl', 'f', 'นักกีฬา'],
  ['Shohei Ohtani', 'Shohei Ohtani', 'intl', 'm', 'นักกีฬา'],
  ['Kim Yeon-koung', 'Kim Yeon-koung', 'intl', 'f', 'นักกีฬา'],
  // ---- ต่างประเทศ: อื่น ๆ
  ['Elon Musk', 'Elon Musk', 'intl', 'm', 'อื่น ๆ'],
  ['Bill Gates', 'Bill Gates', 'intl', 'm', 'อื่น ๆ'],
  ['Steve Jobs', 'Steve Jobs', 'intl', 'm', 'อื่น ๆ'],
  ['Mark Zuckerberg', 'Mark Zuckerberg', 'intl', 'm', 'อื่น ๆ'],
  ['Jeff Bezos', 'Jeff Bezos', 'intl', 'm', 'อื่น ๆ'],
  ['Albert Einstein', 'Albert Einstein', 'intl', 'm', 'อื่น ๆ'],
  ['Oprah Winfrey', 'Oprah Winfrey', 'intl', 'f', 'อื่น ๆ'],
  ['Kim Kardashian', 'Kim Kardashian', 'intl', 'f', 'อื่น ๆ'],
  ['Gordon Ramsay', 'Gordon Ramsay', 'intl', 'm', 'อื่น ๆ'],
  ['MrBeast', 'MrBeast', 'intl', 'm', 'อื่น ๆ'],
  ['Jack Ma', 'Jack Ma', 'intl', 'm', 'อื่น ๆ'],
  ['Stephen Hawking', 'Stephen Hawking', 'intl', 'm', 'อื่น ๆ'],
  ['Marie Curie', 'Marie Curie', 'intl', 'f', 'อื่น ๆ'],
  ['Malala Yousafzai', 'Malala Yousafzai', 'intl', 'f', 'อื่น ๆ'],
];

const UA = { 'User-Agent': 'party-game-builder/1.0 (contact: apisit)' };
async function query(titles) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|info&inprop=url&piprop=thumbnail|name&pithumbsize=500&titles=' + encodeURIComponent(titles.join('|'));
  const j = await (await fetch(url, { headers: UA })).json();
  const norm = {};
  for (const n of [...(j.query.normalized || []), ...(j.query.redirects || [])]) norm[n.from] = n.to;
  const byTitle = {};
  for (const p of Object.values(j.query.pages)) byTitle[p.title] = p;
  return (t) => {
    let x = t;
    for (let i = 0; i < 3 && norm[x]; i++) x = norm[x];
    return byTitle[x];
  };
}

(async () => {
  const out = [];
  const miss = [];
  for (let i = 0; i < LIST.length; i += 40) {
    const chunk = LIST.slice(i, i + 40);
    const get = await query(chunk.map((x) => x[0]));
    for (const [title, name, group, sex, kind] of chunk) {
      const p = get(title);
      if (!p || p.missing !== undefined || !p.thumbnail) { miss.push(title); continue; }
      const img = p.thumbnail.source.replace(/\?.*$/, '');
      out.push({ name, group, sex, kind, img, file: p.pageimage, page: p.fullurl });
    }
  }
  const dup = new Set();
  const final = out.filter((c) => !dup.has(c.name) && dup.add(c.name));
  const body = `// คนดังสำหรับเกม "ทายคนดัง" — รูปจาก Wikipedia / Wikimedia Commons (สัญญาอนุญาตเสรี ดูเครดิตที่ลิงก์ page)\n// สร้างอัตโนมัติจาก Wikipedia API (thumbnail 500px) · group: th = ไทย, intl = ต่างประเทศ\nmodule.exports = ${JSON.stringify(final.map((c, i) => ({ id: i + 1, ...c })), null, 1)};\n`;
  fs.writeFileSync(OUT, body);
  console.log('ได้', final.length, 'คน · ไทย', final.filter((c) => c.group === 'th').length, '· ต่างประเทศ', final.filter((c) => c.group === 'intl').length);
  console.log('ไม่มีรูป/ไม่พบ:', miss.join(', '));
})();
