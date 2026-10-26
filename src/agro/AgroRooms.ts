// EV Agro Research Institute - the room table. Rectangles are in the building's LOCAL space (metres).
// `face` = direction from the room towards its corridor; `doorAt` = door centre along that wall.
// `topics` is for the later "ask the expert" feature (what the expert in this room can advise on).
import type { PickInfo } from '../mall/MallBuilder';

export interface AgroPick extends PickInfo { action: 'ask' | 'lift' | 'info'; roomId?: string }

export type Theme =
  | 'soil' | 'seed' | 'protect' | 'water' | 'greenhouse' | 'workshop' | 'solar' | 'museum'
  | 'livestock' | 'fish' | 'weather' | 'drone' | 'market' | 'library' | 'auditorium' | 'advisory';

export interface RoomDef {
  id: string; level: 0 | 1; bn: string; en: string; theme: Theme; color: number;
  x0: number; x1: number; z0: number; z1: number;
  face: '+z' | '-z' | '+x' | '-x'; doorAt: number; topics: string[];
  backDoor?: number; // optional second door in the far wall (workshop -> research field)
}

/** The open research field east of the building (shade houses, open plots, pond, parking). */
export const FIELD = { x0: 60, x1: 230, z0: -75, z1: 75 };
export const FIELD_INFO = { id: 'field', bn: 'গবেষণা মাঠ', topics: ['মাঠ পরীক্ষা', 'শেড হাউস চাষ', 'সেচ ও সার', 'ফসলের জাত তুলনা'] };

export const FOOT = { hx: 60, hz: 40, ringX: 46, ringZ: 26, yardX: 40, yardZ: 20, FH: 5, wallH: 4.6 };

export const ROOMS: RoomDef[] = [
  // ---- ground floor ----
  { id: 'soil', level: 0, bn: 'মাটি ও সার গবেষণাগার', en: 'Soil & Fertilizer Lab', theme: 'soil', color: 0xb45309,
    x0: -60, x1: -30, z0: -40, z1: -26, face: '+z', doorAt: -42, topics: ['মাটি পরীক্ষা', 'পিএইচ', 'জৈব ও রাসায়নিক সার'] },
  { id: 'seed', level: 0, bn: 'বীজ গবেষণাগার ও বীজ ব্যাংক', en: 'Seed Lab & Gene Bank', theme: 'seed', color: 0xeab308,
    x0: -30, x1: 0, z0: -40, z1: -26, face: '+z', doorAt: -15, topics: ['উন্নত জাত', 'বীজ সংরক্ষণ', 'অঙ্কুরোদগম'] },
  { id: 'protect', level: 0, bn: 'ফসল রোগ ও কীটপতঙ্গ ল্যাব', en: 'Plant Protection Lab', theme: 'protect', color: 0xdc2626,
    x0: 0, x1: 30, z0: -40, z1: -26, face: '+z', doorAt: 15, topics: ['ফসলের রোগ', 'পোকা দমন', 'জৈব বালাইনাশক'] },
  { id: 'water', level: 0, bn: 'পানি ও সেচ প্রযুক্তি', en: 'Water & Irrigation', theme: 'water', color: 0x0ea5e9,
    x0: 30, x1: 60, z0: -40, z1: -26, face: '+z', doorAt: 42, topics: ['ড্রিপ সেচ', 'সোলার পাম্প', 'পানি সাশ্রয়'] },
  { id: 'greenhouse', level: 0, bn: 'গ্রিনহাউস ও হাইড্রোপনিক্স', en: 'Greenhouse & Hydroponics', theme: 'greenhouse', color: 0x16a34a,
    x0: -60, x1: -46, z0: -26, z1: 26, face: '+x', doorAt: 0, topics: ['হাইড্রোপনিক্স', 'নিয়ন্ত্রিত পরিবেশ', 'সবজি চাষ'] },
  { id: 'workshop', level: 0, bn: 'ইভি কৃষি যন্ত্র কর্মশালা', en: 'EV Farm Machinery Workshop', theme: 'workshop', color: 0xf97316,
    x0: 46, x1: 60, z0: -26, z1: 26, face: '-x', doorAt: 0, backDoor: 0, topics: ['ইলেকট্রিক ট্রাক্টর', 'যন্ত্র রক্ষণাবেক্ষণ', 'ব্যাটারি'] },
  { id: 'solar', level: 0, bn: 'সোলার ও নবায়নযোগ্য শক্তি', en: 'Solar & Renewable Energy', theme: 'solar', color: 0xfacc15,
    x0: -60, x1: -15, z0: 26, z1: 40, face: '-z', doorAt: -30, topics: ['সোলার প্যানেল', 'ব্যাটারি ব্যাকআপ', 'খরচ হিসাব'] },
  { id: 'museum', level: 0, bn: 'ফসল জাদুঘর', en: 'Crop Museum', theme: 'museum', color: 0x84cc16,
    x0: 15, x1: 60, z0: 26, z1: 40, face: '-z', doorAt: 30, topics: ['ধান-গম-ভুট্টা', 'ফসলের ইতিহাস', 'মৌসুম'] },
  // ---- first floor ----
  { id: 'livestock', level: 1, bn: 'পশুপালন ও ডেইরি', en: 'Livestock & Dairy', theme: 'livestock', color: 0xa16207,
    x0: -60, x1: -30, z0: -40, z1: -26, face: '+z', doorAt: -42, topics: ['গরু-ছাগল পালন', 'দুধ উৎপাদন', 'পশুর রোগ'] },
  { id: 'fish', level: 1, bn: 'মৎস্য চাষ গবেষণা', en: 'Fisheries & Aquaculture', theme: 'fish', color: 0x0891b2,
    x0: -30, x1: 0, z0: -40, z1: -26, face: '+z', doorAt: -15, topics: ['পুকুরে মাছ চাষ', 'খাবার ও পানি', 'মাছের রোগ'] },
  { id: 'weather', level: 1, bn: 'আবহাওয়া ও জলবায়ু কেন্দ্র', en: 'Weather & Climate Center', theme: 'weather', color: 0x6366f1,
    x0: 0, x1: 30, z0: -40, z1: -26, face: '+z', doorAt: 15, topics: ['বৃষ্টি ও তাপমাত্রা', 'বন্যা-খরা', 'ফসল ক্যালেন্ডার'] },
  { id: 'drone', level: 1, bn: 'ড্রোন ও স্মার্ট কৃষি', en: 'Drone & Smart Farming', theme: 'drone', color: 0x14b8a6,
    x0: 30, x1: 60, z0: -40, z1: -26, face: '+z', doorAt: 42, topics: ['ড্রোন স্প্রে', 'সেন্সর', 'এআই পরামর্শ'] },
  { id: 'market', level: 1, bn: 'কৃষি বাজার ও অর্থনীতি', en: 'Agri Market & Economics', theme: 'market', color: 0xd946ef,
    x0: -60, x1: -46, z0: -26, z1: 26, face: '+x', doorAt: 0, topics: ['ফসলের দাম', 'বিক্রির উপায়', 'কৃষি ঋণ'] },
  { id: 'library', level: 1, bn: 'কৃষি পাঠাগার', en: 'Agricultural Library', theme: 'library', color: 0x7c3aed,
    x0: 46, x1: 60, z0: -26, z1: 26, face: '-x', doorAt: 0, topics: ['বই ও জার্নাল', 'গবেষণাপত্র', 'চাষ-নির্দেশিকা'] },
  { id: 'auditorium', level: 1, bn: 'প্রশিক্ষণ অডিটোরিয়াম', en: 'Training Auditorium', theme: 'auditorium', color: 0xe11d48,
    x0: -60, x1: -15, z0: 26, z1: 40, face: '-z', doorAt: -30, topics: ['কৃষক প্রশিক্ষণ', 'সেমিনার', 'কর্মশালা'] },
  { id: 'advisory', level: 1, bn: 'কৃষি পরামর্শ কেন্দ্র', en: 'Agri Advisory Center', theme: 'advisory', color: 0x22c55e,
    x0: 15, x1: 60, z0: 26, z1: 40, face: '-z', doorAt: 30, topics: ['যেকোনো কৃষি প্রশ্ন', 'সমস্যা সমাধান', 'বিশেষজ্ঞ পরামর্শ'] },
];
