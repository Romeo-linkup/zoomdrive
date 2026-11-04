export const SERVICE_ICONS = {
  flat_tyre: '🛞',
  jump_start: '🔋',
  fuel: '⛽',
  essentials: '🧰',
  towing: '🚛',
};
export function serviceIcon(code) {
  return SERVICE_ICONS[code] || '🔧';
}
