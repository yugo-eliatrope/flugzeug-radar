/**
 * Утилиты для работы с HTML и данными
 */

/**
 * Экранирование HTML символов для предотвращения XSS
 */
export const escapeHtml = (s) => {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
};

/**
 * Вычисление расстояния между двумя точками в километрах (формула Гаверсинуса)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в километрах
  const dLat = (lat2 - lat1) * Math.PI / 180; // Разница широт (в радианах)
  const dLon = (lon2 - lon1) * Math.PI / 180; // Разница долгот (в радианах)

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Расстояние в километрах
  return distance;
}
