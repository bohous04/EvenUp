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

/**
 * The Apple logo mark, required by Apple's Human Interface Guidelines for the
 * Sign In with Apple button. Not `lucide-react`'s `Apple` export — that is a
 * piece of fruit.
 */
export function AppleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

export { Scale, Mail, Camera, Check, ArrowRight, Trash2, Plus, Pencil, X, ChevronDown };
