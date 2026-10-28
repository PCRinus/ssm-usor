# The base pinned by digest; the tools come from its Debian release. Unlike Gotenberg's, this
# LibreOffice only reads files and lays nothing out, so its version is left to Debian (docs/pdf.md).
FROM node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea

# libheif's HEVC decoder is a plugin of its own, without which ImageMagick cannot read a HEIC.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    libreoffice-writer-nogui \
    poppler-utils \
    imagemagick \
    libheif-plugin-libde265 \
    tini \
  && rm -rf /var/lib/apt/lists/*

ENV LIBREOFFICE_PROFILE=/home/node/libreoffice
USER node
# The profile is made once here, so the first conversion after a cold start does not wait for it.
RUN soffice -env:UserInstallation=file://$LIBREOFFICE_PROFILE --headless --terminate_after_init

WORKDIR /app
COPY files.ts processes.ts server.ts ./
EXPOSE 3302
# Node as the first process would not reap what LibreOffice leaves behind.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.ts"]
