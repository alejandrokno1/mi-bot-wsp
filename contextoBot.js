// contextoBot.js
// =====================================================
// Configuración del contexto para el bot de WhatsApp
// =====================================================

// -----------------------------------------------------
// [Meta / Versión]  (1) Metadatos y versión
// -----------------------------------------------------
export const CONTEXT_META = {
  version: "2025-08-10",
  owner: "Coordinación y Asesorías Legales y Académicas Nasly Beltrán",
  timezone: "America/Bogota"
};

// -----------------------------------------------------
// [Negocio / Enlaces]
export const BUSINESS = {
  brand: "Coordinación y Asesorías Legales y Académicas Nasly Beltrán",
  timezone: "America/Bogota",
  links: {
    q10: "https://asesoriasacademicasnaslybeltran.q10.com/"
  }
};

// -----------------------------------------------------
// [Mensajes base]
export const MOTTO = `
📖 *Lema de la capacitación:*  
2 Corintios 2:14  
“Mas a Dios gracias, el cual nos lleva siempre en triunfo en Cristo Jesús,  
y por medio de nosotros manifiesta en todo lugar el olor de su conocimiento.”
`.trim();

export const PLATFORM_INFO = `
🎥 *Modalidad:* Todas las clases se imparten en vivo por *Zoom*,  
quedan grabadas y disponibles para consulta.
`.trim();

export const WEEKEND_INFO = `
🗓️ *Fines de semana:*  
Programamos refuerzos los sábados y simulacros los domingos para afianzar lo visto.
`.trim();

// -----------------------------------------------------
// [Q10 / Zoom] (bloques ampliados)
// -----------------------------------------------------
export const Q10_LOGIN_GUIDE = `
🔐 *Acceso a Q10*  
• Enlace: ${BUSINESS.links.q10}  
• *Usuario:* tu cédula (sin puntos ni comas)  
• *Contraseña:* la que tú definiste

Si olvidaste tu contraseña, solicita el restablecimiento.
`.trim();

export const Q10_LIVE_CLASSES_GUIDE = `
🟢 *Clases en vivo por Zoom (vía Q10)*  
Ruta: *Académico* → *Educación virtual* → *Aulas virtuales* → botón *Ingresar a clase en vivo* (según horario).  
*Nota:* El botón no se llama “asistencia”.
`.trim();

export const Q10_RECORDED_CLASSES_GUIDE = `
📚 *Clases grabadas en Q10* — Dos rutas:
1) *Académico* → *Educación virtual* → *Cursos virtuales* → elige el profesor → verás las grabaciones.
2) *Académico* → *Educación virtual* → *Aulas virtuales* → pestaña *Grabaciones*.

*Tip:* si no te carga, prueba en ventana de incógnito y vuelve a intentar.
`.trim();

export const Q10_GENERAL_GUIDE = `
📌 *Plataforma Q10*:  
- Accede desde el enlace oficial: ${BUSINESS.links.q10}  
- Usa tu usuario y contraseña asignados.  
- Desde el panel principal podrás:
  1) Ver tu *horario de clases*.
  2) Entrar a *Zoom* para clases en vivo.
  3) Consultar *material de estudio* (PDF, guías, diapositivas).
  4) Revisar *notas* y *asistencias*.

🔑 *Consejo*: Cambia tu contraseña en el primer ingreso y guárdala en un lugar seguro.
`.trim();

export const ZOOM_TROUBLESHOOT = `
🔧 *Si Zoom no te deja conectar:*
1) Cierra y vuelve a abrir Zoom e intenta de nuevo.
2) Si sigue igual, desinstala Zoom e instálalo nuevamente.
3) Alternativa: entra primero a *Q10* (ideal en modo incógnito), navega al curso y desde ahí ingresa a Zoom.
`.trim();

// -----------------------------------------------------
// [Curso / Examen / Pagos]
export const COURSE_INFO = `
📅 *Período de inscripciones (Agosto 2025):* del 2 de agosto hasta el  9 de septiembre
🗓 *Inicio de clases:* 11 de agosto de 2025  
⏳ *Duración:* Hasta el examen final (previsto para marzo/abril de 2026)  

${PLATFORM_INFO}  
${WEEKEND_INFO}
`.trim();

export const EXAM_INFO = `
📄 *Examen de Ascenso a Subintendente* (Icfes - Concurso de Patrulleros)

🔹 **Objetivo**: Evaluar aptitudes y competencias de aspirantes al grado de Subintendente.

🔹 **Estructura de la prueba escrita**:
  • **Psicotécnica** (150 preguntas, 50% del puntaje, 4 h 40 min):  
    – Razonamiento Cuantitativo  
    – Lectura Crítica  
    – Competencias Ciudadanas  
    – Acciones y Actitudes  
  • **Conocimientos Policiales** (100 preguntas, 50% del puntaje, 3 h)

🔹 **Temas clave**:
  – Perfil de Subintendente: valores, liderazgo, trabajo en equipo  
  – Doctrina y normatividad: Constitución, Derechos Humanos, Códigos  
  – Procedimientos policiales y gestión de recursos  
  – Habilidades ofimáticas básicas

🔹 **Formato:** Selección múltiple con única respuesta.
`.trim();

export const PAYMENT_INFO = `
📌 *COORDINACIÓN Y ASESORÍAS LEGALES Y ACADÉMICAS*  
📍 *NASLY BELTRÁN*

🗓️ *Mensualidad Agosto:* 2 al 30 de agosto de 2025  
💰 *Valor:* $110.000  
 

🕑 *La mensualidad cubre el mes y hasta los primeros 5 días del mes siguiente.*  
🚫 *No hay cláusulas de permanencia.*  
✅ *Con el pago tendrás acceso a nuestra plataforma y todos nuestros beneficios.*  

🚫 *No se recibe Transfiya* 🚫  
✅ *Sólo transferencias desde el mismo banco*  

📝 *Medios de pago:*  
• Bancolombia (Ahorros)  
  – 91229469504  
  – Titular: Nasly Sofía Beltrán Sánchez (C.C. 53.014.381)  
• BBVA (Ahorros)  
  – 157268491  
  – Titular: Nasly Sofía Beltrán Sánchez (C.C. 53.014.381)  
• Banco Popular (Ahorros)  
  – 500804101927  
  – Titular: Nasly Sofía Beltrán Sánchez (C.C. 53.014.381)  
• Davivienda (Ahorros)  
  – 007500883082  
  – Titular: Nasly Sofía Beltrán Sánchez (C.C. 53.014.381)  
• Nequi (App)  
  – 314 306 8340  
  – Titular: Nasly Sofía Beltrán Sánchez (C.C. 53.014.381)  

👉 _Por favor, verifica la información y realiza tu transferencia antes del 9 de agosto._
`.trim();

// -----------------------------------------------------
// [Contactos de profesores y pagos]
export const CONTACTS = {
  "alejandro": { area: "Razonamiento Cuantitativo",   nombre: "Profe Alejandro",       numero: "+57 314 490 9109" },
  "juan":      { area: "Lectura Crítica",             nombre: "Profe Juan",            numero: "+57 312 380 9472" },
  "edgar":     { area: "Competencias Ciudadanas 1",   nombre: "Profe Edgar",           numero: "+57 315 264 6844" },
  "sandra":    { area: "Conocimientos Policiales 2",  nombre: "Profe Sandra",          numero: "+57 310 882 6922" },
  "araque":    { area: "Conocimientos Policiales 1",  nombre: "Profe Araque",          numero: "+57 311 894 1856" },
  "nasly":     { area: "Conocimientos Policiales 3",  nombre: "Profe Nasly Beltrán",   numero: "+57 314 306 8340" },
  "martin":    { area: "Competencias Ciudadanas 2",   nombre: "Profe Martin",          numero: "+57 321 457 0496" },
  "pagos":     { area: "Plataforma de pagos",         nombre: "Pagos",                 numero: "+57 313 574 5542" }
};

export const PROFES_POR_MATERIA = `
📚 *Profesores por materia*:
- *Razonamiento Cuantitativo*: Profe Alejandro – +57 314 490 9109
- *Lectura Crítica*: Profe Juan – +57 312 380 9472
- *Competencias Ciudadanas 1*: Profe Edgar – +57 315 264 6844
- *Conocimientos Policiales 2*: Profe Sandra – +57 310 882 6922
- *Conocimientos Policiales 1*: Profe Araque – +57 311 894 1856
- *Conocimientos Policiales 3*: Profe Nasly Beltrán – +57 314 306 8340
- *Competencias Ciudadanas 2*: Profe Martin – +57 321 457 0496

*📌 Número de plataforma/pagos:* +57 313 574 5542
`.trim();

export const ASK_WHICH_PROF = `
¿De qué profe necesitas el número? Tengo: Alejandro (Razonamiento), Juan (Lectura), Edgar (Competencias 1), Sandra (Conocimientos 2), Araque (Conocimientos 1), Nasly (Conocimientos 3) y Martin (Competencias 2).
`.trim();

export function formatProfNumberResponse(keyOrText) {
  const k = (keyOrText || "").toLowerCase().trim();
  const keys = Object.keys(CONTACTS);
  const foundKey = keys.find(id => k.includes(id)) || (
    (k.includes("razonamiento") && "alejandro") ||
    (k.includes("lectura") && "juan") ||
    ((k.includes("competencias") && k.includes("1")) && "edgar") ||
    ((k.includes("competencias") && k.includes("2")) && "martin") ||
    ((k.includes("conocimientos") && k.includes("1")) && "araque") ||
    ((k.includes("conocimientos") && k.includes("2")) && "sandra") ||
    ((k.includes("conocimientos") && k.includes("3")) && "nasly") ||
    (k.includes("pago") && "pagos")
  );
  const found = CONTACTS[foundKey];
  if (!found) return `No identifiqué ese nombre. ${ASK_WHICH_PROF}`;
  return `${found.nombre} (${found.area}): ${found.numero}`;
}

// -----------------------------------------------------
// [Grupos]
export const STUDY_GROUPS_INFO = `
👥 *Grupos de estudio:* contamos con dos grupos: *A* y *B*.  
- Tu grupo se identifica por la *primera letra* del nombre del grupo de WhatsApp al que fuiste vinculado.  
- También tenemos *grupos oficiales* de WhatsApp que son *meramente informativos* (solo envían avisos).

🔗 La capacitación envía el *enlace de la plataforma Q10* para que, desde Q10, ingreses a las clases en vivo por Zoom.  
🎥 *Todas las clases se graban.*
`.trim();

// -----------------------------------------------------
// (2) Privacidad y seguridad
export const PRIVACY_POLICY = `
🔒 *Privacidad:* No compartas tu contraseña. El bot nunca te pedirá códigos de verificación ni datos de tarjeta.
Solo solicita: nombre, cédula, unidad/ciudad, WhatsApp y correo institucional para matrícula/pagos.
`.trim();

// -----------------------------------------------------
// (3) Horario de atención y fuera de horario
export const OFFICE_HOURS = {
  weekdays: { start: "08:00", end: "20:00" },
  saturday: { start: "08:00", end: "16:00" },
  sunday:   null
};

export const OFF_HOURS_MESSAGE = `
🕒 En este momento estamos fuera de horario de atención.
Tu mensaje quedó registrado y te contactaremos en el siguiente horario hábil.
Mientras tanto, puedo guiarte con Q10, pagos o grabaciones. ¿Qué necesitas?
`.trim();

// -----------------------------------------------------
// (4) Reglas de seguridad (anti-alucinación)
export const SAFETY_RULES = `
✅ *Verificación mínima para pagos:* monto, método y nombre del titular.
❌ No confirmes pagos sin soporte (foto + número de aprobación o referencia).
✅ En Q10: recuerda “Usuario = cédula”, “Contraseña = definida por el usuario”.
❌ No inventes links ni números. Usa solo los definidos en el contexto.
`.trim();

// -----------------------------------------------------
// (5) Variables de negocio
export const BUSINESS_VARS = {
  price_month: 110000,
  inscription_window: { start: "2025-08-02", end: "2025-08-09" },
  classes_start: "2025-08-11",
  grace_days_next_month: 5,
  payments_whatsapp: "+57 313 574 5542"
};

// -----------------------------------------------------
// (6) Normalización de entradas
export function normalizeId(value="") {
  return String(value).replace(/\D+/g, "");
}
export function formatPhoneIntl(raw="") {
  const digits = normalizeId(raw);
  return digits.startsWith("57") ? `+${digits}` : `+57 ${digits}`;
}

// -----------------------------------------------------
// (7) Palabras clave (detección rápida)
export const KEYWORDS = {
  numeroProfe: [/n[uú]mero.*profe/i, /tel[eé]fono.*profe/i, /contacto.*(docente|profe)/i],
  grabadas: [/grabada/i, /grabaci[oó]n/i, /repetici[oó]n/i],
  vivo: [/clase.*vivo/i, /ingresar.*zoom/i, /aulas.*virtuales/i],
  zoomError: [/zoom.*no.*(entra|conecta|abre)/i],
  pagos: [/pago/i, /transferencia/i, /nequi|daviplata|bancolombia/i],
  matricula: [/inscrip/i, /m[aá]tricul/i, /cupos?/i],
  // Mejorado: capturar consultas cortas sobre estado/plataforma
  statusQuery: [
    /(q10|zoom|plataforma)/i,                              // menciona un servicio
    /(estado|ca[ií]d[ao]|intermitente|no\s*func)/i,        // estado/incidencia
    /\b(est[aá]\s*ca[ií]d[ao]|funciona)\b/i,               // "está caído"/"funciona"
    /\b(status)\b/i                                        // alias en inglés
  ]
};

// -----------------------------------------------------
// (8) Desambiguación / Multi-intento
export const DISAMBIGUATE = {
  generic: "¿Te refieres a *Pagos*, *Q10/Zoom* o *Matrícula*?",
  numeroProfe: "¿De qué profe necesitas el número? Puedo darte: Alejandro, Juan, Edgar, Sandra, Araque, Nasly o Martin."
};

export const MULTI_INTENT_PROMPT = `
Detecté varias cosas a la vez. ¿Qué quieres primero?
1) Pagos  2) Q10/Zoom  3) Grabaciones  4) Matrícula  5) Número de profesor
Responde con el número.
`.trim();

// -----------------------------------------------------
// (9) Estados operativos de plataformas (Q10 / Zoom)
//     + comandos para administradores
// -----------------------------------------------------
export const ADMIN_NUMBERS = [
  // Añade aquí números autorizados para comandos, en formato E.164
  // Ejemplo: "+57 300 123 4567"
];

export const OUTAGES = {
  q10:  { active: false, note: "Q10 funcionando correctamente." },
  zoom: { active: false, note: "Zoom funcionando correctamente." }
};

export function setOutage(service, active, note) {
  const key = String(service || "").toLowerCase();
  if (!["q10", "zoom"].includes(key)) return { ok:false, message:"Servicio invalido (q10|zoom)" };
  OUTAGES[key].active = !!active;
  if (note) OUTAGES[key].note = String(note);
  return { ok:true, message: `${key.toUpperCase()}: ${OUTAGES[key].note}` };
}

export function outageBanner() {
  const notes = [];
  if (OUTAGES.q10.active)  notes.push(`⚠️ Q10: ${OUTAGES.q10.note}`);
  if (OUTAGES.zoom.active) notes.push(`⚠️ Zoom: ${OUTAGES.zoom.note}`);
  return notes.length ? notes.join("\n") : "";
}

// Mensaje listo para usuarios cuando pregunten por estado
export function getPlatformStatusMessage() {
  const banner = outageBanner();
  if (banner) return `${banner}\n\nEstamos trabajando para normalizar el servicio. Gracias por tu paciencia.`;
  return "✅ Por ahora todo funciona correctamente: Q10 y Zoom operativos.";
}

// Comandos de admin (para usar desde bot.js)
// - "/status" o "/estado"                  → muestra estado actual (no cambia nada)  ← NUEVO
// - "/q10 ok"                              → Q10 sin incidentes
// - "/q10 down mantenimiento..."           → Q10 con incidentes y nota
// - "/zoom ok"                             → Zoom sin incidentes
// - "/zoom down falla regional..."         → Zoom con incidentes y nota
// - "/plataforma funcionando correctamente"→ ambas ok
// - "/plataforma presenta inconvenientes [nota]" → ambas down con nota opcional
export function applyAdminCommand(text, isAdmin=false) {
  if (!isAdmin) return { matched:false };

  const t = (text || "").trim().toLowerCase();

  // Alias de consulta rápida de estado (no cambia nada)
  if (t === "/status" || t === "/estado") {
    return { matched:true, reply: getPlatformStatusMessage() };
  }

  // Plataforma global
  if (t.startsWith("/plataforma funcionando correctamente")) {
    setOutage("q10", false, "Q10 funcionando correctamente.");
    setOutage("zoom", false, "Zoom funcionando correctamente.");
    return { matched:true, reply: "✅ Plataforma marcada como *operativa* (Q10 y Zoom)." };
  }
  if (t.startsWith("/plataforma presenta inconvenientes")) {
    const note = text.slice(text.indexOf("inconvenientes") + "inconvenientes".length).trim() || "Incidencia general en plataforma (Q10/Zoom).";
    setOutage("q10", true, note);
    setOutage("zoom", true, note);
    return { matched:true, reply: `⚠️ Plataforma marcada con *incidencias*: ${note}` };
  }

  // Comandos específicos
  const q10ok   = t.startsWith("/q10 ok");
  const q10down = t.startsWith("/q10 down");
  const zoomok   = t.startsWith("/zoom ok");
  const zoomdown = t.startsWith("/zoom down");

  if (q10ok)   { setOutage("q10", false, "Q10 funcionando correctamente."); return { matched:true, reply:"✅ Q10: operativo." }; }
  if (zoomok)  { setOutage("zoom", false, "Zoom funcionando correctamente."); return { matched:true, reply:"✅ Zoom: operativo." }; }

  if (q10down) {
    const note = text.replace("/q10 down", "").trim() || "Incidencia en Q10.";
    setOutage("q10", true, note);
    return { matched:true, reply:`⚠️ Q10: ${note}` };
  }
  if (zoomdown) {
    const note = text.replace("/zoom down", "").trim() || "Incidencia en Zoom.";
    setOutage("zoom", true, note);
    return { matched:true, reply:`⚠️ Zoom: ${note}` };
  }

  return { matched:false };
}

// -----------------------------------------------------
// (10) Política de grupos + quick reply
export const GROUPS_POLICY = `
👥 *Grupos de estudio:* A y B. Tu grupo se identifica por la *primera letra* del grupo de WhatsApp donde estás.
📢 *Grupos oficiales:* solo informativos (avisos y enlaces). El bot puede brindarte apoyo 24/7.
`.trim();

export const GROUPS_QUICK_REPLY = `
¿Quieres confirmar tu *Grupo de estudio* (A/B) o unirte al *grupo informativo*? Dime “Grupo A”, “Grupo B” o “Grupo informativo”.
`.trim();

// -----------------------------------------------------
// (11) Respuestas rápidas (atajos)
export const QUICK = {
  q10Login: Q10_LOGIN_GUIDE,
  q10Live:  Q10_LIVE_CLASSES_GUIDE,
  q10Rec:   Q10_RECORDED_CLASSES_GUIDE,
  q10Help:  Q10_GENERAL_GUIDE,
  zoomFix:  ZOOM_TROUBLESHOOT,
  profesores: PROFES_POR_MATERIA,
  pagos: PAYMENT_INFO,
  grupos: GROUPS_POLICY
};

// -----------------------------------------------------
// (12) Confirmaciones estructuradas
export const CONFIRM_TEMPLATES = {
  paymentReceived(ref, amount) {
    const safe = Number(amount || 0);
    return `✅ Recibimos tu soporte. Ref: *${ref}* por *${safe.toLocaleString("es-CO")} COP*. En breve activamos tu acceso en Q10.`;
  },
  paymentMissing() {
    return "Para validar tu pago necesito la *foto del soporte* y el *número de aprobación* o *referencia*.";
  },
  enrollmentPack() {
    return `
📦 *Paquete de bienvenida en Q10:*
• Usuario: tu cédula
• Contraseña: la que definiste
• Video tutorial de plataforma
• Ruta para clases en vivo y grabaciones
    `.trim();
  }
};

// -----------------------------------------------------
// (13) Escalamiento a humano
export const HUMAN_HANDOFF = `
Puedo escalar tu caso a un asesor humano. ¿Prefieres que te llamen o te escriban por WhatsApp?
Indícame tu disponibilidad (fecha y hora).
`.trim();

// -----------------------------------------------------
// Respuesta de matrícula (con pagos)
export const MATRICULATION_RESPONSE = `
✅ Para matricularte, primero realiza el pago de la mensualidad de **110 000 COP**.

${PAYMENT_INFO}

Una vez recibamos tu comprobante al **3135745542** (https://wa.me/573135745542), te matriculamos ese mismo día.  
¿Listo para comenzar este nuevo desafío? ¡Éxitos! 🎉
`.trim();

// -----------------------------------------------------
// Prompt base del sistema (rol system)
export const BASE_SYSTEM_PROMPT = {
  role: 'system',
  content: `
Eres el asistente oficial de *Coordinación y Asesorías Legales y Académicas Nasly Beltrán*.  
Habla como Nasly: cercano, claro y amable, usando **negritas**, _cursivas_, emojis y saltos de línea.

${MOTTO}

▶️ **Detalles generales de la capacitación**  
${COURSE_INFO}

▶️ **Acceso y plataforma**  
${Q10_LOGIN_GUIDE}  
${Q10_LIVE_CLASSES_GUIDE}

▶️ **Video introductorio**  
https://www.youtube.com/watch?v=xujKKee_meI&ab_channel=NASLYSOFIABELTRANSANCHEZ

${PRIVACY_POLICY}

---

- **No inventes nombres de usuario ni datos sensibles.**  
- Usa el nombre solo si la app lo proporciona.  
- Si hay dudas, pide *un* dato adicional (no más).

🧭 *Reglas de seguridad*  
${SAFETY_RULES}
`
};

// -----------------------------------------------------
// Ejemplos few-shot
export const EXAMPLES = [
  { user: 'Hola',          bot: '¡Hola! Un gusto conocerte, ¿cómo te llamas? 😊' },
  { user: 'Me llamo ...',  bot: '¡Encantado de conocerte! ¿En qué te puedo ayudar? 😊' },
  { user: '¿Cuál es el link de la plataforma?', bot: Q10_LOGIN_GUIDE },
  { user: '¿Cómo entro a la clase en vivo?',    bot: Q10_LIVE_CLASSES_GUIDE },
  { user: '¿Cómo veo las clases grabadas?',     bot: Q10_RECORDED_CLASSES_GUIDE },
  { user: 'No me conecta Zoom',                 bot: ZOOM_TROUBLESHOOT },
  { user: 'Profesores por materia',             bot: PROFES_POR_MATERIA },
  { user: '¿Me pasas el número del profe?',     bot: ASK_WHICH_PROF },
  { user: 'El de Nasly',                        bot: formatProfNumberResponse('nasly') },
  { user: '¿La plataforma está funcionando?',   bot: getPlatformStatusMessage() }
];
