(() => {
  const { remote } = require("electron");
  const { app, clipboard } = remote;
  const storage = require("electron-json-storage");
  console.log(storage.getDefaultDataPath());

  const mainForm = document.getElementById("main-form");
  const tokenInput = document.getElementById("token-input");
  const portInput = document.getElementById("port-input");
  const regionSelect = document.getElementById("region-select");
  const switchButton = document.getElementById("switch-button");
  const statusBox = document.getElementById("status-box");
  const statusMessage = document.getElementById("status-message");
  const copyButton = document.getElementById("copy-button");

  (async function loadDefaults() {
    storage.get("config", (err, config) => {
      const { port, token, region } = config;
      portInput.value = port;
      tokenInput.value = token;
      regionSelect.value = region;
    });
  })();

  let appIsStarted = false;
  let controlApp;
  let timeout;

  function displayMessage(msg, delay = 0) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      statusMessage.innerText = msg;
      statusMessage.classList.add("show");
      statusBox.classList.add("show");
    }, delay);
  }

  function clearMessage() {
    clearTimeout(timeout);
    statusMessage.classList.remove("show");
    statusBox.classList.remove("show");
  }

  mainForm.addEventListener("submit", async function start(e) {
    e.preventDefault();
    if (!appIsStarted) {
      switchButton.innerText = "Starting...";
      switchButton.disabled = true;
      displayMessage("Control Host is starting...");

      const port = portInput.value;
      const region = regionSelect.value;
      const token = tokenInput.value;

      storage.set("config", { port, token, region });

      try {
        controlApp = await startApp({ port, token, region });
        displayMessage(`Control Host is live at ${controlApp.url}`);
        copyButton.classList.add("show");
        copyButton.addEventListener("click", (e) => {
          e.preventDefault();
          clipboard.writeText(controlApp.url);
        });
        switchButton.innerText = "Stop";
        switchButton.classList.add("secondary");
        switchButton.disabled = false;
        appIsStarted = true;
      } catch (error) {
        displayMessage(
          "Failed to start Control Server. Try a different port or region."
        );
      }
    } else {
      switchButton.innerText = "Stopping...";
      switchButton.disabled = true;
      displayMessage("Stopping...", 200);
      try {
        await controlApp.close();
        switchButton.innerHTML = "Start";
        switchButton.disabled = false;
        switchButton.classList.remove("secondary");
        clearMessage();
        copyButton.classList.remove("show");
        appIsStarted = false;
      } catch (error) {
        displayMessage("Failed to stop Control Server.");
      }
    }
  });

  app.on("before-quit", async function cleanup(e) {
    if (appIsStarted) {
      e.preventDefault();
      await controlApp.close();
      app.quit();
    }
  });
})();

async function startApp({ port, token, region }) {
  const control = require("./control");

  const server = await startServer({
    port,
    onMessage: async (message) => {
      await control(message.toString());
    },
  });

  const tunnel = await startTunnel({ port, token, region }).catch((error) => {
    server.close();
    throw error;
  });

  async function close() {
    server.close();
    await tunnel.close();
  }
  return { url: tunnel.url, close };
}

async function startTunnel({ port, token, region }) {
  const ngrok = require("ngrok");
  const httpUrl = await ngrok.connect({ authtoken: token, addr: port, region });
  const url = httpUrl.replace("https://", "wss://");

  async function close() {
    await ngrok.disconnect();
    await ngrok.kill();
  }

  return { url, close };
}

function noop() {}

function heartbeat() {
  this.isAlive = true;
}

async function startServer({ port, onMessage }) {
  const { Server } = require("ws");

  const wss = new Server({ port });

  wss.on("listening", async () => {
    console.info(`Control Server running locally on port ${port}`);
  });

  wss.on("connection", (ws) => {
    ws.send("Connected to Control Server");

    ws.on("message", async (message) => {
      // Accepted response
      ws.send(1);
      console.info(`Received: '${message}'`);
      await onMessage(message);
    });

    ws.on("pong", heartbeat);
  });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();

      ws.isAlive = false;
      ws.ping(noop);
    });
  }, 30_000);

  wss.on("close", () => {
    clearInterval(pingInterval);
  });

  const close = () => wss.close();

  return { close };
}
