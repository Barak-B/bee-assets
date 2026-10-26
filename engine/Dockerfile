# bee-cad as a service next to the B.E.E app: POST /api/plans turns a brief into the drawing set.
#   docker build -t bee-cad engine/
#   docker run -e BEE_CAD_TOKEN=... -p 8765:8765 bee-cad
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml README.md ./
COPY bee_cad ./bee_cad
COPY assets ./assets
COPY examples ./examples
RUN pip install --no-cache-dir -e .
EXPOSE 8765
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health')"
CMD ["bee-cad", "serve", "--host", "0.0.0.0", "--port", "8765"]
