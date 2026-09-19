# The conversion service behind apps/pdf: Gotenberg, which drives a headless LibreOffice.
# Pinned, because a LibreOffice upgrade can move a page break. Its Liberation fonts are
# metric-compatible with the Arial the documents are set in (docs/pdf.md).
FROM gotenberg/gotenberg:8.37.0

# Only the LibreOffice route is used. LibreOffice starts with the container, so that the
# first conversion after a cold start does not also wait for it. A long document on half a
# CPU takes seconds; the limit leaves room for one of several hundred pages.
CMD ["gotenberg", \
  "--api-port=3000", \
  "--api-timeout=120s", \
  "--api-body-limit=20MB", \
  "--libreoffice-auto-start=true", \
  "--libreoffice-start-timeout=60s", \
  "--chromium-disable-routes=true", \
  "--webhook-disable=true", \
  "--prometheus-disable-collect=true", \
  "--log-level=warn"]
