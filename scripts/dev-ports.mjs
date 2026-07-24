import net from "node:net";

const ports = [
  { name: "Frontend", value: Number(process.env.FRONTEND_PORT ?? 3100) },
  { name: "Backend API", value: Number(process.env.BACKEND_PORT ?? 5001) },
];

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(false);
      else reject(error);
    });
    server.listen({ port, host: "0.0.0.0", exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

const invalid = ports.filter(({ value }) => !isValidPort(value));
if (invalid.length) {
  for (const item of invalid) process.stderr.write(`${item.name} port is invalid.\n`);
  process.exit(1);
}

const results = await Promise.all(ports.map(async (item) => ({ ...item, available: await portAvailable(item.value) })));
const occupied = results.filter((item) => !item.available);

if (process.argv.includes("--status")) {
  for (const item of results) {
    process.stdout.write(`${item.name} port ${item.value}: ${item.available ? "free" : "listening"}\n`);
  }
  process.exit(0);
}

if (occupied.length) {
  for (const item of occupied) process.stderr.write(`${item.name} port ${item.value} is already occupied.\n`);
  process.stderr.write("Another EduFlow instance may already be running. Stop its root terminal with Ctrl+C, then run npm run dev again.\n");
  process.stderr.write("EduFlow will not stop unknown processes automatically. Run npm run dev:status to check the ports.\n");
  process.exit(1);
}
