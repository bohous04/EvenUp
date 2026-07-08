'use client';
import {
  Scale,
  Mail,
  Camera,
  Check,
  ArrowRight,
  Trash2,
  Plus,
  Pencil,
  X,
  ChevronDown,
  ShoppingCart,
  Utensils,
  Car,
  House,
  Ticket,
  ShoppingBag,
  Lightbulb,
  Pill,
  Plane,
  Package,
  type LucideIcon,
} from 'lucide-react';

/** Map the core's semantic category icon names to lucide components. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  car: Car,
  house: House,
  ticket: Ticket,
  'shopping-bag': ShoppingBag,
  lightbulb: Lightbulb,
  pill: Pill,
  plane: Plane,
  package: Package,
};

export function CategoryIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = CATEGORY_ICONS[name] ?? Package;
  return <Icon size={size} aria-hidden />;
}

export { Scale, Mail, Camera, Check, ArrowRight, Trash2, Plus, Pencil, X, ChevronDown };
