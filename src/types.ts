/** Tipe domain Aura Atelier */

export type SizeLabel = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface SizeSpec {
  size_label: SizeLabel;
  chest_width_cm: number;
  body_length_cm: number;
  shoulder_width_cm: number;
  sleeve_length_cm: number;
}

export interface FabricSpecs {
  material: string;
  stretch_factor: number;
  shrinkage_after_wash_pct: number;
}

export interface Review {
  name: string;
  rating: number;
  date: string;
  text: string;
  size: string;
  verified?: boolean;
  at?: string;
  email?: string;
}

export interface Product {
  sku_id: string;
  category: 'T-Shirt' | 'Longsleeve' | 'Hoodie' | 'Kemeja';
  name: string;
  variant: string;
  price: number;
  compare_at_price: number;
  image: string;
  fabric_specs: FabricSpecs;
  cut_ease: { chest: number; shoulder: number };
  sizes: SizeSpec[];
  stock: Partial<Record<SizeLabel, number>>;
  sold: number;
  featured?: boolean;
  keywords: string[];
  reviews: Review[];
}

export interface CartItem {
  sku: string;
  size: string;
  qty: number;
  verified: boolean;
  confidence: number | null;
  name?: string;
  variant?: string;
  price?: number;
}

export interface Address {
  nama: string;
  phone: string;
  provinsi: string;
  kota: string;
  alamat: string;
  kodepos: string;
  catatan: string;
}

export interface ShipOption {
  id: 'eco' | 'reg' | 'exp';
  label: string;
  eta: string;
  cost: number;
  zone: string;
}

export interface OrderTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}

export interface TimelineEntry {
  stage: number;
  at: string;
  by?: string;
}

export interface Order {
  id: string;
  at: string;
  items: CartItem[];
  totals: OrderTotals;
  shipping: ShipOption & { zone: string };
  address: Address;
  payMethod: string;
  payLabel: string;
  statusIndex: number;
  timeline: TimelineEntry[];
  feedback: 'perfect' | 'too_small' | 'too_big' | null;
}

export interface AuthUser {
  name: string;
  email: string;
  phone?: string;
  role?: 'admin' | 'user';
  loginAt?: string;
}

/** Profil fit (skema user_body_profiles) */
export interface FitProfile {
  user_id?: string;
  profile_name: string;
  gender: 'male' | 'female';
  age: number;
  input_method: string;
  metrics: {
    height_cm: number;
    weight_kg: number;
    body_shape: string;
    estimated_chest_cm?: number;
    estimated_waist_cm?: number;
    estimated_hips_cm?: number;
    estimated_shoulder_cm?: number;
    [key: string]: number | string | undefined;
  };
  fit_preference: 'tight' | 'regular' | 'oversized';
  created_at?: string;
  updated_at?: string;
}

export interface FeedbackItem {
  order_id?: string;
  sku_id: string;
  size: string;
  ai_recommended?: boolean;
  feedback: 'perfect' | 'too_small' | 'too_big';
  at?: string;
}

export interface ZoneFit {
  ease: number;
  diff: number;
  status: 'fit' | 'tight' | 'loose';
}

export interface ScoredSize {
  size_label: string;
  score: number;
  zones: { chest: ZoneFit; shoulder: ZoneFit; length: ZoneFit };
  garment: { chest_circ_cm: number; shoulder_cm: number; length_cm: number };
  inStock?: boolean;
  stockCount?: number;
}

export interface FitFeedbackBias {
  chestBiasCm: number;
  shoulderBiasCm: number;
  confidenceDelta: number;
  appliedCount: number;
  summaryNote: string;
}

export interface FitResult {
  best: ScoredSize;
  alternative: ScoredSize;
  bestInStock?: ScoredSize;
  isBestOutOfStock?: boolean;
  ranked: ScoredSize[];
  confidence: number;
  feedbackBias?: FitFeedbackBias;
  isCalibratedFromFeedback?: boolean;
}

