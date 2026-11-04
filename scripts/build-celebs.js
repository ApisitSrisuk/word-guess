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
  // ---- เพิ่มเติม: ไทย
  ['Prin Suparat', 'มาร์ค ปริญ', 'th', 'm', 'นักแสดง'],
  ['Esther Supreeleela', 'เอสเธอร์ สุปรีย์ลีลา', 'th', 'f', 'นักแสดง'],
  ['Suppasit Jongcheveevat', 'มิว ศุภศิษฏ์', 'th', 'm', 'นักแสดง'],
  ['Tawan Vihokratana', 'เต ตะวัน', 'th', 'm', 'นักแสดง'],
  ['Kanawut Traipipattanapong', 'กลัฟ คณาวุฒิ', 'th', 'm', 'นักแสดง'],
  ['Nattawin Wattanagitiphat', 'อาโป ณัฐวิญญ์', 'th', 'm', 'นักแสดง'],
  ['Phakphum Romsaithong', 'มาย ภาคภูมิ', 'th', 'm', 'นักแสดง'],
  ['Rebecca Patricia Armstrong', 'เบคกี้ รีเบคก้า', 'th', 'f', 'นักแสดง'],
  ['Tontawan Tantivejakul', 'ตู ต้นตะวัน', 'th', 'f', 'นักแสดง'],
  ['Chanon Santinatornkul', 'นนกุล ชานน', 'th', 'm', 'นักแสดง'],
  ['Supassara Thanachart', 'เก้า สุภัสสรา', 'th', 'f', 'นักแสดง'],
  ['Natapohn Tameeruks', 'แต้ว ณฐพร', 'th', 'f', 'นักแสดง'],
  ['Ranee Campen', 'เบลล่า ราณี', 'th', 'f', 'นักแสดง'],
  ['Thanawat Wattanaputi', 'โป๊ป ธนวรรธน์', 'th', 'm', 'นักแสดง'],
  ['Sushar Manaying', 'ออม สุชาร์', 'th', 'f', 'นักแสดง'],
  ['Nittha Jirayungyurn', 'มิว นิษฐา', 'th', 'f', 'นักแสดง'],
  ['Rasri Balenciaga', 'มาร์กี้ ราศรี', 'th', 'f', 'นักแสดง'],
  ['Treechada Petcharat', 'ปอย ตรีชฎา', 'th', 'f', 'นักแสดง'],
  ['Jarinporn Joonkiat', 'เต้ย จรินทร์พร', 'th', 'f', 'นักแสดง'],
  ['James Ma (actor)', 'เจมส์ มาร์', 'th', 'm', 'นักแสดง'],
  ['Puttichai Kasetsin', 'พุฒ พุฒิชัย', 'th', 'm', 'นักแสดง'],
  ['Jesdaporn Pholdee', 'ติ๊ก เจษฎาภรณ์', 'th', 'm', 'นักแสดง'],
  ['Andrew Gregson', 'แอนดริว เกร้กสัน', 'th', 'm', 'นักแสดง'],
  ['Metinee Kingpayome', 'ลูกเกด เมทินี', 'th', 'f', 'นักแสดง'],
  ['Cindy Bishop', 'ซินดี้ บิชอพ', 'th', 'f', 'นักแสดง'],
  ['Patcharapa Chaichua', 'อั้ม พัชราภา', 'th', 'f', 'นักแสดง'],
  ['Pakin Kunaanuwit', 'โตโน่ ภาคิน', 'th', 'm', 'นักร้อง'],
  ['Perawat Sangpotirat', 'คริส พีรวัส', 'th', 'm', 'นักแสดง'],
  ['Prachaya Ruangroj', 'สิงโต ปราชญา', 'th', 'm', 'นักแสดง'],
  ['Jumpol Adulkittiporn', 'ออฟ จุมพล', 'th', 'm', 'นักแสดง'],
  ['Atthaphan Phunsawat', 'กัน อรรถพันธ์', 'th', 'm', 'นักแสดง'],
  ['Korapat Kirdpan', 'นนน กรภัทร์', 'th', 'm', 'นักแสดง'],
  ['Pawat Chittsawangdee', 'โอม ภวัต', 'th', 'm', 'นักแสดง'],
  ['Chawarin Perdpiriyawong', 'นุนิว ชวรินทร์', 'th', 'm', 'นักร้อง'],
  ['Sukrit Wisetkaew', 'บี้ สุกฤษฎิ์', 'th', 'm', 'นักร้อง'],
  ['Artiwara Kongmalai', 'ตูน บอดี้สแลม', 'th', 'm', 'นักร้อง'],
  ['Nat Sakdatorn', 'แนท ศักดาทร', 'th', 'm', 'นักร้อง'],
  ['Joey Boy', 'โจอี้ บอย', 'th', 'm', 'นักร้อง'],
  ['Violette Wautier', 'วี วิโอเลต', 'th', 'f', 'นักร้อง'],
  ['Waruntorn Paonil', 'อิ้งค์ วรันธร', 'th', 'f', 'นักร้อง'],
  ['Apiwat Ueathavornsuk', 'แสตมป์ อภิวัชร์', 'th', 'm', 'นักร้อง'],
  ['Chanakan Pumphanmuang', 'อะตอม ชนกันต์', 'th', 'm', 'นักร้อง'],
  ['Lula (singer)', 'ลุลา', 'th', 'f', 'นักร้อง'],
  ['Kawin Thamsatchanan', 'กวินทร์ ธรรมสัจจานันท์', 'th', 'm', 'นักกีฬา'],
  ['Theerathon Bunmathan', 'ธีราทร บุญมาทัน', 'th', 'm', 'นักกีฬา'],
  ['Nualphan Lamsam', 'มาดามแป้ง นวลพรรณ', 'th', 'f', 'อื่น ๆ'],
  ['Chanettee Wannasaen', 'ชเนตตี วรรณแสน', 'th', 'f', 'นักกีฬา'],
  ['Tanaporn Prakaithong', 'ธนพร ประกายทอง', 'th', 'f', 'นักกีฬา'],
  ['Sasha Bou', 'ซาช่า', 'th', 'f', 'อื่น ๆ'],
  // ---- เพิ่มเติม: ต่างประเทศ
  ['Olivia Rodrigo', 'Olivia Rodrigo', 'intl', 'f', 'นักร้อง'],
  ['Sabrina Carpenter', 'Sabrina Carpenter', 'intl', 'f', 'นักร้อง'],
  ['Doja Cat', 'Doja Cat', 'intl', 'f', 'นักร้อง'],
  ['Post Malone', 'Post Malone', 'intl', 'm', 'นักร้อง'],
  ['Drake (musician)', 'Drake', 'intl', 'm', 'นักร้อง'],
  ['Snoop Dogg', 'Snoop Dogg', 'intl', 'm', 'นักร้อง'],
  ['Celine Dion', 'Celine Dion', 'intl', 'f', 'นักร้อง'],
  ['Mariah Carey', 'Mariah Carey', 'intl', 'f', 'นักร้อง'],
  ['Whitney Houston', 'Whitney Houston', 'intl', 'f', 'นักร้อง'],
  ['Britney Spears', 'Britney Spears', 'intl', 'f', 'นักร้อง'],
  ['Jennifer Lopez', 'Jennifer Lopez', 'intl', 'f', 'นักร้อง'],
  ['Chris Martin', 'Chris Martin (Coldplay)', 'intl', 'm', 'นักร้อง'],
  ['Shawn Mendes', 'Shawn Mendes', 'intl', 'm', 'นักร้อง'],
  ['Charlie Puth', 'Charlie Puth', 'intl', 'm', 'นักร้อง'],
  ['Jin (singer)', 'Jin (BTS)', 'intl', 'm', 'K-pop'],
  ['Suga (rapper)', 'Suga (BTS)', 'intl', 'm', 'K-pop'],
  ['J-Hope', 'J-Hope (BTS)', 'intl', 'm', 'K-pop'],
  ['Karina (singer)', 'Karina (aespa)', 'intl', 'f', 'K-pop'],
  ['Winter (singer)', 'Winter (aespa)', 'intl', 'f', 'K-pop'],
  ['Jang Won-young', 'Jang Won-young', 'intl', 'f', 'K-pop'],
  ['G-Dragon', 'G-Dragon', 'intl', 'm', 'K-pop'],
  ['Cha Eun-woo', 'Cha Eun-woo', 'intl', 'm', 'K-pop'],
  ['Park Bo-gum', 'Park Bo-gum', 'intl', 'm', 'นักแสดง'],
  ['Kim Soo-hyun', 'Kim Soo-hyun', 'intl', 'm', 'นักแสดง'],
  ['Song Hye-kyo', 'Song Hye-kyo', 'intl', 'f', 'นักแสดง'],
  ['Jun Ji-hyun', 'Jun Ji-hyun', 'intl', 'f', 'นักแสดง'],
  ['Lee Jong-suk', 'Lee Jong-suk', 'intl', 'm', 'นักแสดง'],
  ['Kim Go-eun', 'Kim Go-eun', 'intl', 'f', 'นักแสดง'],
  ['Xiao Zhan', 'Xiao Zhan', 'intl', 'm', 'นักแสดง'],
  ['Wang Yibo', 'Wang Yibo', 'intl', 'm', 'นักแสดง'],
  ['Dilraba Dilmurat', 'Dilraba Dilmurat', 'intl', 'f', 'นักแสดง'],
  ['Yang Mi', 'Yang Mi', 'intl', 'f', 'นักแสดง'],
  ['Zhao Lusi', 'Zhao Lusi', 'intl', 'f', 'นักแสดง'],
  ['Tony Leung Chiu-wai', 'Tony Leung', 'intl', 'm', 'นักแสดง'],
  ['Chow Yun-fat', 'Chow Yun-fat', 'intl', 'm', 'นักแสดง'],
  ['Donnie Yen', 'Donnie Yen', 'intl', 'm', 'นักแสดง'],
  ['Takeshi Kaneshiro', 'Takeshi Kaneshiro', 'intl', 'm', 'นักแสดง'],
  ['Ken Watanabe', 'Ken Watanabe', 'intl', 'm', 'นักแสดง'],
  ['Shah Rukh Khan', 'Shah Rukh Khan', 'intl', 'm', 'นักแสดง'],
  ['Priyanka Chopra', 'Priyanka Chopra', 'intl', 'f', 'นักแสดง'],
  ['Pedro Pascal', 'Pedro Pascal', 'intl', 'm', 'นักแสดง'],
  ['Ryan Reynolds', 'Ryan Reynolds', 'intl', 'm', 'นักแสดง'],
  ['Ryan Gosling', 'Ryan Gosling', 'intl', 'm', 'นักแสดง'],
  ['Chris Evans', 'Chris Evans', 'intl', 'm', 'นักแสดง'],
  ['Chris Pratt', 'Chris Pratt', 'intl', 'm', 'นักแสดง'],
  ['Mark Ruffalo', 'Mark Ruffalo', 'intl', 'm', 'นักแสดง'],
  ['Benedict Cumberbatch', 'Benedict Cumberbatch', 'intl', 'm', 'นักแสดง'],
  ['Tom Hanks', 'Tom Hanks', 'intl', 'm', 'นักแสดง'],
  ['Denzel Washington', 'Denzel Washington', 'intl', 'm', 'นักแสดง'],
  ['Samuel L. Jackson', 'Samuel L. Jackson', 'intl', 'm', 'นักแสดง'],
  ['Nicole Kidman', 'Nicole Kidman', 'intl', 'f', 'นักแสดง'],
  ['Julia Roberts', 'Julia Roberts', 'intl', 'f', 'นักแสดง'],
  ['Sandra Bullock', 'Sandra Bullock', 'intl', 'f', 'นักแสดง'],
  ['Anne Hathaway', 'Anne Hathaway', 'intl', 'f', 'นักแสดง'],
  ['Emma Stone', 'Emma Stone', 'intl', 'f', 'นักแสดง'],
  ['Robert Pattinson', 'Robert Pattinson', 'intl', 'm', 'นักแสดง'],
  ['Kristen Stewart', 'Kristen Stewart', 'intl', 'f', 'นักแสดง'],
  ['Vin Diesel', 'Vin Diesel', 'intl', 'm', 'นักแสดง'],
  ['Jason Statham', 'Jason Statham', 'intl', 'm', 'นักแสดง'],
  ['Sylvester Stallone', 'Sylvester Stallone', 'intl', 'm', 'นักแสดง'],
  ['Henry Cavill', 'Henry Cavill', 'intl', 'm', 'นักแสดง'],
  ['Cillian Murphy', 'Cillian Murphy', 'intl', 'm', 'นักแสดง'],
  ['Florence Pugh', 'Florence Pugh', 'intl', 'f', 'นักแสดง'],
  ['Millie Bobby Brown', 'Millie Bobby Brown', 'intl', 'f', 'นักแสดง'],
  ['Jenna Ortega', 'Jenna Ortega', 'intl', 'f', 'นักแสดง'],
  ['Anya Taylor-Joy', 'Anya Taylor-Joy', 'intl', 'f', 'นักแสดง'],
  ['Kevin Hart', 'Kevin Hart', 'intl', 'm', 'นักแสดง'],
  ['Eddie Murphy', 'Eddie Murphy', 'intl', 'm', 'นักแสดง'],
  ['Kevin De Bruyne', 'Kevin De Bruyne', 'intl', 'm', 'นักกีฬา'],
  ['Luka Modrić', 'Luka Modrić', 'intl', 'm', 'นักกีฬา'],
  ['Robert Lewandowski', 'Robert Lewandowski', 'intl', 'm', 'นักกีฬา'],
  ['Harry Kane', 'Harry Kane', 'intl', 'm', 'นักกีฬา'],
  ['Zlatan Ibrahimović', 'Zlatan Ibrahimović', 'intl', 'm', 'นักกีฬา'],
  ['Ronaldinho', 'Ronaldinho', 'intl', 'm', 'นักกีฬา'],
  ['Pelé', 'Pelé', 'intl', 'm', 'นักกีฬา'],
  ['Diego Maradona', 'Diego Maradona', 'intl', 'm', 'นักกีฬา'],
  ['Zinedine Zidane', 'Zinedine Zidane', 'intl', 'm', 'นักกีฬา'],
  ['Thierry Henry', 'Thierry Henry', 'intl', 'm', 'นักกีฬา'],
  ['Wayne Rooney', 'Wayne Rooney', 'intl', 'm', 'นักกีฬา'],
  ['Steven Gerrard', 'Steven Gerrard', 'intl', 'm', 'นักกีฬา'],
  ['Virgil van Dijk', 'Virgil van Dijk', 'intl', 'm', 'นักกีฬา'],
  ['Jude Bellingham', 'Jude Bellingham', 'intl', 'm', 'นักกีฬา'],
  ['Vinícius Júnior', 'Vinícius Júnior', 'intl', 'm', 'นักกีฬา'],
  ['Lamine Yamal', 'Lamine Yamal', 'intl', 'm', 'นักกีฬา'],
  ['Kobe Bryant', 'Kobe Bryant', 'intl', 'm', 'นักกีฬา'],
  ["Shaquille O'Neal", "Shaquille O'Neal", 'intl', 'm', 'นักกีฬา'],
  ['Victor Wembanyama', 'Victor Wembanyama', 'intl', 'm', 'นักกีฬา'],
  ['Carlos Alcaraz', 'Carlos Alcaraz', 'intl', 'm', 'นักกีฬา'],
  ['Jannik Sinner', 'Jannik Sinner', 'intl', 'm', 'นักกีฬา'],
  ['Max Verstappen', 'Max Verstappen', 'intl', 'm', 'นักกีฬา'],
  ['Michael Schumacher', 'Michael Schumacher', 'intl', 'm', 'นักกีฬา'],
  ['Valentino Rossi', 'Valentino Rossi', 'intl', 'm', 'นักกีฬา'],
  ['Manny Pacquiao', 'Manny Pacquiao', 'intl', 'm', 'นักกีฬา'],
  ['Floyd Mayweather Jr.', 'Floyd Mayweather Jr.', 'intl', 'm', 'นักกีฬา'],
  ['Conor McGregor', 'Conor McGregor', 'intl', 'm', 'นักกีฬา'],
  ['Mike Tyson', 'Mike Tyson', 'intl', 'm', 'นักกีฬา'],
  ['Lin Dan', 'Lin Dan', 'intl', 'm', 'นักกีฬา'],
  ['Viktor Axelsen', 'Viktor Axelsen', 'intl', 'm', 'นักกีฬา'],
  ['An Se-young', 'An Se-young', 'intl', 'f', 'นักกีฬา'],
  ['Coco Gauff', 'Coco Gauff', 'intl', 'f', 'นักกีฬา'],
  ['Nikola Tesla', 'Nikola Tesla', 'intl', 'm', 'อื่น ๆ'],
  ['Walt Disney', 'Walt Disney', 'intl', 'm', 'อื่น ๆ'],
  ['Warren Buffett', 'Warren Buffett', 'intl', 'm', 'อื่น ๆ'],
  ['Tim Cook', 'Tim Cook', 'intl', 'm', 'อื่น ๆ'],
  ['Jensen Huang', 'Jensen Huang', 'intl', 'm', 'อื่น ๆ'],
  ['Sam Altman', 'Sam Altman', 'intl', 'm', 'อื่น ๆ'],
  ['Sundar Pichai', 'Sundar Pichai', 'intl', 'm', 'อื่น ๆ'],
  ['Martha Stewart', 'Martha Stewart', 'intl', 'f', 'อื่น ๆ'],
  ['Paris Hilton', 'Paris Hilton', 'intl', 'f', 'อื่น ๆ'],
  ['Kylie Jenner', 'Kylie Jenner', 'intl', 'f', 'อื่น ๆ'],
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

// รูปเพิ่มเติมจากหน้าเดียวกัน: ไฟล์ที่มีชื่อเต็มของคนนั้น ไม่ใช่รูปหมู่ (ไม่มี and/vs) เป็นรูปถ่ายแนวตั้ง/จัตุรัส (มักเป็นรูปหน้า) — ได้คนละไม่เกิน 4 รูป
const SKIP = /\band\b|\bvs\b|\bv\b|&|with|tussauds|mugshot|shirt|maillot|park|court|walk of fame|signature|autograph|logo|poster|cover|album|map|flag|stadium|award|trophy|chart|diagram|statue|wax|grave|tomb|house|car\b|team|squad|crowd|stage|concert|tour|svg/i;
async function extraImages(title, mainFile) {
  const tokens = title.replace(/\(.*\)/, '').split(/[\s.-]+/).filter((w) => w.length >= 3).map((w) => w.toLowerCase());
  const j1 = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=images&imlimit=100&titles=' + encodeURIComponent(title), { headers: UA })).json();
  const files = Object.values(j1.query.pages).flatMap((p) => (p.images || []).map((x) => x.title))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !SKIP.test(f.replace(/_/g, ' ')) && f.replace(/_/g, ' ') !== 'File:' + String(mainFile || '').replace(/_/g, ' '))
    .filter((f) => tokens.every((t) => f.toLowerCase().replace(/_/g, ' ').includes(t))) // ต้องมีชื่อเต็มของคนนั้น (กันรูปคนอื่น)
    .slice(0, 12);
  if (!files.length) return [];
  const j2 = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=500&titles=' + encodeURIComponent(files.join('|')), { headers: UA })).json();
  return Object.values(j2.query.pages)
    .map((p) => p.imageinfo && p.imageinfo[0])
    .filter((ii) => ii && ii.thumburl && ii.height >= ii.width * 0.95 && ii.width >= 250)
    .map((ii) => ii.thumburl.replace(/\?.*$/, ''))
    .slice(0, 3);
}
async function retry(fn, n = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= n) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
}

(async () => {
  const out = [];
  const miss = [];
  for (let i = 0; i < LIST.length; i += 40) {
    const chunk = LIST.slice(i, i + 40);
    const get = await retry(() => query(chunk.map((x) => x[0])));
    for (const [title, name, group, sex, kind] of chunk) {
      const p = get(title);
      if (!p || p.missing !== undefined || !p.thumbnail) { miss.push(title); continue; }
      out.push({ title: p.title, name, group, sex, kind, img: p.thumbnail.source.replace(/\?.*$/, ''), file: p.pageimage, page: p.fullurl });
    }
  }
  const dup = new Set();
  const final = out.filter((c) => !dup.has(c.name) && dup.add(c.name));
  // ดึงรูปเพิ่ม ทีละ 6 คนพร้อมกัน
  for (let i = 0; i < final.length; i += 6) {
    await Promise.all(final.slice(i, i + 6).map(async (c) => {
      const more = await retry(() => extraImages(c.title, c.file)).catch(() => []);
      c.imgs = [c.img, ...more.filter((u) => u !== c.img)];
    }));
    process.stdout.write('.');
  }
  const rows = final.map((c, i) => ({ id: i + 1, name: c.name, group: c.group, sex: c.sex, kind: c.kind, imgs: c.imgs, page: c.page }));
  const body = `// คนดังสำหรับเกม "ทายคนดัง" — รูปจาก Wikipedia / Wikimedia Commons (สัญญาอนุญาตเสรี ดูเครดิตที่ลิงก์ page)\n// สร้างอัตโนมัติด้วย scripts/build-celebs.js · group: th = ไทย, intl = ต่างประเทศ · imgs: รูปของคนนั้น (สุ่มใช้)\nmodule.exports = ${JSON.stringify(rows, null, 1)};\n`;
  fs.writeFileSync(OUT, body);
  const imgs = rows.reduce((n, c) => n + c.imgs.length, 0);
  console.log('\nได้', rows.length, 'คน · ไทย', rows.filter((c) => c.group === 'th').length, '· ต่างประเทศ', rows.filter((c) => c.group === 'intl').length, '· รูปทั้งหมด', imgs);
  console.log('ไม่มีรูป/ไม่พบ:', miss.join(', '));
})();
