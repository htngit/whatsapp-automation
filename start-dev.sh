#!/bin/bash

# WhatsApp Automation Development Server Starter for Mac/Linux
# Created by XalesIn

echo "Starting WhatsApp Automation Development Servers..."
echo ""

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "Warning: Port $port is already in use!"
        return 1
    fi
    return 0
}

# Check if ports are available
echo "Checking ports..."
check_port 3001
check_port 3000

echo "========================================"
echo "Starting Backend Server (Port 3001)..."
echo "========================================"
# Start backend in background
cd backend
if [ ! -f "package.json" ]; then
    echo "Error: Backend package.json not found!"
    echo "Please run './install.sh' first."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: Backend dependencies not installed!"
    echo "Please run './install.sh' first."
    exit 1
fi

# Start backend server in new terminal
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal --title="Backend Server" -- bash -c "npm run dev; exec bash"
elif command -v osascript &> /dev/null; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "cd '$(pwd)' && npm run dev"'
else
    echo "Starting backend in background..."
    npm run dev &
    BACKEND_PID=$!
fi

cd ..

echo ""
echo "========================================"
echo "Starting Frontend Server (Port 3000)..."
echo "========================================"
cd frontend
if [ ! -f "package.json" ]; then
    echo "Error: Frontend package.json not found!"
    echo "Please run './install.sh' first."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: Frontend dependencies not installed!"
    echo "Please run './install.sh' first."
    exit 1
fi

# Start frontend server in new terminal
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal --title="Frontend Server" -- bash -c "npm run dev; exec bash"
elif command -v osascript &> /dev/null; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "cd '$(pwd)' && npm run dev"'
else
    echo "Starting frontend in background..."
    npm run dev &
    FRONTEND_PID=$!
fi

cd ..

echo ""
echo "========================================"
echo "Development Servers Started!"
echo "========================================"
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo ""
echo "Both servers are running in separate terminal windows."
echo "Close those terminal windows to stop the servers."
echo ""
echo "Press any key to exit this script..."
read -n 1 -s