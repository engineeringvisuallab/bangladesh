// City Mall - 2 floors (8 shops on the ground floor, 4 upstairs): categories, products and the link to the live e-commerce website. Floors 2..4 below are not built (spare categories).
export type ProductKind =
  | 'car' | 'bike' | 'battery' | 'charger' | 'solar' | 'motor' | 'tyre' | 'helmet'
  | 'shirt' | 'shoe' | 'bag' | 'watch' | 'phone' | 'laptop' | 'tv' | 'headphone' | 'sofa' | 'lamp' | 'pot' | 'toy' | 'book' | 'ball' | 'box' | 'bottle' | 'cake';

/** floor: 0 = ground floor ... 4 = top floor. */
export interface Category { id: string; bn: string; en: string; color: number; kind: ProductKind; floor: number }
export interface Product {
  id: string; categoryId: string; name: string; price: number; kind: ProductKind; color: number;
  slug: string; url?: string; // url (if given) overrides the template below
}
export interface Catalog { categories: Category[]; products: Product[] }

/** ★ ONLY THING TO EDIT to connect the real shop ★ */
export const SHOP_LINK = {
  baseUrl: 'https://your-shop.example.com',   // <- your live e-commerce website
  productPath: '/product/{slug}',             // {slug} or {id} are replaced
  categoryPath: '/category/{id}',             // "সব পণ্য দেখুন" board in each shop
  apiUrl: '',                                 // e.g. 'https://your-shop.example.com/api/products' ('' = demo products)
  utm: 'utm_source=city_mall&utm_medium=game',
};

export const FLOORS: { bn: string; en: string; dept: string; deptEn: string }[] = [
  { bn: 'নিচতলা', en: 'Ground Floor', dept: 'সুপারমার্কেট ও খাবার', deptEn: 'Supermarket & Food' },
  { bn: '১ম তলা', en: '1st Floor', dept: 'ফ্যাশন', deptEn: 'Fashion' },
  { bn: '২য় তলা', en: '2nd Floor', dept: 'ইলেকট্রনিক্স', deptEn: 'Electronics' },
  { bn: '৩য় তলা', en: '3rd Floor', dept: 'হোম ও লিভিং', deptEn: 'Home & Living' },
  { bn: '৪র্থ তলা', en: '4th Floor', dept: 'শিশু, বই ও খেলা', deptEn: 'Kids, Books & Fun' },
];

export const CATEGORIES: Category[] = [
  { id: 'fruits', bn: 'ফল ও সবজি', en: "Fruits & Veg", color: 0x84cc16, kind: 'box', floor: 0 },
  { id: 'bakery', bn: 'বেকারি', en: "Bakery", color: 0xf59e0b, kind: 'cake', floor: 0 },
  { id: 'drinks', bn: 'পানীয়', en: "Drinks", color: 0x22d3ee, kind: 'bottle', floor: 0 },
  { id: 'snacks', bn: 'স্ন্যাকস', en: "Snacks", color: 0xef4444, kind: 'box', floor: 0 },
  { id: 'dairy', bn: 'দুধ ও ডিম', en: "Dairy & Eggs", color: 0xe2e8f0, kind: 'bottle', floor: 0 },
  { id: 'grain', bn: 'চাল-ডাল', en: "Rice & Grains", color: 0xd4a017, kind: 'box', floor: 0 },
  { id: 'sweets', bn: 'মিষ্টি ও চকলেট', en: "Sweets", color: 0xa855f7, kind: 'cake', floor: 0 },
  { id: 'daily', bn: 'প্রতিদিনের জিনিস', en: "Daily Needs", color: 0x3b82f6, kind: 'bottle', floor: 0 },
  { id: 'mens', bn: 'পুরুষের পোশাক', en: "Men's Wear", color: 0x3b82f6, kind: 'shirt', floor: 1 },
  { id: 'womens', bn: 'নারীর পোশাক', en: "Women's Wear", color: 0xf472b6, kind: 'shirt', floor: 1 },
  { id: 'kidswear', bn: 'শিশুদের পোশাক', en: "Kids Wear", color: 0xfacc15, kind: 'shirt', floor: 1 },
  { id: 'shoes', bn: 'জুতা', en: "Shoes", color: 0x92400e, kind: 'shoe', floor: 1 },
  { id: 'bags', bn: 'ব্যাগ', en: "Bags", color: 0xa855f7, kind: 'bag', floor: 1 },
  { id: 'watches', bn: 'ঘড়ি', en: "Watches", color: 0x64748b, kind: 'watch', floor: 1 },
  { id: 'jewel', bn: 'গয়না', en: "Jewellery", color: 0xfacc15, kind: 'watch', floor: 1 },
  { id: 'sport', bn: 'স্পোর্টসওয়্যার', en: "Sportswear", color: 0xef4444, kind: 'shirt', floor: 1 },
  { id: 'mobiles', bn: 'মোবাইল', en: "Mobiles", color: 0x3b82f6, kind: 'phone', floor: 2 },
  { id: 'laptops', bn: 'ল্যাপটপ', en: "Laptops", color: 0x64748b, kind: 'laptop', floor: 2 },
  { id: 'tvs', bn: 'টিভি ও সাউন্ড', en: "TV & Audio", color: 0x0f172a, kind: 'tv', floor: 2 },
  { id: 'audio', bn: 'হেডফোন', en: "Headphones", color: 0xef4444, kind: 'headphone', floor: 2 },
  { id: 'cameras', bn: 'ক্যামেরা', en: "Cameras", color: 0x8b5cf6, kind: 'laptop', floor: 2 },
  { id: 'gaming', bn: 'গেমিং', en: "Gaming", color: 0x22c55e, kind: 'toy', floor: 2 },
  { id: 'appl', bn: 'হোম অ্যাপ্লায়েন্স', en: "Appliances", color: 0x22d3ee, kind: 'pot', floor: 2 },
  { id: 'smart', bn: 'স্মার্ট হোম', en: "Smart Home", color: 0xfacc15, kind: 'lamp', floor: 2 },
  { id: 'sofa', bn: 'সোফা ও ফার্নিচার', en: "Sofa & Furniture", color: 0x92400e, kind: 'sofa', floor: 3 },
  { id: 'beds', bn: 'বিছানা', en: "Beds & Mattress", color: 0x6366f1, kind: 'sofa', floor: 3 },
  { id: 'kitchen', bn: 'রান্নাঘর', en: "Kitchenware", color: 0xef4444, kind: 'pot', floor: 3 },
  { id: 'light', bn: 'লাইটিং', en: "Lighting", color: 0xfacc15, kind: 'lamp', floor: 3 },
  { id: 'decor', bn: 'হোম ডেকর', en: "Home Decor", color: 0xf472b6, kind: 'lamp', floor: 3 },
  { id: 'dinner', bn: 'ডিনারওয়্যার', en: "Dinnerware", color: 0x22d3ee, kind: 'pot', floor: 3 },
  { id: 'bedding', bn: 'বিছানার চাদর', en: "Bedding", color: 0xa855f7, kind: 'box', floor: 3 },
  { id: 'garden', bn: 'বাগান', en: "Garden", color: 0x22c55e, kind: 'pot', floor: 3 },
  { id: 'toys', bn: 'খেলনা', en: "Toys", color: 0xf472b6, kind: 'toy', floor: 4 },
  { id: 'books', bn: 'বই', en: "Books", color: 0x3b82f6, kind: 'book', floor: 4 },
  { id: 'stationery', bn: 'স্টেশনারি', en: "Stationery", color: 0xfacc15, kind: 'book', floor: 4 },
  { id: 'sports', bn: 'খেলাধুলা', en: "Sports", color: 0x22c55e, kind: 'ball', floor: 4 },
  { id: 'bikes', bn: 'সাইকেল', en: "Cycles", color: 0x84cc16, kind: 'bike', floor: 4 },
  { id: 'games', bn: 'বোর্ড গেম', en: "Board Games", color: 0xa855f7, kind: 'toy', floor: 4 },
  { id: 'music', bn: 'বাদ্যযন্ত্র', en: "Music", color: 0xef4444, kind: 'ball', floor: 4 },
  { id: 'gifts', bn: 'গিফট শপ', en: "Gift Shop", color: 0xfb7185, kind: 'box', floor: 4 },
];

// [name, price BDT, colour]
const DEMO: Record<string, [string, number, number][]> = {
  fruits: [['Mango Box 5kg', 1200, 0xf59e0b], ['Fresh Veg Crate', 650, 0x22c55e], ['Apple Pack 2kg', 520, 0xef4444]],
  bakery: [['Birthday Cake 1kg', 1400, 0xf472b6], ['Butter Croissant', 90, 0xd97706], ['Fruit Cake', 650, 0xa855f7]],
  drinks: [['Orange Juice 1L', 160, 0xf97316], ['Mineral Water 5L', 90, 0x38bdf8], ['Cold Coffee', 120, 0x92400e]],
  snacks: [['Chips Family Pack', 80, 0xef4444], ['Biscuit Box', 150, 0x3b82f6], ['Nut Mix 500g', 480, 0xd97706]],
  dairy: [['Fresh Milk 1L', 110, 0xf1f5f9], ['Egg Tray 30pcs', 420, 0xfde68a], ['Yogurt Pack', 180, 0xf9a8d4]],
  grain: [['Miniket Rice 25kg', 1900, 0xfde047], ['Lentil 5kg', 720, 0xf59e0b], ['Atta 10kg', 560, 0xe7e5e4]],
  sweets: [['Rasgulla Box', 450, 0xf8fafc], ['Chocolate Box', 900, 0x78350f], ['Dates Pack', 380, 0x57534e]],
  daily: [['Detergent 2kg', 380, 0x3b82f6], ['Hand Wash', 140, 0x22c55e], ['Cooking Oil 5L', 950, 0xfacc15]],
  mens: [['Cotton Panjabi', 2200, 0x1d4ed8], ['Formal Shirt', 1800, 0xe2e8f0], ['Denim Jacket', 3200, 0x475569]],
  womens: [['Silk Saree', 6500, 0xdc2626], ['Salwar Set', 3400, 0x16a34a], ['Winter Shawl', 1900, 0xa855f7]],
  kidswear: [['Kids T-Shirt', 650, 0xfacc15], ['Party Frock', 1500, 0xf472b6], ['School Uniform', 1100, 0x3b82f6]],
  shoes: [['Leather Loafer', 3400, 0x78350f], ['Running Shoes', 4200, 0xef4444], ['Kolhapuri Sandal', 1200, 0xd97706]],
  bags: [['Leather Handbag', 4800, 0x92400e], ['Laptop Backpack', 2600, 0x1e293b], ['Travel Trolley', 7500, 0x2563eb]],
  watches: [['Classic Watch', 5200, 0x94a3b8], ['Smart Watch', 8900, 0x0f172a], ['Ladies Watch', 4300, 0xf59e0b]],
  jewel: [['Gold Plated Set', 9500, 0xfacc15], ['Silver Ring', 2400, 0xcbd5e1], ['Pearl Necklace', 6800, 0xf8fafc]],
  sport: [['Jersey Set', 1400, 0x16a34a], ['Track Pants', 1300, 0x1e293b], ['Gym Tank', 700, 0xef4444]],
  mobiles: [['Galaxy-Style A5', 32000, 0x1e293b], ['Pixel-Style 9', 68000, 0xe2e8f0], ['Budget Phone X', 14500, 0x3b82f6]],
  laptops: [['Ultrabook 14"', 89000, 0x94a3b8], ['Gaming Laptop 16"', 145000, 0x111827], ['Student Laptop', 48000, 0x3b82f6]],
  tvs: [['Smart TV 55"', 72000, 0x111827], ['Soundbar 2.1', 14500, 0x1e293b], ['LED TV 32"', 24500, 0x0f172a]],
  audio: [['Wireless Headphone', 7800, 0xef4444], ['Earbuds Pro', 5600, 0xf8fafc], ['Gaming Headset', 4900, 0x22c55e]],
  cameras: [['Mirrorless Camera', 98000, 0x1e293b], ['Action Camera', 22000, 0xef4444], ['CCTV Set 4ch', 16500, 0xe2e8f0]],
  gaming: [['Game Console', 58000, 0x1e293b], ['Controller', 6200, 0x3b82f6], ['VR Headset', 42000, 0xe2e8f0]],
  appl: [['Rice Cooker 1.8L', 4800, 0xe2e8f0], ['Air Fryer 5L', 9800, 0x1e293b], ['Blender 600W', 5200, 0xef4444]],
  smart: [['Smart Bulb Set', 2400, 0xfde047], ['WiFi Router', 3800, 0x1e293b], ['Power Bank 20000', 3200, 0x3b82f6]],
  sofa: [['3-Seater Sofa', 48000, 0x78716c], ['Armchair', 16500, 0x0ea5e9], ['Lounge Set', 72000, 0x92400e]],
  beds: [['King Size Bed', 68000, 0x78350f], ['Foam Mattress', 24000, 0xf1f5f9], ['Kids Bunk Bed', 32000, 0x3b82f6]],
  kitchen: [['Non-stick Pan Set', 4200, 0x1e293b], ['Pressure Cooker', 3600, 0xcbd5e1], ['Knife Block', 2800, 0x92400e]],
  light: [['Chandelier', 14500, 0xfacc15], ['Table Lamp', 2800, 0xf97316], ['LED Panel Pack', 3200, 0xf8fafc]],
  decor: [['Wall Clock', 1800, 0x92400e], ['Flower Vase', 1400, 0x22d3ee], ['Canvas Art', 3500, 0xa855f7]],
  dinner: [['Dinner Set 24pc', 6800, 0xf8fafc], ['Glass Set 6pc', 1200, 0x38bdf8], ['Melamine Bowl Set', 1400, 0xf59e0b]],
  bedding: [['Bedsheet Set', 2400, 0x6366f1], ['Comforter', 5800, 0xf472b6], ['Pillow Pair', 1800, 0xf1f5f9]],
  garden: [['Flower Pot Set', 1500, 0xb45309], ['Garden Tool Kit', 2200, 0x22c55e], ['Indoor Plant', 900, 0x16a34a]],
  toys: [['Building Blocks', 2400, 0xef4444], ['RC Car', 3200, 0x3b82f6], ['Teddy Bear', 1600, 0xd97706]],
  books: [['Bangla Novel Set', 1800, 0xef4444], ['Science Encyclopedia', 2800, 0x1d4ed8], ['Story Book Pack', 950, 0xf59e0b]],
  stationery: [['Notebook Pack', 420, 0xfacc15], ['Art Colour Box', 650, 0xf472b6], ['School Bag Set', 1900, 0x22c55e]],
  sports: [['Football', 1400, 0xf8fafc], ['Cricket Bat', 2600, 0xd97706], ['Badminton Set', 1900, 0x3b82f6]],
  bikes: [['Kids Cycle', 9800, 0xef4444], ['Mountain Bike', 32000, 0x3b82f6], ['City Cycle', 18500, 0x84cc16]],
  games: [['Ludo Deluxe', 650, 0xfacc15], ['Chess Set', 1400, 0x1e293b], ['Puzzle 1000pc', 1200, 0x22d3ee]],
  music: [['Acoustic Guitar', 9500, 0xd97706], ['Keyboard 61 key', 16500, 0x1e293b], ['Harmonium', 12500, 0x78350f]],
  gifts: [['Gift Hamper', 3200, 0xfb7185], ['Perfume Set', 4500, 0xa855f7], ['Greeting Box', 650, 0xf59e0b]],
};

function demoProducts(): Product[] {
  const out: Product[] = [];
  for (const c of CATEGORIES) {
    (DEMO[c.id] ?? []).forEach(([name, price, color], i) =>
      out.push({ id: `${c.id}-${i + 1}`, categoryId: c.id, name, price, kind: c.kind, color, slug: `${c.id}-${i + 1}` }));
  }
  return out;
}

function withUtm(raw: string): string {
  const u = new URL(raw, location.href);
  for (const [k, v] of new URLSearchParams(SHOP_LINK.utm)) u.searchParams.set(k, v);
  return u.toString();
}
const base = () => SHOP_LINK.baseUrl.replace(/\/$/, '');

export function productUrl(p: Product): string {
  const path = SHOP_LINK.productPath.replace('{slug}', encodeURIComponent(p.slug)).replace('{id}', encodeURIComponent(p.id));
  return withUtm(p.url ?? base() + path);
}
export function categoryUrl(c: Category): string {
  return withUtm(base() + SHOP_LINK.categoryPath.replace('{id}', encodeURIComponent(c.id)));
}

interface ApiProduct {
  id: string | number; category: string; name: string; price: number;
  slug?: string; url?: string; kind?: ProductKind; color?: number | string;
}

/** Live catalog from SHOP_LINK.apiUrl (JSON array or {products:[...]}); falls back to demo data. */
export async function loadCatalog(): Promise<Catalog> {
  const demo: Catalog = { categories: CATEGORIES, products: demoProducts() };
  if (!SHOP_LINK.apiUrl) return demo;
  try {
    const r = await fetch(SHOP_LINK.apiUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as ApiProduct[] | { products?: ApiProduct[] };
    const list = Array.isArray(j) ? j : j.products ?? [];
    const byId = new Map(CATEGORIES.map((c) => [c.id, c]));
    const products: Product[] = list.filter((a) => byId.has(a.category)).map((a) => {
      const cat = byId.get(a.category)!;
      const color = typeof a.color === 'string' ? parseInt(a.color.replace('#', ''), 16) : a.color ?? cat.color;
      return { id: String(a.id), categoryId: cat.id, name: a.name, price: Number(a.price) || 0,
        kind: a.kind ?? cat.kind, color, slug: a.slug ?? String(a.id), url: a.url };
    });
    return products.length ? { categories: CATEGORIES, products } : demo;
  } catch (e) {
    console.warn('[CityMall] live catalog failed, using demo products:', e);
    return demo;
  }
}
