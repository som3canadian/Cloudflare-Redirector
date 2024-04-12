import { verify } from '@tsndr/cloudflare-worker-jwt'

addEventListener('fetch', event => {
	event.respondWith(handleRedirectorRequest(event));
});

async function handleRedirectorRequest(event) {
	const req = event.request;
	const PRESHARED_ID_HEADER = req.headers.get(ID_HEADER);
	if (!PRESHARED_ID_HEADER) {
		return unauthorizedResponse();
	}
	const LISTEN_ENDPOINT_VAR = setDestUrl(PRESHARED_ID_HEADER);
	const workerURL = new URL(req.url);
  const WORKER_ENDPOINT = workerURL.origin + "/";
  // console.log(WORKER_ENDPOINT);
	const newPath = req.url.replace(WORKER_ENDPOINT, "");
  const newDestUrl = LISTEN_ENDPOINT_VAR + newPath;
	// console.log(newDestUrl);
	// Extract token from the Authorization header
	const bearer_token = req.headers.get('Authorization')?.replace('Bearer ', '');
	if (!bearer_token) {
		return unauthorizedResponse();
	}
	const isValid = await verify(bearer_token, JWT_SECRET);
	if (isValid) {
		// console.log(bearer_token);
		// send the request to the listener
		const listener_response = await listenerRequest(req, newDestUrl);
		return listener_response;
	}
	else {
		return unauthorizedResponse();
	}
}

async function listenerRequest(req, newDestUrl) {
  const newModifiedHeaders = new Headers(req.headers);
  newModifiedHeaders.set("CF-Access-Client-Id", SERVICE_CF_ID);
  newModifiedHeaders.set("CF-Access-Client-Secret", SERVICE_CF_SECRET);

  const thisModifiedRequest = new Request(newDestUrl, {
    body: req.body,
    headers: newModifiedHeaders,
    method: req.method
  });
  const resp = await fetch(thisModifiedRequest);
  return resp
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ "Error": "Unauthorized" }, null, 2), {
    status: 401,
    headers: { "content-type": "application/json;charset=UTF-8" }
  });
}
