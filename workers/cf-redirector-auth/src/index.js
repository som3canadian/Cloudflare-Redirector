import {sign} from '@tsndr/cloudflare-worker-jwt'
const encoder = new TextEncoder();

async function handleAuthRequest(request, env) {
  const headerValue = request.headers.get(env.AUTH_HEADER_KEY);
  if (! headerValue) {
    return unauthorizedResponse();
  }
  const timing_result = timingSafeCheck(headerValue, env);
  if (! timing_result) {
    return unauthorizedResponse();
  }
  const token = await sign({
    data: 'authorized'
  }, env.JWT_SECRET, {expiresIn: '1h'});
  return new Response(JSON.stringify({token}), {status: 200});
}

// https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks
function timingSafeCheck(headerValue, env) {
  const a = encoder.encode(headerValue);
  const b = encoder.encode(env.AUTH_HEADER_SECRET);
  if (a.byteLength !== b.byteLength) { // compare byte length of the two strings.
    return false;
  }
  // compare if the two strings are equal
  let isEqual = crypto.subtle.timingSafeEqual(a, b);
  if (! isEqual) {
    return false;
  }
  return true;
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
    return handleAuthRequest(request, env);
  }
};