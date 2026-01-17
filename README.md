# Flugzeug Radar — ADS-B Live Tracker

Real-time aircraft tracking application using ADS-B data.

## Running readsb

```bash
./readsb --quiet --net --net-sbs-port 30003 --device-type rtlsdr --gain auto --interactive
```

## Starting the Application

```bash
# Build the application
yarn build

# Start the server
yarn start
```

## Network Access

The application is configured to accept connections from any device on your local network:

- **HTTP Server**: Accessible at `http://<server-ip>:<APP_PORT>`
- **WebSocket Server**: Automatically connects to the same host as the HTTP server

### Connecting from Another Computer

1. Find your server's local IP address (e.g., `192.168.1.100`)
2. Open `http://<server-ip>:<APP_PORT>` in a web browser on any device in your network
3. The WebSocket will automatically connect to the correct server

**Note**: The WebSocket connection uses the hostname from `window.location.hostname`, so it will always connect to the same server that served the HTML page, whether you access it via:
- `localhost` (from the same machine)
- Local IP address (e.g., `192.168.1.100`)
- Domain name (if configured)

## Environment Variables

Configure the application using a `.env` file:

```env
SBS_HOST=localhost
SBS_PORT=30003
APP_PORT=7103
STATE_MAX_AGE_MS=30000
DATABASE_URL=file:./prisma/dev.db
APP_AUTH_PASSWORD=your_password  # Optional
SPOT_NAME=MyLocation  # Optional
```