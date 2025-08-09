// src/utils/classifier.js
import { normalize } from './text.js';

// Palabras/expresiones que disparan "horario"
const K_SCHEDULE = [
  /horario/, /clases?/, /cronograma/, /agenda/,
  /a ?que hora/, /cuando hay clase/, /clase hoy/,
  /hay clase/, /que dias/, /schedule/
];

// Lista breve de groserías comunes (ajústala a tu contexto)
const K_TOXIC = [
  /hij[oa] de p|hp|malparid|imbecil|idiot|estupid|perr[oa]\b|mierd|vete a|callate|asco/
];

// Señales de posible crisis personal
const K_DISTRESS = [
  /suicid|me quiero morir|no quiero vivir|me voy a matar|ansiedad|depresi[oó]n/,
  /ataque de panico|crisis|ayuda urgente|autolesi[oó]n|me siento muy mal/
];

/**
 * Clasifica el mensaje en una de las categorías:
 * - 'SCHEDULE'  (pide horario)
 * - 'TOXIC'     (groserías)
 * - 'DISTRESS'  (posible crisis)
 * - 'OTHER'
 */
export function classify(raw = '') {
  const t = normalize(raw);
  if (K_SCHEDULE.some(rx => rx.test(t))) return 'SCHEDULE';
  if (K_TOXIC.some(rx => rx.test(t)))    return 'TOXIC';
  if (K_DISTRESS.some(rx => rx.test(t))) return 'DISTRESS';
  return 'OTHER';
}

// También exporto por default para que funcione si alguna vez haces `import classify from ...`
export default classify;
