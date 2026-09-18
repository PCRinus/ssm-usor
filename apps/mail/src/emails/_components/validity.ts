// How long a link works, in Romanian. "60 de minute" reads worse than "o oră"; whole hours
// are what Supabase's OTP expiry holds in practice.
export function validity(minutes: number) {
  if (minutes === 60) return 'o oră';
  if (minutes % 60 === 0) return `${minutes / 60} ore`;
  return minutes < 20 ? `${minutes} minute` : `${minutes} de minute`;
}
