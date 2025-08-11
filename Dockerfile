# Imagen base
FROM node:22-bullseye

# Evita bajar el Chromium de Puppeteer (usaremos el del sistema)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Paquetes que Chromium necesita para arrancar en servidores
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# Directorio de la app
WORKDIR /app

# Instala dependencias primero (mejor cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia el resto del código
COPY . .

# Comando de inicio (si usas solo el bot)
CMD ["node", "bot.js"]
