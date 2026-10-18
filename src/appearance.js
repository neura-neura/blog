export const APPEARANCE_KEY = 'blog-studio-appearance-v1';
export const COLORS = [
  { id: 'blue', name: 'Azul', hex: '#1d9bf0' },
  { id: 'yellow', name: 'Amarillo', hex: '#ffd400' },
  { id: 'pink', name: 'Rosa', hex: '#f91880' },
  { id: 'purple', name: 'Morado', hex: '#7856ff' },
  { id: 'orange', name: 'Naranja', hex: '#ff7a00' },
  { id: 'green', name: 'Verde', hex: '#00ba7c' },
];
const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
const hex = channels => '#' + channels.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
export const PALETTE = [...COLORS, ...COLORS.map(c => ({id: `${c.id}-pastel`, name: `${c.name} pastel`, hex: hex(rgb(c.hex).map(n => n * .4 + 255 * .6))}))];
export const accentForeground = () => '#ffffff';
export const FONT_SIZES = [13, 14, 15, 17, 18];
export const DEFAULT_APPEARANCE = { color: 'blue', size: 2, background: 'light', system: false };
export function normalizeAppearance(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return {
    color: PALETTE.some(c => c.id === value.color) ? value.color : 'blue',
    size: Number.isInteger(value.size) && value.size >= 0 && value.size <= 4 ? value.size : 2,
    background: value.background === 'dark' ? 'dark' : 'light',
    system: value.system === true,
  };
}
const luminance = color => rgb(color).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum,n,i) => sum + n * [.2126,.7152,.0722][i],0);
export function contrast(a,b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
export function appearanceTokens(value, systemDark = false) {
  const prefs = normalizeAppearance(value);
  const dark = prefs.system ? systemDark : prefs.background === 'dark';
  const bg = dark ? '#000000' : '#ffffff';
  const accent = PALETTE.find(c => c.id === prefs.color).hex;
  const pastel = prefs.color.endsWith('-pastel');
  let link = accent;
  for(let i=0; pastel && contrast(link,bg)<4.5 && i<30; i++) link = hex(rgb(link).map(n => dark ? n + (255-n)*.12 : n*.88));
  return { '--bg': bg, '--ink': dark ? '#e7e9ea' : '#0f1419', '--muted': dark ? '#8b98a5' : '#536471', '--line': dark ? '#2f3336' : '#eff3f4', '--border': dark ? '#536471' : '#cfd9de', '--hover': dark ? '#16181c' : '#f7f9f9', '--surface': dark ? '#202327' : '#eff3f4', '--blue': accent, '--ring': link, '--link': link, '--on-accent': accentForeground(prefs.color), '--accent-hover': hex(rgb(accent).map(n => n*.9)), '--accent-soft': hex(rgb(accent).map((n,i) => n*.15 + rgb(bg)[i]*.85)), '--font-scale': String(FONT_SIZES[prefs.size]/15), '--ui-font': `${FONT_SIZES[prefs.size]}px`, 'color-scheme': dark ? 'dark' : 'light' };
}
export function initAppearance(win = window) {
  let prefs;
  try { prefs = normalizeAppearance(JSON.parse(win.localStorage.getItem(APPEARANCE_KEY))); } catch { prefs = {...DEFAULT_APPEARANCE}; }
  const media = win.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    for(const [key,value] of Object.entries(appearanceTokens(prefs,media.matches))) win.document.documentElement.style.setProperty(key,value);
    win.document.documentElement.dataset.theme = (prefs.system ? media.matches : prefs.background === 'dark') ? 'dark' : 'light';
    win.dispatchEvent(new win.Event('appearancechange'));
  }
  media.addEventListener('change',apply);
  win.addEventListener('storage',e => { if(e.key === APPEARANCE_KEY || e.key === null) {try { prefs = normalizeAppearance(JSON.parse(win.localStorage.getItem(APPEARANCE_KEY))); } catch {prefs={...DEFAULT_APPEARANCE};} apply();} });
  apply();
  return { get: () => ({...prefs}), set(value) { prefs = normalizeAppearance({...prefs,...value}); apply(); try {win.localStorage.setItem(APPEARANCE_KEY,JSON.stringify(prefs)); return true;} catch {return false;} } };
}
