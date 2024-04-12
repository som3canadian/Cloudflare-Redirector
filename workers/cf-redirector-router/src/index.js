const encoder = new TextEncoder();

addEventListener('fetch', event => {
  event.respondWith(handleAppRequest(event));
});

async function handleAppRequest(event, env) {
  const request = event.request
  const psk = request.headers.get(ROUTER_HEADER_KEY);
  if (! psk) {
    return unauthorizedResponse();
  }
  const timing_result = timingSafeCheck(psk, ROUTER_HEADER_SECRET);
  if (! timing_result) {
    return unauthorizedResponse();
  }
  const authResponse = await AUTH_WORKER.fetch(request.url, {
    method: 'GET',
    headers: {
      AUTH_HEADER_KEY: AUTH_HEADER_SECRET
    }
  });
  const {token} = await authResponse.json();
  // console.log(token);
  return await redirectorRequest(request, token);
  // return new Response('OK', { status: 200 });
}

// https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks
function timingSafeCheck(psk, ROUTER_HEADER_SECRET) {
  const a = encoder.encode(psk);
  const b = encoder.encode(ROUTER_HEADER_SECRET);
  if (a.byteLength !== b.byteLength) { // compare the two strings byte length.
    return false;
  }
  // compare if the two strings are equal
  let isEqual = crypto.subtle.timingSafeEqual(a, b);
  if (! isEqual) {
    return false;
  }
  return true;
}

async function redirectorRequest(request, token) {
  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.delete(ROUTER_HEADER_KEY);
  modifiedHeaders.set("Authorization", `Bearer ${token}`)
  return await REDIRECTOR_WORKER.fetch(request.url, {
    body: request.body,
    method: request.method,
    headers: modifiedHeaders
  });
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({
    "Error": "Unauthorized"
  }, null, 2), {
    status: 401,
    headers: {
      "content-type": "application/json;charset=UTF-8"
    }
  });
}
