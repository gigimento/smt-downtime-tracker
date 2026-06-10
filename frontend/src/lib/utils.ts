import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    machine_fault: 'Kvar mašine',
    material_shortage: 'Nedostatak materijala',
    program_setup: 'Program / Setup',
    planned_maintenance: 'Planirano održavanje',
    quality_issue: 'Kvalitet',
    free_shift: 'Free Shift',
    weekend: 'Vikend',
    unplanned_other: 'Ostalo',
  };
  return labels[category] || category;
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    machine_fault: 'danger',
    material_shortage: 'warning',
    program_setup: 'primary',
    planned_maintenance: 'success',
    quality_issue: 'warning',
    free_shift: 'gray',
    weekend: 'gray',
    unplanned_other: 'primary',
  };
  return colors[category] || 'gray';
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    operator: 'Operater',
    maintenance: 'Održavanje',
    process: 'Proces',
    planner: 'Planer',
    quality: 'Kvalitet',
    admin: 'Admin',
  };
  return labels[role] || role;
}