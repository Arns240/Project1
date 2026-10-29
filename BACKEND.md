# Motor monitoring backend prototype

This first backend runs on the same computer as the website and needs only Node.js (no npm packages). It is for learning and local prototyping. The website on Netlify is still a static site; this local server does not send readings to Netlify or make the API reachable from the internet.

## Start it on Windows

Open PowerShell in the `Project1` folder and set a temporary token for each machine you want to simulate. Use a different, longer random value for every machine in a real deployment.

```powershell
$env:DEVICE_TOKEN_MACHINE_1 = "local-demo-machine-1-change-this"
node server.js
```

Then open `http://127.0.0.1:3000` in the browser. Stop the server with `Ctrl+C`. The readings are stored in `data/readings.json`, which is excluded from Git.

## API routes

- `GET /api/health` — confirms that the API is running.
- `GET /api/v1/machines` — lists Machines 1–6 and the latest reading for each motor that has reported.
- `GET /api/v1/machines/1/readings?limit=100` — returns recent readings for one machine (limit 1–500).
- `POST /api/v1/readings` — accepts a sensor reading. Requires that machine's bearer token.

Example request from PowerShell after starting the server:

```powershell
$reading = @{
  machineId = 1
  motorId = "hoist-motor-1"
  temperatureC = 58.2
  currentA = 14.6
  vibrationMmS = 2.1
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3000/api/v1/readings" `
  -Headers @{ Authorization = "Bearer $env:DEVICE_TOKEN_MACHINE_1" } `
  -ContentType "application/json" `
  -Body $reading
```

The API stores the reading and returns it with a generated ID and server receipt time. It validates the machine ID, motor ID, timestamp, and numeric ranges. These broad validation ranges are not alarm limits or engineering recommendations; actual limits must be set for each motor using its specifications and reviewed by the project supervisor.

## How it fits the project

Each crane can have a local controller and HMI connected to its sensors by wires. The controller sends readings to the backend using a machine ID and motor ID. The HMI can continue to use its local controller if the internet is unavailable. The central website can later request data from the backend to show the selected crane and its motors.

This prototype is bound to `127.0.0.1` and is not designed for internet use. Before connecting a real microcontroller or putting it online, deploy the API on a server with HTTPS, store unique device credentials securely, add engineer login/roles, and use a proper database with backups. Do not put device tokens in the website or commit them to GitHub.
