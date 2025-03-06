import {verify} from '@tsndr/cloudflare-worker-jwt'

async function handleRedirectorRequest(request, env) {
  const PRESHARED_ID_HEADER = request.headers.get(env.ID_HEADER);
  if (! PRESHARED_ID_HEADER) {
    return unauthorizedResponse();
  }
  const LISTEN_ENDPOINT_VAR = setDestUrl(PRESHARED_ID_HEADER, env);
  const workerURL = new URL(request.url);
  const WORKER_ENDPOINT = workerURL.origin + "/";
  // console.log(WORKER_ENDPOINT);
  const newPath = request.url.replace(WORKER_ENDPOINT, "");
  const newDestUrl = LISTEN_ENDPOINT_VAR + newPath;
  // console.log(newDestUrl);
  // Extract token from the Authorization header
  const bearer_token = request.headers.get('Authorization') ?. replace('Bearer ', '');
  if (! bearer_token) {
    return unauthorizedResponse();
  }
  const isValid = await verify(bearer_token, env.JWT_SECRET);
  if (isValid) {
    // console.log(bearer_token);
    // send the request to the listener
    const listener_response = await listenerRequest(request, newDestUrl, env);
    return listener_response;
  } else {
    return unauthorizedResponse();
  }
}

async function listenerRequest(request, newDestUrl, env) {
  const newModifiedHeaders = new Headers(request.headers);
  newModifiedHeaders.set("CF-Access-Client-Id", env.SERVICE_CF_ID);
  newModifiedHeaders.set("CF-Access-Client-Secret", env.SERVICE_CF_SECRET);
  const thisModifiedRequest = new Request(newDestUrl, {
    body: request.body,
    headers: newModifiedHeaders,
    method: request.method
  });
  const resp = await fetch(thisModifiedRequest);
  return resp
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