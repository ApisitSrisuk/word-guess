// โหวตเตะคนออกจากห้อง (เสียงข้างมาก) — ใช้ได้ทุกเกม เพิ่มความสามารถให้ Room
// - ใครก็ได้เสนอเตะคนอื่น (คนเสนอ = เห็นด้วย 1 เสียงอัตโนมัติ) · โหวตได้ทีละเรื่อง
// - คนที่โหวตได้ = ทุกคนที่ออนไลน์ยกเว้นคนที่ถูกเสนอเตะ
// - เห็นด้วย "เกินครึ่ง" ของคนที่โหวตได้ และอย่างน้อย 2 เสียง (ต้องมีคนอื่นเห็นด้วยนอกจากคนเสนอ) = เตะ · ไม่มีทางเกินครึ่งแล้ว หรือหมดเวลา = ตก
// - คนที่ถูกเตะ (เช่น AFK) กลับเข้าห้องใหม่ได้ตามปกติ
const KICK_MS = Number(process.env.KICK_MS) || 30000;
const MIN_PLAYERS = 3;

function install(Room) {
  const P = Room.prototype;

  P.kickVoters = function () {
    const k = this.kick;
    return [...this.players.values()].filter((p) => p.connected && (!k || p.id !== k.target)).map((p) => p.id);
  };

  // ต้องได้เสียงเห็นด้วยเกินครึ่ง และไม่น้อยกว่า 2 (กันเสนอคนเดียวแล้วเตะได้ทันทีตอนคนอื่นหลุด/AFK)
  const needOf = (n) => Math.max(2, Math.floor(n / 2) + 1);

  P.kickStart = function (by, target) {
    if (this.kick) throw new Error('มีการโหวตเตะอยู่แล้ว รอให้จบก่อน');
    const t = this.players.get(target);
    if (!t) throw new Error('ไม่พบผู้เล่นคนนี้');
    if (target === by) throw new Error('เตะตัวเองไม่ได้ ใช้ปุ่มออกจากห้องแทน');
    if (this.players.size < MIN_PLAYERS) throw new Error(`ต้องมีคนในห้องอย่างน้อย ${MIN_PLAYERS} คนถึงจะโหวตเตะได้`);
    this.kickSeq = (this.kickSeq || 0) + 1;
    this.kick = { id: this.kickSeq, target, by, yes: new Set([by]), no: new Set(), endsAt: Date.now() + KICK_MS };
    if (this.kickVoters().length < 2) {
      this.kick = null;
      throw new Error('ต้องมีคนออนไลน์ที่โหวตได้อย่างน้อย 2 คน (ไม่นับคนที่จะถูกเตะ)');
    }
  };

  P.kickVote = function (id, yes) {
    const k = this.kick;
    if (!k) throw new Error('ไม่มีการโหวตเตะตอนนี้');
    if (id === k.target) throw new Error('คุณโหวตเรื่องนี้ไม่ได้');
    if (!this.players.has(id)) throw new Error('ไม่ได้อยู่ในห้อง');
    k.yes.delete(id);
    k.no.delete(id);
    (yes ? k.yes : k.no).add(id);
  };

  // นับผล (เซิร์ฟเวอร์เรียกทุกครั้งก่อน broadcast) → 'pass' (เตะ) / 'fail' (ตก) / 'gone' (คนนั้นออกไปเอง) / null (ยังไม่จบ) — จบแล้วล้างการโหวตทิ้ง
  P.kickCheck = function (expired = false) {
    const k = this.kick;
    if (!k) return null;
    if (!this.players.has(k.target)) return (this.kick = null), 'gone';
    const voters = this.kickVoters();
    const need = needOf(voters.length);
    const yes = voters.filter((x) => k.yes.has(x)).length;
    const no = voters.filter((x) => k.no.has(x)).length;
    let res = null;
    if (yes >= need) res = 'pass';
    else if (expired || voters.length - no < need) res = 'fail';
    if (res) {
      this.kickLast = { target: k.target, name: this.players.get(k.target).name, result: res };
      this.kick = null;
    }
    return res;
  };

  P.kickExpire = function () {
    return this.kickCheck(true);
  };

  P.kickView = function (id) {
    const k = this.kick;
    if (!k) return null;
    const voters = this.kickVoters();
    const nameOf = (x) => (this.players.get(x) || {}).name || '?';
    return {
      id: k.id,
      target: k.target,
      targetName: nameOf(k.target),
      by: k.by,
      byName: nameOf(k.by),
      yes: voters.filter((x) => k.yes.has(x)).length,
      no: voters.filter((x) => k.no.has(x)).length,
      need: needOf(voters.length),
      voters: voters.length,
      canVote: voters.includes(id),
      myVote: k.yes.has(id) ? 'yes' : k.no.has(id) ? 'no' : null,
      remainingMs: Math.max(0, k.endsAt - Date.now()),
    };
  };
}

module.exports = { install, KICK_MS, MIN_PLAYERS };
