FROM python:3.13-slim
ARG PANDOC_VERSION=3.1.11.1
ARG PANDOC_SHA256=ab0ac0aa1c3f9b23243d14e43023e06cbce51a52420aba17d27bd0d9c28f73ac
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates graphviz fonts-noto-cjk poppler-utils poppler-data libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 libfontconfig1 libssl3 \
    && curl -fL --retry 3 "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-amd64.deb" -o /tmp/pandoc.deb \
    && echo "${PANDOC_SHA256}  /tmp/pandoc.deb" | sha256sum -c - \
    && dpkg -i /tmp/pandoc.deb && rm /tmp/pandoc.deb \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir weasyprint==69.0
ARG TECTONIC_VERSION=0.15.0
ARG TECTONIC_SHA256=875fbbc9ab48560d7776088c608e0beee49197b57ab4a2f6c5385b2c661c842f
RUN curl -fL --retry 3 "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" -o /tmp/tectonic.tar.gz \
    && echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic && rm /tmp/tectonic.tar.gz
ENV XDG_CACHE_HOME=/tmp/tectonic-cache
WORKDIR /work
USER 1000:1000
ENTRYPOINT ["weasyprint"]
