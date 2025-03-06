const encoder = new TextEncoder();

async function handleAppRequest(request, env) {
  const psk = request.headers.get(env.ROUTER_HEADER_KEY);
  if (! psk) {
    return unauthorizedResponse();
  }
  const timing_result = timingSafeCheck(psk, env);
  if (! timing_result) {
    return unauthorizedResponse();
  }
  const authModifiedHeaders = new Headers(request.headers);
  authModifiedHeaders.set(env.AUTH_HEADER_KEY, env.AUTH_HEADER_SECRET);
  const authResponse = await env.AUTH_WORKER.fetch(request.url, {
    method: 'GET',
    headers: authModifiedHeaders
  });
  const {token} = await authResponse.json();
  // console.log(token);
  return await redirectorRequest(request, token, env);
  // return new Response('OK', { status: 200 });
}

// https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks
function timingSafeCheck(psk, env) {
  const a = encoder.encode(psk);
  const b = encoder.encode(env.ROUTER_HEADER_SECRET);
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

async function redirectorRequest(request, token, env) {
  const modifiedHeaders = new Headers(request.headers);
  modifiedHeaders.delete(env.ROUTER_HEADER_KEY);
  modifiedHeaders.set("Authorization", `Bearer ${token}`)
  // console.log(token);
  return await env.REDIRECTOR_WORKER.fetch(request.url, {
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

export default {
  async fetch(request, env, ctx) {
    return await handleAppRequest(request, env);
  }
};