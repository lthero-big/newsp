# Self-hosted runner image: node 22 + python 3 + git. The repo is mounted at /app (so data commits land in your checkout).
#   docker build -t newsp .
#   docker run --rm -v "$PWD:/app" -v "$HOME/.config/newsp:/root/.config/newsp:ro" -v "$HOME/.ssh:/root/.ssh:ro" newsp am
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip git curl ca-certificates openssh-client util-linux \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages -q -r /tmp/requirements.txt || true
WORKDIR /app
RUN git config --global --add safe.directory /app
ENTRYPOINT ["bash", "scripts/selfhost.sh"]
CMD ["am"]
