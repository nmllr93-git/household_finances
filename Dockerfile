# Larenest server for Docker (Linux PCs, home servers, NAS, Raspberry Pi 4/5).
# No npm packages: just Node 22 and the app. Data lives in the /data volume.
FROM node:22-alpine
LABEL org.opencontainers.image.title="Larenest" \
      org.opencontainers.image.description="Self-hosted budgeting and net worth. Your data stays on your server." \
      org.opencontainers.image.url="https://larenest.app" \
      org.opencontainers.image.source="https://github.com/nmllr93-git/household_finances-releases"
ENV NODE_ENV=production NODE_NO_WARNINGS=1 DATA_DIR=/data PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY package.json server.js digest.js ./
COPY core ./core
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
