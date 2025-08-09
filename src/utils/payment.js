// src/utils/payment.js
const PAY_LINK = process.env.PAYMENTS_WA_LINK || 'https://wa.me/573135745542';
const PAY_NUMBER_HUMAN = '3135745542';

const PAY_KEYWORDS = [
  /comprobante|soporte|voucher|recibo|consignaci[oó]n|transferen|pago|aprobaci[oó]n|referencia/i,
  /nequi|daviplata|bancolombia|bbva|pse|davivienda/i
];

const DATA_KEYWORDS = [
  /nombres? y apellidos?|cc|c[eé]dula|documento/i,
  /unidad donde labora|ciudad donde labora|ciudad/i,
  /correo|e-?mail/i,
  /n[uú]mero de (whatsapp|celular|tel[eé]fono)/i
];

export function paymentRedirectMessage() {
  return (
    `*IMPORTANTE*\n` +
    `Una vez realice el pago debe enviar *FOTO DEL SOPORTE* con *NÚMERO DE REFERENCIA DE PAGO* ` +
    `o *NÚMERO DE APROBACIÓN* al WhatsApp habilitado exclusivamente para pagos ` +
    `al número 📌*${PAY_NUMBER_HUMAN}*📌.\n\n` +
    `Por favor incluir los siguientes datos:\n` +
    `1. Nombres y apellidos:\n` +
    `2. Número de cédula (sin puntos, comas ni espacios):\n` +
    `3. Unidad donde labora:\n` +
    `4. Ciudad donde labora:\n` +
    `5. Número de WhatsApp:\n` +
    `6. Correo institucional:\n\n` +
    `➡️ Enviar aquí: ${PAY_LINK}`
  );
}

/**
 * Devuelve una decisión:
 *  - 'auto'  -> redirigir de una
 *  - 'ask'   -> preguntar si es comprobante
 *  - 'none'  -> no parece de pagos
 */
export function detectPaymentIntent({ text = '', hasMedia = false, type = '' }) {
  const t = String(text || '').toLowerCase();

  const mediaProof = hasMedia && (type === 'image' || type === 'document');

  // señales
  const hasPayWord   = PAY_KEYWORDS.some(rx => rx.test(t));
  const hasEmail     = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(t);
  const hasPhone10   = /\b\d{10}\b/.test(t);
  const hasId7to10   = /\b\d{7,10}\b/.test(t);
  const hasRef       = /\b(ref(eren[cia]?)?|aprobaci[oó]n)[:#]?\s*[a-z0-9-]{5,}\b/i.test(t);
  const hasAmount    = /(\$|\bcop\b)\s*[\d.,]{3,}/i.test(t);
  const hasDataHints = DATA_KEYWORDS.some(rx => rx.test(t));
  const hasListStyle = /(?:^|\n)\s*(?:1\.|2\.|3\.)/.test(t);

  let score = 0;
  if (hasPayWord)   score += 2;
  if (hasEmail)     score += 1;
  if (hasPhone10)   score += 1;
  if (hasId7to10)   score += 1;
  if (hasRef)       score += 1;
  if (hasAmount)    score += 1;
  if (hasDataHints) score += 1;
  if (hasListStyle) score += 1;

  // Reglas:
  // - media + señales → auto
  if (mediaProof && (hasPayWord || hasRef || hasAmount || hasDataHints)) return 'auto';
  // - solo media, sin señales → preguntar
  if (mediaProof && score === 0) return 'ask';
  // - solo texto: score >= 2 auto; score == 1 ask; 0 none
  if (!mediaProof) {
    if (score >= 2) return 'auto';
    if (score === 1) return 'ask';
  }
  return 'none';
}
