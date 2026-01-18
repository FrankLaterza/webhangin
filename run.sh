#!/bin/bash

echo "🎨 Building frontend..."
cd frontend
npm run build:static

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi

echo "✅ Frontend built successfully!"
echo ""
echo "🚀 Starting backend server..."
cd ../backend
cargo run
