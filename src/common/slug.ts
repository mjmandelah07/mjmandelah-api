export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'item';
}

export function makeSku(name: string): string {
  const root = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'ITEM';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${root}-${suffix}`;
}
