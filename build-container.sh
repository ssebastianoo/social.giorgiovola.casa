# we need this because build depends on environment variables that may change through restarts
if [ -d "build" ]; then
    echo "Build directory exists, starting"
else
    echo "Build directory does not exist, running build"
    npm run build
    echo "Pruning dev dependencies"
    npm prune --omit=dev
    echo "Build done, starting"
fi
ORIGIN=$PUBLIC_URL PORT=3000 node build/index.js