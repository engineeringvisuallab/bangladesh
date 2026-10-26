import { bn } from './bn';
export { bn } from './bn';
export type { VoiceId } from './bn';

const DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** ইংরেজি সংখ্যাকে বাংলা অঙ্কে রূপান্তর: "12.5" -> "১২.৫" */
export function bnDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
}

/** সংখ্যা -> বাংলা অঙ্কের লেখা। */
export function bnNum(n: number, decimals = 0): string {
  return bnDigits(n.toFixed(decimals));
}

/** ধনাত্মক/ঋণাত্মক সংখ্যার (যেমন -৪৫) জন্য ঠিক "-" চিহ্ন বজায় রেখে বাংলা অঙ্ক। */
export function bnSigned(n: number, decimals = 0): string {
  return bnDigits(n.toFixed(decimals));
}

/** সেকেন্ড -> "২ মি ১৫ সে" / "৩৫ সে" (বাংলা অঙ্কে)। */
export function bnDuration(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  const m = Math.floor(t / 60), r = t % 60;
  return m > 0 ? `${bnNum(m)} ${bn.trains.board.minute} ${bnNum(r)} ${bn.trains.board.second}` : `${bnNum(r)} ${bn.trains.board.second}`;
}
