
function relay(source, destination) {
  source.addEventListener("message", (event) => {
    // Check if destination is still open before sending
    if (destination.readyState === 1) {
      destination.send(event.data);
    }
  });

  source.addEventListener("close", () => {
    if (destination.readyState === 1) {
      destination.close();
    }
  });

  source.addEventListener("error", (err) => {
    // Only log actual errors, not connection closures
    console.error("WebSocket error:", err);
    if (destination.readyState === 1) {
      destination.close();
    }
  });
}

async function handleSession(workerSocket, env, requestPath, userAgent) {
  // Track connection state
  let connectionActive = true;
  let lastActivityTimestamp = Date.now();
  let destInactiveTimeout = setDestInactiveTimeout(env, requestPath) || 20000;
  const INACTIVE_TIMEOUT = destInactiveTimeout;
	const CHECK_INTERVAL = INACTIVE_TIMEOUT / 2;

  const targetUrl = setDestUrl(env, requestPath);
  const targetUserAgent = setDestUserAgent(env, requestPath);
  // verify user-agent
  if (userAgent !== targetUserAgent) {
    return new Response("Sorry, bad request", { status: 400 });
  }

  try {
    // Prepare the request with the necessary Upgrade header.
    const targetRequest = new Request(targetUrl, {
      headers: {
        Upgrade: "websocket",
        "User-Agent": targetUserAgent,
        "CF-Access-Client-Id": env.SERVICE_CF_ID_WS,
        "CF-Access-Client-Secret": env.SERVICE_CF_SECRET_WS,
      },
    });

    // Initiate the connection.
    const targetResponse = await fetch(targetRequest);
    const targetSocket = targetResponse.webSocket;
    if (!targetSocket) {
      let responseText = "";
      try {
        responseText = await targetResponse.text();
        // console.log("Response body:", responseText);
      } catch (e) {
        console.log("Could not read response body:", e);
      }

      throw new Error(`Target did not return a websocket. Status: ${targetResponse.status}`);
    }

    targetSocket.accept();

    // Set up connection tracking
    workerSocket.addEventListener("close", () => {
      connectionActive = false;
    });

    targetSocket.addEventListener("close", () => {
      connectionActive = false;
    });

    // Update activity timestamp on any message
    workerSocket.addEventListener("message", () => {
      lastActivityTimestamp = Date.now();
    });

    targetSocket.addEventListener("message", () => {
      lastActivityTimestamp = Date.now();
    });

    // Set up inactivity checker
    const intervalId = setInterval(() => {
      if (!connectionActive) {
        clearInterval(intervalId);
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastActivityTimestamp > INACTIVE_TIMEOUT) {
        console.log("Closing inactive connection");
        connectionActive = false;

        if (workerSocket.readyState === 1) {
          workerSocket.close(1000, "Connection timeout due to inactivity");
        }

        if (targetSocket.readyState === 1) {
          targetSocket.close(1000, "Connection timeout due to inactivity");
        }

        clearInterval(intervalId);
      }
    }, CHECK_INTERVAL);

    // Relay messages between the workerSocket and targetSocket.
    relay(workerSocket, targetSocket);
    relay(targetSocket, workerSocket);
  } catch (err) {
    console.error("Error in handleSession:", err);
    if (workerSocket.readyState === 1) { // 1 = OPEN
      workerSocket.close(1011, "Internal error");
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const userAgent = request.headers.get("User-Agent");
		const requestPath = request.url.split("/").pop();
    // console.log("user-agent", userAgent);
    // console.log("request-path", requestPath);
    // Only proceed if this is a websocket upgrade request.
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Sorry, bad request", { status: 400 });
    }

    // Create a pair of WebSocket connections.
    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const workerSocket = pair[1];

    workerSocket.accept();

    // Asynchronously handle the session.
    ctx.waitUntil(handleSession(workerSocket, env, requestPath, userAgent));

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    });
  }
};