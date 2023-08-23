self-hosted social network

## running with Docker
```
# create a persistent volume for your social's data
docker volume create social-data

# customize settings
cp .env.example prod.env
nano prod.env

# build & run
docker-compose up -d
```

The app will listen on port 3000 (customize it in `docker-compose.yaml`), you should put it behind a reverse proxy like [caddy](https://caddyserver.com/docs/quick-starts/caddyfile) or [nginx](https://gist.github.com/journeymanavi/dc7df599dd7618a12528c553ea47b1b1) to add at least https and gzip compression