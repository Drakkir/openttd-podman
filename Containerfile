FROM debian:bookworm-slim

ARG OPENTTD_VERSION=15.3
ARG OPENGFX_VERSION=7.1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils unzip \
        liblzo2-2 libicu72 zlib1g libpng16-16 libfreetype6 libfontconfig1 libsdl2-2.0-0 libgomp1 libglib2.0-0 \
    && curl -fsSL "https://cdn.openttd.org/openttd-releases/${OPENTTD_VERSION}/openttd-${OPENTTD_VERSION}-linux-generic-amd64.tar.xz" \
        | tar -xJ -C /opt \
    && mv "/opt/openttd-${OPENTTD_VERSION}-linux-generic-amd64" /opt/openttd \
    && curl -fsSL "https://cdn.openttd.org/opengfx-releases/${OPENGFX_VERSION}/opengfx-${OPENGFX_VERSION}-all.zip" -o /tmp/opengfx.zip \
    && unzip -q /tmp/opengfx.zip -d /tmp \
    && tar -xf /tmp/opengfx-${OPENGFX_VERSION}.tar -C /opt/openttd/baseset \
    && rm -rf /tmp/opengfx* \
    && apt-get purge -y curl xz-utils unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /opt/entrypoint.sh
COPY defaults /opt/defaults
RUN chmod +x /opt/entrypoint.sh

RUN useradd -u 1000 -m -d /data -s /usr/sbin/nologin openttd

USER openttd
ENV HOME=/data
WORKDIR /opt/openttd

EXPOSE 3979/tcp 3979/udp

ENTRYPOINT ["/opt/entrypoint.sh"]
