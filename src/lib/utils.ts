import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateLevenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, (_, i) => i)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

export function isPhraseMatch(transcript: string, targetContent: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const cTranscript = clean(transcript);
  const cTarget = clean(targetContent);

  if (cTranscript.includes(cTarget)) return true;

  const distance = calculateLevenshtein(cTranscript, cTarget);
  const threshold = Math.floor(cTarget.length * 0.3); // 30% error margin
  
  return distance <= threshold;
}

export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 7 && cleaned.length <= 15;
}

export function normalizePhoneForAPI(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  // Default to India if 10 digits and no +, but we should ideally let users enter full format
  if (cleaned.length === 10 && !phone.startsWith('+')) {
    return `+91${cleaned}`;
  }
  return phone.startsWith('+') ? phone.replace(/\s/g, '') : `+${cleaned}`;
}
