'use client';
import {
  Mail,
  Camera,
  Image as ImageIcon,
  AlertCircle,
  Check,
  ArrowRight,
  Trash2,
  Plus,
  Pencil,
  X,
  ChevronDown,
  Eye,
  EyeOff,
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
  MoreHorizontal,
  Settings,
  Users,
  BarChart3,
  History,
  FileUp,
  Landmark,
  Tags,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Dog,
  Gift,
  Coffee,
  Dumbbell,
  Music,
  Wrench,
  Fuel,
  Baby,
  Gamepad2,
  Beer,
  Sparkles,
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
  dog: Dog,
  gift: Gift,
  coffee: Coffee,
  dumbbell: Dumbbell,
  music: Music,
  wrench: Wrench,
  fuel: Fuel,
  baby: Baby,
  'gamepad-2': Gamepad2,
  beer: Beer,
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

/** Official multicolor Google "G", for the OAuth button. */
export function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

export {
  Mail,
  Camera,
  ImageIcon,
  AlertCircle,
  Check,
  ArrowRight,
  Trash2,
  Plus,
  Pencil,
  X,
  ChevronDown,
  Eye,
  EyeOff,
  MoreHorizontal,
  Settings,
  Users,
  BarChart3,
  History,
  FileUp,
  Landmark,
  Tags,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Sparkles,
};
export type { LucideIcon };
