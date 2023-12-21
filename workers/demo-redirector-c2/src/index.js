const PRESHARED_AUTH_HEADER_KEY = "X-Header"

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event));
})

async function handleRequest(event, env) {
  const request = event.request
  const path = request.url.replace(WORKER_ENDPOINT,"")
  const destUrl = LISTEN_ENDPOINT + path
  // console.log(destUrl);

  // Fetch value of our custom header
  const psk = request.headers.get(PRESHARED_AUTH_HEADER_KEY)

  // Check header matches a predetermiend value
  if (psk === CUSTOM_HEADER) {
    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set("CF-Access-Client-Id", SERVICE_CF_ID);
    modifiedHeaders.set("CF-Access-Client-Secret", SERVICE_CF_SECRET);
    // Send received request on to C2 server
    const modifiedRequest = new Request(destUrl, {
      body: request.body,
      headers: modifiedHeaders,
      method: request.method
    });

    const resp = await fetch(modifiedRequest);
    return resp
  } else {
    // Error if the header doesn't match
    return new Response(JSON.stringify(
        {
          "Error" : "Authentication Failure."
        }, null, 2),
        {
          status: 401,
          headers: {
            "content-type": "application/json;charset=UTF-8"
          }
        }
    )
  }
}