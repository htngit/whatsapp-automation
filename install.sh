#!/bin/bash

# WhatsApp Automation Installation Script for Mac/Linux
# Created by XalesIn

echo "Starting WhatsApp Automation Installation by XalesIn..."
echo ""

echo "========================================"
echo "Installing Backend Dependencies..."
echo "========================================"
cd backend
if [ ! -f "package.json" ]; then
    echo "Error: Backend package.json not found!"
    read -p "Press any key to exit..."
    exit 1
fi
npm install
if [ $? -ne 0 ]; then
    echo "Backend installation failed!"
    read -p "Press any key to exit..."
    exit 1
fi
echo "Backend installation completed successfully!"
cd ..

echo ""
echo "========================================"
echo "Installing Frontend Dependencies..."
echo "========================================"
cd frontend
if [ ! -f "package.json" ]; then
    echo "Error: Frontend package.json not found!"
    read -p "Press any key to exit..."
    exit 1
fi
npm install
if [ $? -ne 0 ]; then
    echo "Frontend installation failed!"
    read -p "Press any key to exit..."
    exit 1
fi
echo "Frontend installation completed successfully!"
cd ..

echo ""
echo "========================================"
echo "Installation Complete!"
echo "========================================"
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:3000"
echo ""
echo "You can now run './start-dev.sh' to start both servers."
echo ""
echo "Press any key to exit..."
read -n 1 -s