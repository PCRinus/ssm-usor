# Pinned by digest, because pyHanko decides what a signature and its appearance look like, and
# the font comes from this Debian release.
FROM python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS build

# Debian replaces a version in trixie when it publishes a fix, and then this line stops building:
# take the version `apt-cache policy fonts-liberation` names and check the appearances again.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends fonts-liberation=1:2.1.5-3 \
  && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir --require-hashes --requirement /tmp/requirements.txt

WORKDIR /app
COPY app ./app
RUN mkdir fonts \
  && /opt/venv/bin/python -m app.fonts \
    /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf \
    fonts/LiberationSans-Regular.ttf \
  && /opt/venv/bin/python -m compileall -q app

FROM python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

COPY --from=build /opt/venv /opt/venv
COPY --from=build /app /app
WORKDIR /app
ENV PATH=/opt/venv/bin:$PATH
USER nobody
EXPOSE 3301
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3301", "--log-level", "warning", "--no-access-log"]
