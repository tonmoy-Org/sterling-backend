# Sterling Dashboard (Backend)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/tonmoy-Org/sterling-backend.git

# Navigate to the project directory
cd sterling-backend

# Install dependencies
npm install

# Create environment variables
echo "MONGODB_URI=your_mongodb_connection_uri" >> .env
echo "JWT_SECRET=your_secret_key" >> .env
echo "JWT_EXPIRE=7d" >> .env
echo "PORT=5000" >> .env
echo "NODE_ENV=development" >> .env
echo "FRONTEND_URL=http://localhost:5173" >> .env

# Start the development server (Nodemon)
nodemon
