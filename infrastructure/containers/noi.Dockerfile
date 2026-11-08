# Mero and Governance as container images (agreed 8 Nov). Build from the No Origins folder:
#   docker build -f infrastructure/containers/noi.Dockerfile --target mero -t noi/mero:dev .
#   docker build -f infrastructure/containers/noi.Dockerfile --target governance -t noi/governance:dev .
# The crates come from noi/vendor (cargo vendor, from this Mac's cache), so the build downloads none.
# No password, key or env file is ever copied in: see noi.Dockerfile.dockerignore. Each server reads
# its database login from its environment when it starts (the host's secret store).

FROM rust:1.99-slim-bookworm AS build
WORKDIR /noi
COPY noi/Cargo.toml noi/Cargo.lock ./
COPY noi/crates ./crates
COPY noi/migrations ./migrations
COPY noi/data ./data
COPY noi/vendor ./vendor
RUN mkdir .cargo && printf '[source.crates-io]\nreplace-with = "vendored-sources"\n\n[source.vendored-sources]\ndirectory = "vendor"\n' > .cargo/config.toml
RUN cargo build --release --offline --locked -p noi-mer --bin noi \
 && cargo build --release --offline --locked -p noi-gov --features server --bin noi-gov

# What both run on: Debian, slim, as a user with no rights of its own.
FROM debian:bookworm-slim AS base
RUN useradd --system --uid 10001 --no-create-home noi
USER noi
# Bind inside the container's own network; logs as one JSON object a line, for the host.
ENV NOI_IN_CONTAINER=1 NOI_LOG_FORMAT=json

FROM base AS mero
COPY --from=build /noi/target/release/noi /usr/local/bin/noi
EXPOSE 8787
# Ready: its database and Governance answer. No curl here, so bash asks.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8787 && printf 'GET /health/ready HTTP/1.0\\r\\nHost: localhost:8787\\r\\n\\r\\n' >&3 && head -1 <&3 | grep -q ' 200 '"]
ENTRYPOINT ["/usr/local/bin/noi"]
CMD ["serve", "--bind", "0.0.0.0:8787"]

FROM base AS governance
COPY --from=build /noi/target/release/noi-gov /usr/local/bin/noi-gov
EXPOSE 8788
# Ready: its database answers and it holds a copy of the roles and rules.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8788 && printf 'GET /health/ready HTTP/1.0\\r\\nHost: localhost:8788\\r\\n\\r\\n' >&3 && head -1 <&3 | grep -q ' 200 '"]
ENTRYPOINT ["/usr/local/bin/noi-gov"]
CMD ["serve", "--bind", "0.0.0.0:8788"]
